from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict
import requests
import os
import json
import time
import uuid as _uuid
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
import psycopg2

load_dotenv()

from persist import (
    log_message,
    log_llm_call,
    log_error,
    new_trace_id,
)
from volume_uploader import upload_kakao_photo, volume_enabled, PHOTO_VOLUME_PATH

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
ALERT_EMAIL = os.getenv("ALERT_EMAIL")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
RAILWAY_DATABASE_URL = os.getenv("RAILWAY_DATABASE_URL")
ASSET_BASE_URL = (
    os.getenv("ASSET_BASE_URL")
    or os.getenv("RAILWAY_PUBLIC_DOMAIN")
    or "https://chatbot-production-367e8.up.railway.app"
).rstrip("/")
if not ASSET_BASE_URL.startswith(("http://", "https://")):
    ASSET_BASE_URL = f"https://{ASSET_BASE_URL}"

app = FastAPI()


from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as _StarRequest
from starlette.responses import Response as _StarResponse
from contextvars import ContextVar

# 현재 webhook 요청의 trace_id / user_id 컨텍스트.
# webhook 진입부에서 set 하고 미들웨어가 outbound 로그에 쓴다.
_current_trace_id: ContextVar[str | None] = ContextVar("chatbot_trace_id", default=None)
_current_user_id: ContextVar[str | None] = ContextVar("chatbot_user_id", default=None)


class OutboundLogMiddleware(BaseHTTPMiddleware):
    """webhook 응답 body 를 chatbot_messages 에 outbound 로 1건 저장."""

    async def dispatch(self, request: _StarRequest, call_next):
        response = await call_next(request)
        if request.url.path != "/webhook":
            return response
        try:
            body_chunks: list[bytes] = []
            async for chunk in response.body_iterator:
                body_chunks.append(chunk)
            body = b"".join(body_chunks)
            try:
                parsed = json.loads(body.decode("utf-8")) if body else None
            except Exception:
                parsed = None
            tid = _current_trace_id.get()
            uid = _current_user_id.get() or "unknown"
            log_message(
                trace_id=_uuid.UUID(tid) if tid else new_trace_id(),
                user_id=uid,
                direction="outbound",
                raw_body=parsed,
                mode="webhook_sync",
            )
            return _StarResponse(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[outbound log middleware error] {e}")
            return response


app.add_middleware(OutboundLogMiddleware)


if os.path.isdir("gems"):
    app.mount("/gems", StaticFiles(directory="gems"), name="gems")

# Volume 마운트 디렉터리가 있으면 /photos 로 서빙. 카카오 webhook 에서 받은 사진을
# 여기 저장하고 chatbot 도메인 + /photos/<key> URL 로 다시 노출.
if PHOTO_VOLUME_PATH:
    try:
        os.makedirs(PHOTO_VOLUME_PATH, exist_ok=True)
        app.mount("/photos", StaticFiles(directory=PHOTO_VOLUME_PATH), name="photos")
    except Exception as e:  # noqa: BLE001
        print(f"[photo volume mount error] {e}")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[unhandled error] {exc}")
    log_error(source="global_handler", message=str(exc), exc=exc,
              context={"path": str(request.url.path)})
    return JSONResponse(
        status_code=200,
        content={
            "version": "2.0",
            "template": {
                "outputs": [{"simpleText": {"text": "잠시 오류가 발생했어요. 다시 시도해주세요!"}}],
                "quickReplies": [
                    {"label": "단순 모드", "action": "message", "messageText": "단순모드"},
                    {"label": "대화 모드", "action": "message", "messageText": "대화모드"},
                    {"label": "오늘 기록", "action": "message", "messageText": "오늘 기록"},
                    {"label": "오늘 분석", "action": "message", "messageText": "오늘 분석"},
                ],
            },
        },
    )

pending_photo: dict = {}
pending_gem: dict = {}
pending_emotion_selection: dict = {}
user_last_active: dict = {}  # {user_id: date(KST)}
pending_simple_record: dict = {}  # {user_id: True} 단순모드 여부
pending_reflection: dict = {}  # {user_id: {question_id, question_text, stage, linked_date}}
today_record_count_cache: dict[str, tuple[date, int]] = {}
today_gem_count_cache: dict[str, tuple[date, int]] = {}
today_pending_record_cache: dict[str, list[dict[str, object]]] = {}

PHOTO_TIMEOUT = timedelta(minutes=10)
ANALYSIS_RECORD_CACHE_TTL = timedelta(minutes=10)
reflection_schema_ready = False


def _today_kst() -> date:
    return datetime.now(tz=ZoneInfo("Asia/Seoul")).date()


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _safe_count(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _get_today_cache(cache: dict[str, tuple[date, int]], user_id: str) -> int:
    item = cache.get(user_id)
    if not isinstance(item, tuple) or len(item) != 2:
        cache.pop(user_id, None)
        return 0
    cached_day, cached_count = item
    if cached_day != _today_kst():
        cache.pop(user_id, None)
        return 0
    return _safe_count(cached_count)


def _set_today_cache(cache: dict[str, tuple[date, int]], user_id: str, count: int) -> int:
    safe_count = _safe_count(count)
    cache[user_id] = (_today_kst(), safe_count)
    return safe_count


def _remember_today_pending_record(
    user_id: str,
    gem: str,
    record_text: str | None,
    has_photo: bool = False,
    image_url: str | None = None,
    trace_id: _uuid.UUID | None = None,
) -> None:
    """DB background save가 끝나기 전 '오늘 기록/분석'이 바로 눌려도 방금 기록을 포함한다."""
    if not user_id:
        return
    now = datetime.now(tz=ZoneInfo("Asia/Seoul"))
    cutoff = now - ANALYSIS_RECORD_CACHE_TTL
    records = [
        item for item in today_pending_record_cache.get(user_id, [])
        if isinstance(item.get("saved_at"), datetime)
        and item["saved_at"] >= cutoff
        and item["saved_at"].date() == now.date()
    ]
    records.append({
        "saved_at": now,
        "gem": str(gem or ""),
        "record_text": str(record_text or ""),
        "has_photo": bool(has_photo),
        "image_url": str(image_url or ""),
        "trace_id": str(trace_id or ""),
    })
    today_pending_record_cache[user_id] = records[-30:]


def _merge_today_analysis_records(user_id: str, rows: list[tuple[str, str | None]]) -> list[tuple[str, str]]:
    merged = [(str(gem or ""), str(record_text or "")) for gem, record_text in rows]
    db_counts = Counter(merged)
    cache_counts: Counter[tuple[str, str]] = Counter()
    now = datetime.now(tz=ZoneInfo("Asia/Seoul"))
    cutoff = now - ANALYSIS_RECORD_CACHE_TTL
    fresh_cache = []
    for item in today_pending_record_cache.get(user_id, []):
        saved_at = item.get("saved_at")
        if not isinstance(saved_at, datetime):
            continue
        if saved_at < cutoff or saved_at.date() != now.date():
            continue
        gem = str(item.get("gem") or "")
        record_text = str(item.get("record_text") or "")
        record = (str(gem or ""), str(record_text or ""))
        cache_counts[record] += 1
        if cache_counts[record] <= db_counts[record]:
            continue
        fresh_cache.append(item)
        merged.append(record)
    if fresh_cache:
        today_pending_record_cache[user_id] = fresh_cache
    else:
        today_pending_record_cache.pop(user_id, None)
    return merged


def _merge_today_display_records(user_id: str, records: list[dict]) -> list[dict]:
    db_records = [
        {
            "gem": str(record.get("gem") or ""),
            "record_text": str(record.get("record_text") or ""),
            "has_photo": bool(record.get("has_photo")),
            "image_url": str(record.get("image_url") or ""),
            "saved_time": str(record.get("saved_time") or ""),
            "trace_id": str(record.get("trace_id") or ""),
        }
        for record in records
    ]
    db_counts = Counter(
        (
            record["trace_id"],
            record["gem"],
            record["record_text"],
            record["has_photo"],
            record["image_url"],
        )
        for record in db_records
    )
    cache_counts: Counter[tuple[str, str, str, bool, str]] = Counter()
    pending_records = []
    now = datetime.now(tz=ZoneInfo("Asia/Seoul"))
    cutoff = now - ANALYSIS_RECORD_CACHE_TTL
    fresh_cache = []
    for item in today_pending_record_cache.get(user_id, []):
        saved_at = item.get("saved_at")
        if not isinstance(saved_at, datetime):
            continue
        if saved_at < cutoff or saved_at.date() != now.date():
            continue
        key = (
            str(item.get("trace_id") or ""),
            str(item.get("gem") or ""),
            str(item.get("record_text") or ""),
            bool(item.get("has_photo")),
            str(item.get("image_url") or ""),
        )
        cache_counts[key] += 1
        if cache_counts[key] <= db_counts[key]:
            continue
        fresh_cache.append(item)
        pending_records.append({
            "gem": key[1],
            "record_text": key[2],
            "has_photo": key[3],
            "image_url": key[4],
            "saved_time": saved_at.strftime("%H:%M"),
            "trace_id": key[0],
        })
    if fresh_cache:
        today_pending_record_cache[user_id] = fresh_cache
    else:
        today_pending_record_cache.pop(user_id, None)
    return _group_today_display_records(pending_records + db_records)[:9]


def _today_display_group_key(record: dict) -> tuple:
    trace_id = str(record.get("trace_id") or "")
    if trace_id:
        return (
            "trace",
            trace_id,
            str(record.get("record_text") or ""),
            bool(record.get("has_photo")),
            str(record.get("image_url") or ""),
        )
    return (
        "content",
        str(record.get("saved_time") or ""),
        str(record.get("record_text") or ""),
        bool(record.get("has_photo")),
        str(record.get("image_url") or ""),
    )


def _group_today_display_records(records: list[dict]) -> list[dict]:
    grouped_records: list[dict] = []
    group_index: dict[tuple, dict] = {}
    for record in records:
        key = _today_display_group_key(record)
        existing = group_index.get(key)
        if not existing:
            merged = dict(record)
            merged["gems"] = [str(record.get("gem") or "")]
            group_index[key] = merged
            grouped_records.append(merged)
            continue
        gem = str(record.get("gem") or "")
        if gem and gem not in existing["gems"]:
            existing["gems"].append(gem)
        if not existing.get("image_url") and record.get("image_url"):
            existing["image_url"] = str(record.get("image_url") or "")
        existing["has_photo"] = bool(existing.get("has_photo")) or bool(record.get("has_photo"))
    return grouped_records


def _josa_eul(word: str) -> str:
    """받침 있으면 '을', 없으면 '를'"""
    if not word:
        return "을"
    code = ord(word[-1]) - 0xAC00
    if code < 0 or code >= 11172:
        return "를"
    return "을" if code % 28 != 0 else "를"

def _josa_i(word: str) -> str:
    """받침 있으면 '이', 없으면 '가'"""
    if not word:
        return "이"
    code = ord(word[-1]) - 0xAC00
    if code < 0 or code >= 11172:
        return "가"
    return "이" if code % 28 != 0 else "가"


def send_alert_email(subject: str, body: str):
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = ALERT_EMAIL
        msg["To"] = ALERT_EMAIL
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(ALERT_EMAIL, GMAIL_APP_PASSWORD)
            server.send_message(msg)
    except Exception as e:
        print(f"[email error] {e}")


def is_image_url(text: str) -> bool:
    if " " in text or "\n" in text:
        return False
    return text.startswith("http") and any(
        ext in text.lower() for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]
    )


def is_video_url(text: str) -> bool:
    if not text or " " in text or "\n" in text:
        return False
    if not text.startswith("http"):
        return False
    lowered = text.lower()
    video_exts = (".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".3gp")
    if any(ext in lowered for ext in video_exts):
        return True
    if "talk.kakaocdn.net" in lowered and "/video" in lowered:
        return True
    if "kakaocdn.net" in lowered and "videoplay" in lowered:
        return True
    return False


def is_audio_url(text: str) -> bool:
    if not text or " " in text or "\n" in text:
        return False
    if not text.startswith("http"):
        return False
    lowered = text.lower()
    audio_exts = (".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus", ".amr", ".flac")
    if any(ext in lowered for ext in audio_exts):
        return True
    if "talk.kakaocdn.net" in lowered and "/audio" in lowered:
        return True
    if "kakaocdn.net" in lowered and "audioplay" in lowered:
        return True
    return False


def _db_get_today_count(user_id: str) -> int:
    """오늘(KST) 채집한 원석 수 (일상/단순기록 제외). 에러 시 0 반환."""
    if not RAILWAY_DATABASE_URL:
        return 0
    today = _today_kst()
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) FROM chatbot
            WHERE user_id = %s
              AND gem NOT IN ('일상기록', '단순기록')
              AND (created_at AT TIME ZONE 'Asia/Seoul')::date = %s
            """,
            (user_id, today),
        )
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        return int(count)
    except Exception as e:
        print(f"[_db_get_today_count error] {e}")
        return 0


def _db_get_today_record_count(user_id: str) -> int:
    """오늘(KST) 저장된 전체 기록 수. 에러 시 0 반환."""
    if not RAILWAY_DATABASE_URL:
        return 0
    today = _today_kst()
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) FROM chatbot
            WHERE user_id = %s
              AND (created_at AT TIME ZONE 'Asia/Seoul')::date = %s
            """,
            (user_id, today),
        )
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        return int(count)
    except Exception as e:
        print(f"[_db_get_today_record_count error] {e}")
        return 0


def _reserve_today_record_count(user_id: str, increment: int = 1) -> int:
    """응답 시점의 '오늘 n번째 기록' 번호를 예약한다."""
    base_count = max(
        _db_get_today_record_count(user_id),
        _get_today_cache(today_record_count_cache, user_id),
    )
    return _set_today_cache(today_record_count_cache, user_id, base_count + _safe_count(increment))


def _reserve_today_gem_count(user_id: str, increment: int = 1) -> int:
    """백그라운드 저장 전에도 오늘 누적 원석 번호가 이어지도록 예약한다."""
    base_count = max(
        _db_get_today_count(user_id),
        _get_today_cache(today_gem_count_cache, user_id),
    )
    return _set_today_cache(today_gem_count_cache, user_id, base_count + _safe_count(increment))


EMOTION_TO_GEM = {
    "우울함": "우울함 조각", "외로움": "외로움 조각", "상실감": "상실감 조각",
    "서러움": "서러움 조각", "실망감": "실망감 조각",
    "걱정": "걱정 조각", "긴장감": "긴장감 조각", "위축감": "위축감 조각",
    "초조": "초조 조각", "공포": "공포 조각",
    "짜증": "짜증 조각", "억울함": "억울함 조각", "화남": "화남 조각", "적대감": "적대감 조각",
    "경멸": "경멸 조각",
    "즐거움": "즐거움 조각", "감사함": "감사함 조각", "설렘": "설렘 조각",
    "뿌듯함": "뿌듯함 조각", "편안함": "편안함 조각",
    "무기력함": "무기력함 조각", "공허함": "공허함 조각", "후회": "후회 조각",
    "부끄러움": "부끄러움 조각", "혼란스러움": "혼란스러움 조각",
}
GEM_TO_EMOTION = {v: k for k, v in EMOTION_TO_GEM.items()}

# gems 테이블에 저장할 때 사용. 일상기록은 매핑 없음(제외).
CHATBOT_GEM_TO_EMOTION_CODE: dict[str, str] = {
    # 기쁨/긍정 계열
    "뿌듯함 조각": "pride",        # 황수정
    "즐거움 조각": "joy",          # 루비
    "감사함 조각": "satisfaction",  # 앰버
    "설렘 조각": "flutter",        # 로즈쿼츠
    "편안함 조각": "serenity",     # 아쿠아마린
    # 슬픔 계열
    "우울함 조각": "sadness",      # 사파이어
    "외로움 조각": "sadness",
    "상실감 조각": "sadness",
    "서러움 조각": "sadness",
    "실망감 조각": "sadness",
    # 분노 계열
    "짜증 조각": "annoyance",     # 가넷
    "억울함 조각": "annoyance",
    "화남 조각": "annoyance",
    "적대감 조각": "annoyance",
    "경멸 조각": "annoyance",
    # 불안/두려움 계열
    "걱정 조각": "solace",        # 오팔
    "긴장감 조각": "solace",
    "위축감 조각": "solace",
    "초조 조각": "solace",
    "공포 조각": "solace",
    # 복잡/모호 계열
    "무기력함 조각": "untroubled", # 월장석
    "공허함 조각": "solace",      # 오팔
    "후회 조각": "regret",        # 연수정
    "부끄러움 조각": "regret",
    "혼란스러움 조각": "regret",
}

EMOTION_CATEGORIES = {
    "슬픔 계열": ["우울함", "외로움", "상실감", "서러움", "실망감"],
    "불안/두려움 계열": ["걱정", "긴장감", "위축감", "초조", "공포"],
    "분노 계열": ["짜증", "억울함", "화남", "적대감", "경멸"],
    "기쁨/긍정 계열": ["즐거움", "감사함", "설렘", "뿌듯함", "편안함"],
    "복잡/모호 계열": ["무기력함", "공허함", "후회", "부끄러움", "혼란스러움"],
}

EMOTION_TO_REFLECTION_CATEGORY = {
    emotion: category.replace(" 계열", "").replace("/두려움", "").replace("/모호", "")
    for category, emotions in EMOTION_CATEGORIES.items()
    for emotion in emotions
}
GEM_TO_REFLECTION_CATEGORY = {
    EMOTION_TO_GEM[emotion]: category
    for emotion, category in EMOTION_TO_REFLECTION_CATEGORY.items()
}
POSITIVE_REFLECTION_CATEGORY = "기쁨/긍정"

NEGATIVE_GEMS = {
    EMOTION_TO_GEM[e]
    for cat, emotions in EMOTION_CATEGORIES.items()
    if cat != "기쁨/긍정 계열"
    for e in emotions
}


DANGER_KEYWORDS = [
    "죽고싶", "죽고 싶", "자살", "자해", "사라지고싶", "사라지고 싶",
    "없어지고싶", "없어지고 싶", "살기싫", "살기 싫", "죽어버리고싶", "끝내고싶",
]
HARMFUL_KEYWORDS = [
    "섹스", "야동", "포르노", "성인물", "성인 영상", "성인사이트", "성인 사이트",
    "씨발", "개새끼", "죽여", "죽일", "살인",
    "협박", "폭행", "강간", "테러",
]
DANGER_MESSAGE = (
    "많이 힘드시겠어요. 혼자 감당하기 어려운 감정이 느껴질 때는 도움을 받을 수 있어요.\n\n"
    "📞 자살예방상담전화: 1393 (24시간)\n"
    "📞 정신건강위기상담전화: 1577-0199 (24시간)\n\n"
    "당신의 이야기를 들어줄 사람이 있어요. 꼭 전화해보세요."
)
HARMFUL_MESSAGE = "해당 기록은 서비스 정책에 따라 채집이 어려워요. 일상 속 소중한 순간을 담아 다시 보내주세요."
VIDEO_NOT_SUPPORTED_MESSAGE = (
    "영상으로 마음을 담아주셨네요. \n\n"
    "아직은 영상을 함께 들여다보지는 못해요. \n"
    "대신 한 줄 글이나 사진으로 적어주시면\n"
    "오늘의 감정 원석을 같이 찾아드릴게요. ✨"
)
AUDIO_NOT_SUPPORTED_MESSAGE = (
    "음성으로 마음을 담아주셨네요. \n\n"
    "아직은 음성을 함께 들여다보지는 못해요. \n"
    "대신 한 줄 글이나 사진으로 적어주시면\n"
    "오늘의 감정 원석을 같이 찾아드릴게요. ✨"
)

WEB_URL = "https://frontend-production-09f81.up.railway.app/login"
_IMG_BASE = f"{ASSET_BASE_URL}/gems/"
DEFAULT_CARD_IMAGE = _IMG_BASE + "default.png"
ALL_GEMS_IMAGE = _IMG_BASE + "all_gems.png"
MASCOT_IMAGE = DEFAULT_CARD_IMAGE
SIMPLE_MODE_IMAGE = _IMG_BASE + "simple_mode.png"
CONVERSATION_MODE_IMAGE = _IMG_BASE + "conversation_mode.png"
TODAY_RECORDS_IMAGE = _IMG_BASE + "today_records.png"
TODAY_ANALYSIS_IMAGE = _IMG_BASE + "today_analysis.png"
FIND_EMOTION_IMAGE = _IMG_BASE + "find_emotion.png"
MULTI_EMOTION_IMAGE = _IMG_BASE + "multi_emotion.png"
CATEGORY_IMAGE_URL = {
    "슬픔 계열": _IMG_BASE + "category_sadness.png",
    "불안/두려움 계열": _IMG_BASE + "category_anxiety.png",
    "분노 계열": _IMG_BASE + "category_anger.png",
    "기쁨/긍정 계열": _IMG_BASE + "category_positive.png",
    "복잡/모호 계열": _IMG_BASE + "category_complex.png",
}
GEM_CATEGORY_IMAGE_URL = {
    EMOTION_TO_GEM[emotion]: CATEGORY_IMAGE_URL[category]
    for category, emotions in EMOTION_CATEGORIES.items()
    for emotion in emotions
}
GEM_IMAGE_URL = {
    "우울함 조각":   _IMG_BASE + "depression.png",
    "외로움 조각":   _IMG_BASE + "loneliness.png",
    "상실감 조각":   _IMG_BASE + "loss.png",
    "서러움 조각":   _IMG_BASE + "sorrow.png",
    "실망감 조각":   _IMG_BASE + "disappointment.png",
    "걱정 조각":     _IMG_BASE + "worry.png",
    "긴장감 조각":   _IMG_BASE + "tension.png",
    "위축감 조각":   _IMG_BASE + "timidity.png",
    "초조 조각":     _IMG_BASE + "nervousness.png",
    "공포 조각":     _IMG_BASE + "fear.png",
    "짜증 조각":     _IMG_BASE + "irritation.png",
    "억울함 조각":   _IMG_BASE + "resentment.png",
    "화남 조각":     _IMG_BASE + "anger.png",
    "적대감 조각":   _IMG_BASE + "hostility.png",
    "경멸 조각":     _IMG_BASE + "contempt.png",
    "즐거움 조각":   _IMG_BASE + "joy.png",
    "감사함 조각":   _IMG_BASE + "gratitude.png",
    "설렘 조각":     _IMG_BASE + "flutter.png",
    "뿌듯함 조각":   _IMG_BASE + "pride.png",
    "편안함 조각":   _IMG_BASE + "serenity.png",
    "무기력함 조각": _IMG_BASE + "lethargy.png",
    "공허함 조각":   _IMG_BASE + "emptiness.png",
    "후회 조각":     _IMG_BASE + "regret.png",
    "부끄러움 조각": _IMG_BASE + "shame.png",
    "혼란스러움 조각": _IMG_BASE + "confusion.png",
}


def _gem_save_image_url(gem: str) -> str:
    return GEM_CATEGORY_IMAGE_URL.get(gem, DEFAULT_CARD_IMAGE)


def _thumbnail(url: str | None) -> dict:
    return {"thumbnail": {"imageUrl": url}} if url else {}

BASE_QUICK_REPLIES = [
    {"label": "단순 모드", "action": "message", "messageText": "단순모드"},
    {"label": "대화 모드", "action": "message", "messageText": "대화모드"},
    {"label": "오늘 기록", "action": "message", "messageText": "오늘 기록"},
    {"label": "오늘 분석", "action": "message", "messageText": "오늘 분석"},
]

SAVE_QUICK_REPLIES = [
    {"label": "맞아요", "action": "message", "messageText": "맞아요"},
    {"label": "다시 찾을게요", "action": "message", "messageText": "다시 찾을게요"},
    {"label": "내 원석 보기", "action": "message", "messageText": "내 원석"},
    {"label": "원석 도감", "action": "message", "messageText": "도감"},
]


CATEGORY_QUICK_REPLIES = [
    {"label": cat, "action": "message", "messageText": cat}
    for cat in EMOTION_CATEGORIES.keys()
]

RETRY_QUICK_REPLIES = [
    {"label": "다시 시도 🔄", "action": "message", "messageText": "다시 시도"},
    {"label": "내 원석 보기", "action": "message", "messageText": "내 원석"},
    {"label": "원석 도감", "action": "message", "messageText": "도감"},
]

DAILY_QUICK_REPLIES = [
    {"label": "그대로 저장하기", "action": "message", "messageText": "그대로 저장하기"},
    {"label": "감정 선택하기", "action": "message", "messageText": "감정 선택하기"},
]

DAILY_SAVE_COMPLETE_QUICK_REPLIES = [
    {"label": "단순 모드", "action": "message", "messageText": "단순모드"},
    {"label": "대화 모드", "action": "message", "messageText": "대화모드"},
    {"label": "저장된 일상 기록 보기", "action": "message", "messageText": "저장된 일상 기록 보기"},
]

MULTI_EMOTION_QUICK_REPLIES = [
    {"label": "모두 채집", "action": "message", "messageText": "모두 채집"},
    {"label": "골라서 채집", "action": "message", "messageText": "골라서 채집"},
]

PHOTO_QUICK_REPLIES = [
    {"label": "감정 적기", "action": "message", "messageText": "감정 적기"},
    {"label": "일상으로 저장", "action": "message", "messageText": "일상으로 저장"},
]

EMOTION_QUICK_REPLIES = [
    {"label": e, "action": "message", "messageText": e}
    for e in EMOTION_TO_GEM.keys()
]

REFLECTION_INVITE_QUICK_REPLIES = [
    {"label": "건너뛰기", "action": "message", "messageText": "건너뛰기"},
]

REFLECTION_QUESTION_QUICK_REPLIES = [
    {"label": "답할게요", "action": "message", "messageText": "답할게요"},
    {"label": "건너뛸게요", "action": "message", "messageText": "건너뛸게요"},
]

REFLECTION_ANSWER_QUICK_REPLIES = [
    {"label": "건너뛰기", "action": "message", "messageText": "건너뛰기"},
]

INITIAL_REFLECTION_QUESTIONS = [
    ("Q_SAD_01", "슬픔", "이 감정이 느껴졌던 순간, 어떤 상황이었나요?"),
    ("Q_SAD_02", "슬픔", "그 순간 혼자였나요, 누군가와 함께였나요?"),
    ("Q_ANG_01", "분노", "그 순간 막히거나 답답했던 게 있었나요?"),
    ("Q_ANG_02", "분노", "그 상황에서 내가 원했던 게 뭔지 떠올려볼 수 있나요?"),
    ("Q_ANX_01", "불안", "이 감정이 느껴졌을 때 몸이 어떤 상태였나요?"),
    ("Q_ANX_02", "불안", "무엇이 걱정됐는지 한 가지만 떠올려볼 수 있나요?"),
    ("Q_COM_01", "복잡", "이 감정을 한 단어로 표현하면 뭐가 떠오르나요?"),
    ("Q_GEN_01", "general", "오늘 기록한 감정이 느껴졌던 순간, 어떤 상황이었나요?"),
    ("Q_GEN_02", "general", "그 순간을 지금 다시 떠올리면 어떤 느낌인가요?"),
    ("Q_GEN_03", "general", "오늘 이 감정 말고 다른 감정도 느꼈나요?"),
]


def _call_openai_chat(
    prompt: str,
    max_tokens: int = 50,
    log_prefix: str = "classify_emotion",
    *,
    trace_id: _uuid.UUID | None = None,
    user_id: str | None = None,
    call_type: str | None = None,
) -> dict | None:
    """OpenAI chat 호출. trace_id 가 있으면 매 시도마다 chatbot_llm_calls 기록."""
    effective_trace_id = trace_id or new_trace_id()
    effective_call_type = call_type or log_prefix
    for attempt in range(1, 3):
        started = time.monotonic()
        try:
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0,
                },
                timeout=30.0,
            )
            latency_ms = int((time.monotonic() - started) * 1000)
            try:
                data = response.json()
            except ValueError:
                data = None

            if response.status_code == 200 and data and "choices" in data:
                log_llm_call(
                    trace_id=effective_trace_id, user_id=user_id,
                    call_type=effective_call_type, model=OPENAI_MODEL, prompt=prompt,
                    raw_response=data,
                    parsed_result=(data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()[:2000],
                    status="ok", status_code=response.status_code,
                    latency_ms=latency_ms, attempt=attempt,
                )
                return data

            print(f"[{log_prefix} status] attempt={attempt} status={response.status_code}")
            print(f"[{log_prefix} body] {response.text[:1000]}")
            log_llm_call(
                trace_id=effective_trace_id, user_id=user_id,
                call_type=effective_call_type, model=OPENAI_MODEL, prompt=prompt,
                raw_response=data, parsed_result=None,
                status="http_error", status_code=response.status_code,
                error_text=response.text[:2000],
                latency_ms=latency_ms, attempt=attempt,
            )
            if attempt < 2 and response.status_code in {408, 409, 429, 500, 502, 503, 504}:
                time.sleep(attempt)
                continue
            return None
        except requests.exceptions.Timeout as e:
            latency_ms = int((time.monotonic() - started) * 1000)
            print(f"[{log_prefix} timeout] attempt={attempt}")
            log_llm_call(
                trace_id=effective_trace_id, user_id=user_id,
                call_type=effective_call_type, model=OPENAI_MODEL, prompt=prompt,
                raw_response=None, parsed_result=None,
                status="timeout", error_text=str(e),
                latency_ms=latency_ms, attempt=attempt,
            )
            if attempt < 2:
                time.sleep(attempt)
                continue
            return None
        except requests.exceptions.RequestException as e:
            latency_ms = int((time.monotonic() - started) * 1000)
            print(f"[{log_prefix} request error] attempt={attempt} error={e}")
            log_llm_call(
                trace_id=effective_trace_id, user_id=user_id,
                call_type=effective_call_type, model=OPENAI_MODEL, prompt=prompt,
                raw_response=None, parsed_result=None,
                status="request_error", error_text=str(e),
                latency_ms=latency_ms, attempt=attempt,
            )
            if attempt < 2:
                time.sleep(attempt)
                continue
            return None

    return None


TYPO_NORMALIZATION = {
    "힘덜어": "힘들어",
    "힘덜다": "힘들다",
    "힘덜었어": "힘들었어",
    "힘덜어요": "힘들어요",
    "힘덜어서": "힘들어서",
    "힘덜었어요": "힘들었어요",
    "힘덜었는데": "힘들었는데",
    "힘덜어도": "힘들어도",
}


def normalize_text_for_classification(text: str) -> str:
    normalized = text or ""
    for typo, fixed in TYPO_NORMALIZATION.items():
        normalized = normalized.replace(typo, fixed)
    return normalized


def classify_emotion(
    text: str,
    *,
    trace_id: _uuid.UUID | None = None,
    user_id: str | None = None,
) -> list[str] | str | None:
    emotion_list = ", ".join(EMOTION_TO_GEM.keys())
    normalized_text = normalize_text_for_classification(text)
    prompt = (
        "다음 입력을 세 가지로 분류해줘.\n"
        "1. 인사말만 있거나 감정/일상 내용이 없으면: '기록아님'만 답해\n"
        "2. 일상 사실만 나열되고 감정이 전혀 느껴지지 않으면(예: '수업 들었어', '밥 먹었어', '회사 갔다왔어'): '일상기록'만 답해\n"
        "3. 감정이 담긴 기록이면: 아래 감정 목록 중 해당하는 단어로 답해줘\n"
        "   감정 단어가 직접 등장하지 않아도 문장의 맥락과 뉘앙스에서 감정이 느껴지면 추론해서 답해줘.\n"
        "   (예: '드디어 배가 나아졌어' → 편안함, '오늘 발표 잘 끝났다' → 뿌듯함, '기다리던 택배 왔다' → 설렘)\n"
        "   '행복하다', '좋다', '기분 좋다', '신난다'는 즐거움으로 분류해.\n"
        "   '힘들다', '힘들어'는 단순 사실이 아니라 감정/상태 표현으로 보고 문맥에 따라 무기력함, 걱정, 후회 등으로 분류해.\n"
        "   예: '지금 너무 많이 먹어서 행복하고 힘들어' → 즐거움, 무기력함\n"
        "   '눈물이 날 것 같다', '울컥하다'는 우울함보다 서러움 후보로 우선 검토해.\n"
        "   '뒤처진 것 같다', '나만 못한 것 같다', '내가 작아진다'는 위축감 후보로 우선 검토해.\n"
        "   '마음이 무겁다', '가라앉는다'는 걱정보다 우울함/공허함 후보로 우선 검토해.\n"
        "   '안 괜찮다', '괜찮다고 했지만 사실 아니다'는 서러움/우울함 후보로 검토해.\n"
        "   '억울함'은 부당함, 왜 나만, 내 잘못이 아닌데 같은 단서가 있을 때만 선택해.\n"
        "   '하찮게 느껴진다', '깔보게 된다', '정떨어진다', '한심하다'는 경멸 후보로 검토해.\n"
        "   '조마조마하다', '안절부절못하다', '가만히 못 있겠다'는 초조 후보로 검토해.\n"
        "   음식, 구매, 방문처럼 하고 싶은 일을 말하며 '먹을까?', '갈까?', '살까?'처럼 망설이는 표현은 명확한 불안 단서가 없으면 초조/걱정으로 분류하지 마.\n"
        "   예: '곱창먹고 싶어!! 혼자라도 가서 먹을까?' → 초조 제외, 기대나 욕구가 뚜렷하면 설렘만 검토하고 감정이 약하면 일상기록.\n"
        "   '무섭다', '두렵다', '공포스럽다', '겁난다'는 공포 후보로 검토해.\n"
        "   '창피하다', '민망하다', '쪽팔리다'는 부끄러움 후보로 검토해.\n"
        "   '뭐가 뭔지 모르겠다', '머리가 복잡하다', '갈피를 못 잡겠다'는 혼란스러움 후보로 검토해.\n"
        "4. 사용자 문장에는 오타, 받침 실수, 음절 치환이 있을 수 있어. 명백한 오타는 문맥상 자연스러운 한국어로 보정해서 해석해.\n"
        "   예: '힘덜어'는 '힘들어'로 해석해.\n"
        f"감정 목록: {emotion_list}\n"
        "여러 감정이 담겨있으면 쉼표로만 구분해서 최대 3개까지만 답해줘. "
        "감정이 하나라면 단어 하나만 답해줘. 다른 말은 절대 하지 마.\n\n"
        f"원문 입력: {text}\n"
        f"오타 보정 참고 입력: {normalized_text}"
    )
    if not OPENAI_API_KEY:
        print("[classify_emotion config error] OPENAI_API_KEY is not configured")
        log_error(source="classify_emotion", message="OPENAI_API_KEY not configured",
                  trace_id=trace_id, user_id=user_id)
        return "TIMEOUT"

    try:
        data = _call_openai_chat(prompt, trace_id=trace_id, user_id=user_id,
                                 call_type="classify")
        if not data:
            return "TIMEOUT"
        raw = data["choices"][0]["message"]["content"].strip()
        print(f"[classify_emotion raw] {raw}")
        if "기록아님" in raw:
            return "NOT_RECORD"
        if "일상기록" in raw:
            return "DAILY_RECORD"
        valid_gem_names = set(EMOTION_TO_GEM.values())
        found = [g for g in valid_gem_names if g in raw]
        if not found:
            found = [EMOTION_TO_GEM[e] for e in EMOTION_TO_GEM if e in raw]
        return found if found else None
    except Exception as e:
        print(f"[classify_emotion error] {e}")
        log_error(source="classify_emotion", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)
        return None


def _classification_to_text(result: list[str] | str | None) -> str:
    if isinstance(result, list):
        return ", ".join(result)
    if result == "NOT_RECORD":
        return "기록아님"
    if result == "DAILY_RECORD":
        return "일상기록"
    if result == "TIMEOUT":
        return "TIMEOUT"
    if result is None:
        return "None"
    return str(result)


def _parse_supervisor_corrected_result(raw: str) -> list[str] | str | None:
    if not raw:
        return None
    if "기록아님" in raw:
        return "NOT_RECORD"
    if "일상기록" in raw:
        return "DAILY_RECORD"

    valid_gems = set(EMOTION_TO_GEM.values())
    found = [gem for gem in valid_gems if gem in raw]
    if found:
        return found[:3]

    emotion_found = [EMOTION_TO_GEM[emotion] for emotion in EMOTION_TO_GEM if emotion in raw]
    return emotion_found[:3] if emotion_found else None


def supervisor_check_classification(
    text: str,
    initial_result: list[str] | str | None,
    *,
    trace_id: _uuid.UUID | None = None,
    user_id: str | None = None,
) -> list[str] | str | None:
    if initial_result == "TIMEOUT" or initial_result is None:
        return initial_result
    if os.getenv("SUPERVISOR_ENABLED", "true").lower() in {"0", "false", "no", "off"}:
        return initial_result
    if not OPENAI_API_KEY:
        return initial_result

    emotion_list = ", ".join(EMOTION_TO_GEM.keys())
    gem_list = ", ".join(EMOTION_TO_GEM.values())
    initial_text = _classification_to_text(initial_result)
    normalized_text = normalize_text_for_classification(text)
    prompt = (
        "너는 감정 기록 챗봇의 Supervisor 검증 노드다.\n"
        "목표: 사용자 발화가 챗봇 시나리오 goal에 맞게 분류됐는지 검증한다.\n\n"
        "시나리오 goal:\n"
        "1. 인사말, 명령, 의미 없는 말처럼 기록할 감정/일상이 없으면 '기록아님'.\n"
        "2. 일상 사실은 있지만 감정이 거의 드러나지 않으면 '일상기록'.\n"
        "3. 감정이 드러나면 허용된 감정 또는 원석 중 최대 3개를 선택한다.\n\n"
        f"허용 감정: {emotion_list}\n"
        f"허용 원석: {gem_list}\n"
        f"사용자 발화: {text}\n"
        f"오타 보정 참고 발화: {normalized_text}\n"
        f"1차 분류 결과: {initial_text}\n\n"
        "검증 기준:\n"
        "- 사용자 발화에는 오타, 받침 실수, 음절 치환이 있을 수 있다. 예: '힘덜어'는 문맥상 '힘들어'로 본다.\n"
        "- '행복하다', '좋다', '기분 좋다', '신난다'는 즐거움 감정 단서로 본다.\n"
        "- '힘들다', '힘들어'는 단순 사실이 아니라 감정/상태 표현으로 보고 문맥에 따라 무기력함, 걱정, 후회 등으로 검토한다.\n"
        "- 예: '지금 너무 많이 먹어서 행복하고 힘들어'는 감정 맥락이 있으므로 즐거움과 무기력함 후보를 검토한다.\n"
        "- '눈물이 날 것 같다', '울컥하다'는 우울함보다 서러움 후보로 우선 검토한다.\n"
        "- '뒤처진 것 같다', '나만 못한 것 같다', '내가 작아진다'는 위축감 후보로 우선 검토한다.\n"
        "- '마음이 무겁다', '가라앉는다'는 걱정보다 우울함/공허함 후보로 우선 검토한다.\n"
        "- '억울함'은 부당함, 왜 나만, 내 잘못이 아닌데 같은 단서가 있을 때만 선택한다.\n"
        "- 경멸은 하찮게 느낌, 깔봄, 정떨어짐, 한심함 단서가 있을 때 검토한다.\n"
        "- 초조는 조마조마함, 안절부절못함, 가만히 못 있겠음 단서가 있을 때 검토한다.\n"
        "- 음식, 구매, 방문처럼 하고 싶은 일을 말하며 '먹을까?', '갈까?', '살까?'처럼 망설이는 표현은 명확한 불안 단서가 없으면 초조/걱정으로 분류하지 않는다.\n"
        "- 예: '곱창먹고 싶어!! 혼자라도 가서 먹을까?'는 초조를 제외하고, 기대나 욕구가 뚜렷하면 설렘만 검토하며 감정이 약하면 일상기록으로 본다.\n"
        "- 공포는 무서움, 두려움, 공포스러움, 겁남 단서가 있을 때 검토한다.\n"
        "- 부끄러움은 창피함, 민망함, 쪽팔림 단서가 있을 때 검토한다.\n"
        "- 혼란스러움은 뭐가 뭔지 모름, 머리가 복잡함, 갈피를 못 잡음 단서가 있을 때 검토한다.\n"
        "- 발화에 감정 맥락이 있는데 '일상기록' 또는 '기록아님'으로 빠졌는지 확인한다.\n"
        "- 단순 사실 나열인데 감정 원석으로 과잉 분류했는지 확인한다.\n"
        "- 허용 목록 밖의 값은 실패로 본다.\n"
        "- 애매하면 사용자에게 감정을 더 물어볼 수 있도록 '일상기록'을 선택한다.\n\n"
        "반드시 JSON만 답해라. 예시:\n"
        "{\"pass\": false, \"corrected_result\": \"일상기록\", \"reason\": \"감정 단서가 약함\"}"
    )

    try:
        data = _call_openai_chat(prompt, max_tokens=180, log_prefix="supervisor",
                                 trace_id=trace_id, user_id=user_id,
                                 call_type="supervisor")
        if not data:
            return initial_result

        raw = data["choices"][0]["message"]["content"].strip()
        print(f"[supervisor raw] {raw}")
        try:
            review = json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find("{")
            end = raw.rfind("}")
            review = json.loads(raw[start:end + 1]) if start >= 0 and end > start else {}

        corrected = _parse_supervisor_corrected_result(str(review.get("corrected_result", "")))
        if not corrected:
            return initial_result

        pass_value = review.get("pass")
        passed = pass_value is True or str(pass_value).lower() == "true"
        if not passed and corrected != initial_result:
            print(f"[supervisor corrected] {initial_text} -> {_classification_to_text(corrected)} reason={review.get('reason', '')}")
            return corrected
        return initial_result
    except Exception as e:
        print(f"[supervisor error] {e}")
        log_error(source="supervisor", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)
        return initial_result


def classify_emotion_with_supervisor(
    text: str,
    *,
    trace_id: _uuid.UUID | None = None,
    user_id: str | None = None,
) -> list[str] | str | None:
    initial_result = classify_emotion(text, trace_id=trace_id, user_id=user_id)
    return supervisor_check_classification(text, initial_result,
                                           trace_id=trace_id, user_id=user_id)


def save_gem(
    user_id: str,
    gem: str,
    record_text: str,
    has_photo: bool,
    image_url: str = None,
    ai_gems: str = None,
    *,
    trace_id: _uuid.UUID | None = None,
):
    """chatbot 행 1건 INSERT + (가능하면) gems 동기화 + S3 사진 업로드.

    image_url 인자는 호출자가 갖고 있는 '현재 가장 최신' URL.
    pending_photo 단계에서 이미 S3 로 올라간 경우 → 이미 S3 URL.
    아직 안 올라간 경우 → 카카오 CDN URL → 여기서 업로드 시도.
    """
    if not RAILWAY_DATABASE_URL:
        print("[save_gem railway error] RAILWAY_DATABASE_URL is not configured")
        log_error(source="save_gem", message="RAILWAY_DATABASE_URL not configured",
                  trace_id=trace_id, user_id=user_id)
        return

    kakao_image_url: str | None = None
    persisted_image_url = image_url
    if has_photo and image_url and not _is_persisted_url(image_url):
        kakao_image_url = image_url
        public_url, err = upload_kakao_photo(
            kakao_url=image_url,
            provider_user_key=user_id,
            message_id=None,
        )
        if public_url:
            persisted_image_url = public_url
        else:
            log_error(source="save_gem.photo_upload",
                      message=err or "unknown photo upload error",
                      trace_id=trace_id, user_id=user_id,
                      context={"kakao_url": image_url})

    conn = None
    cur = None
    inserted_id: int | None = None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        emotion_code = CHATBOT_GEM_TO_EMOTION_CODE.get(gem)
        cur.execute(
            "INSERT INTO chatbot "
            "(user_id, gem, record_text, has_photo, image_url, ai_gems, kakao_image_url, trace_id, "
            "ai_emotion_code, confirmed_emotion_code, confirmed_emotion_codes) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb) RETURNING id",
            (
                user_id,
                gem,
                record_text,
                has_photo,
                persisted_image_url,
                ai_gems,
                kakao_image_url,
                str(trace_id) if trace_id else None,
                emotion_code,
                emotion_code,
                json.dumps([emotion_code]) if emotion_code else None,
            ),
        )
        inserted_id = cur.fetchone()[0]

        # gems 테이블에도 INSERT → 인벤토리 "광물" 탭에 표시
        if emotion_code:
            cur.execute(
                "SELECT id FROM users WHERE provider_user_key = %s LIMIT 1",
                (user_id,),
            )
            user_row = cur.fetchone()
            if user_row:
                user_uuid = user_row[0]
                cur.execute(
                    "INSERT INTO gems (user_id, emotion_code, tier, source, source_chatbot_id) "
                    "VALUES (%s, %s, 1, %s, %s)",
                    (user_uuid, emotion_code, "chatbot", inserted_id),
                )
                print(f"[save_gem] synced to gems table: user={user_uuid}, emotion={emotion_code}")
            else:
                print(f"[save_gem] no user found for provider_user_key={user_id}, skipping gems insert")

        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[save_gem railway error] {e}")
        log_error(source="save_gem", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id,
                  context={"gem": gem, "has_photo": has_photo})
        if cur is not None:
            try:
                cur.close()
            except Exception:
                pass
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def save_simple_record_with_classification(
    user_id: str,
    record_text: str,
    has_photo: bool,
    image_url: str | None = None,
    *,
    trace_id: _uuid.UUID | None = None,
):
    """단순모드 기록도 응답만 줄이고 저장값은 대화모드처럼 AI 분류해서 남긴다."""
    if not (record_text or image_url):
        return

    result = classify_emotion_with_supervisor(record_text or "", trace_id=trace_id, user_id=user_id)
    valid_gems: list[str] = []
    if isinstance(result, list):
        valid_gems = [gem for gem in result if gem in EMOTION_TO_GEM.values()]

    if valid_gems:
        ai_gems = ",".join(valid_gems)
        for gem in valid_gems:
            save_gem(
                user_id,
                gem,
                record_text,
                has_photo,
                image_url,
                ai_gems,
                trace_id=trace_id,
            )
        return

    save_gem(
        user_id,
        "일상기록",
        record_text,
        has_photo,
        image_url,
        None,
        trace_id=trace_id,
    )


def _is_persisted_url(url: str | None) -> bool:
    """이미 PHOTO_PUBLIC_BASE_URL prefix 인 경우 True (재업로드 방지)."""
    if not url:
        return False
    from volume_uploader import PHOTO_PUBLIC_BASE_URL
    return bool(PHOTO_PUBLIC_BASE_URL) and url.startswith(PHOTO_PUBLIC_BASE_URL)


def _ensure_reflection_schema() -> bool:
    global reflection_schema_ready
    if reflection_schema_ready:
        return True
    if not RAILWAY_DATABASE_URL:
        print("[reflection schema] RAILWAY_DATABASE_URL is not configured")
        return False

    conn = None
    cur = None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS questions (
                question_id VARCHAR PRIMARY KEY,
                category VARCHAR NOT NULL,
                question_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category)")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS questions_log (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR NOT NULL,
                question_id VARCHAR NOT NULL,
                asked_date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (user_id, asked_date)
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_questions_log_user_date ON questions_log(user_id, asked_date)")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR,
                created_at TIMESTAMP DEFAULT NOW()
            )
            """
        )
        cur.execute("ALTER TABLE records ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'record'")
        cur.execute("ALTER TABLE records ADD COLUMN IF NOT EXISTS question_id VARCHAR NULL")
        cur.execute("ALTER TABLE records ADD COLUMN IF NOT EXISTS question_text TEXT NULL")
        cur.execute("ALTER TABLE records ADD COLUMN IF NOT EXISTS answer_text TEXT NULL")
        cur.execute("ALTER TABLE records ADD COLUMN IF NOT EXISTS linked_date DATE NULL")
        cur.execute("ALTER TABLE records ADD COLUMN IF NOT EXISTS week_id VARCHAR NULL")
        cur.executemany(
            """
            INSERT INTO questions (question_id, category, question_text)
            VALUES (%s, %s, %s)
            ON CONFLICT (question_id) DO NOTHING
            """,
            INITIAL_REFLECTION_QUESTIONS,
        )
        conn.commit()
        reflection_schema_ready = True
        return True
    except Exception as e:
        print(f"[reflection schema error] {e}")
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return False
    finally:
        if cur is not None:
            try:
                cur.close()
            except Exception:
                pass
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _normalize_reflection_category(emotion: str = "", emotion_category: str = "") -> str:
    category = (emotion_category or "").strip()
    if category:
        category = category.replace(" 계열", "").replace("/두려움", "").replace("/모호", "")
        if category.startswith("기쁨"):
            return POSITIVE_REFLECTION_CATEGORY
        return category

    if emotion in EMOTION_TO_REFLECTION_CATEGORY:
        return EMOTION_TO_REFLECTION_CATEGORY[emotion]
    if emotion in GEM_TO_REFLECTION_CATEGORY:
        return GEM_TO_REFLECTION_CATEGORY[emotion]
    gem = EMOTION_TO_GEM.get(emotion)
    if gem and gem in GEM_TO_REFLECTION_CATEGORY:
        return GEM_TO_REFLECTION_CATEGORY[gem]
    return "general"


def _select_reflection_question(user_id: str, category: str) -> dict | None:
    if not _ensure_reflection_schema():
        return None

    today = _today_kst()
    week_start = _week_start(today)
    next_week_start = week_start + timedelta(days=7)
    week_ago = today - timedelta(days=6)
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT 1
            FROM questions_log
            WHERE user_id = %s
              AND asked_date >= %s
              AND asked_date < %s
            LIMIT 1
            """,
            (user_id, week_start, next_week_start),
        )
        if cur.fetchone():
            return None

        for target_category in (category, "general"):
            cur.execute(
                """
                SELECT question_id, question_text
                FROM questions
                WHERE category = %s
                  AND question_id NOT IN (
                      SELECT question_id
                      FROM questions_log
                      WHERE user_id = %s AND asked_date >= %s
                  )
                ORDER BY question_id
                LIMIT 1
                """,
                (target_category, user_id, week_ago),
            )
            row = cur.fetchone()
            if row:
                question_id, question_text = row
                cur.execute(
                    """
                    INSERT INTO questions_log (user_id, question_id, asked_date)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, asked_date) DO NOTHING
                    """,
                    (user_id, question_id, today),
                )
                if cur.rowcount != 1:
                    conn.rollback()
                    return None
                conn.commit()
                return {"question_id": str(question_id), "question_text": str(question_text)}

        conn.rollback()
        return None
    except Exception as e:
        print(f"[select reflection question error] {e}")
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return None
    finally:
        if cur is not None:
            try:
                cur.close()
            except Exception:
                pass
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _has_negative_reflection_trigger(user_id: str, current_gem: str) -> bool:
    if not RAILWAY_DATABASE_URL or current_gem not in NEGATIVE_GEMS:
        return False

    today = _today_kst()
    week_start = _week_start(today)
    current_category = GEM_TO_REFLECTION_CATEGORY.get(current_gem)
    if not current_category:
        return False

    conn = None
    cur = None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT gem, (created_at AT TIME ZONE 'Asia/Seoul')::date AS day
            FROM chatbot
            WHERE user_id = %s
              AND gem != '일상기록'
              AND gem != '단순기록'
              AND (created_at AT TIME ZONE 'Asia/Seoul')::date >= %s
            ORDER BY created_at
            """,
            (user_id, today - timedelta(days=60)),
        )
        rows = cur.fetchall()
    except Exception as e:
        print(f"[_has_negative_reflection_trigger error] {e}")
        return False
    finally:
        if cur is not None:
            try:
                cur.close()
            except Exception:
                pass
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    history = [
        (gem, day, GEM_TO_REFLECTION_CATEGORY.get(gem))
        for gem, day in rows
        if gem in NEGATIVE_GEMS and GEM_TO_REFLECTION_CATEGORY.get(gem)
    ]

    if not any(category == current_category and day >= week_start for _, day, category in history):
        return True

    negative_days = {day for _, day, _ in history}
    negative_days.add(today)
    if all((today - timedelta(days=i)) in negative_days for i in range(3)):
        return True

    previous_category_days = [
        day for _, day, category in history
        if category == current_category and day < today
    ]
    if previous_category_days and (today - max(previous_category_days)).days >= 7:
        return True

    return False


def check_reflection_question(
    user_id: str,
    emotion: str = "",
    emotion_category: str = "",
    text_length: int = 0,
    record_mode: str = "대화모드",
) -> dict:
    if record_mode != "대화모드":
        return {"should_ask": False}

    category = _normalize_reflection_category(emotion, emotion_category)
    gem = EMOTION_TO_GEM.get(emotion, emotion)
    if text_length > 30 or gem not in NEGATIVE_GEMS or category == POSITIVE_REFLECTION_CATEGORY:
        return {"should_ask": False}
    if not _has_negative_reflection_trigger(user_id, gem):
        return {"should_ask": False}

    question = _select_reflection_question(user_id, category)
    if not question:
        return {"should_ask": False}
    return {"should_ask": True, **question}


def save_reflection_answer(user_id: str, answer_text: str, question_id: str, question_text: str, linked_date: date | None = None) -> bool:
    if not answer_text:
        return False
    if not _ensure_reflection_schema():
        return False

    linked = linked_date or _today_kst()
    iso = linked.isocalendar()
    week_id = f"{iso.year}-W{iso.week:02d}"
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO records (user_id, type, question_id, question_text, answer_text, linked_date, week_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (user_id, "reflection", question_id, question_text, answer_text, linked, week_id),
        )
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[save reflection error] {e}")
        return False
    finally:
        if cur is not None:
            try:
                cur.close()
            except Exception:
                pass
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _maybe_attach_reflection_invite(response: dict, user_id: str, gem: str, record_text: str) -> dict:
    record_mode = "단순모드" if pending_simple_record.get(user_id) else "대화모드"
    emotion = GEM_TO_EMOTION.get(gem, gem)
    result = check_reflection_question(
        user_id=user_id,
        emotion=emotion,
        emotion_category=GEM_TO_REFLECTION_CATEGORY.get(gem, ""),
        text_length=len(str(record_text or "").strip()),
        record_mode=record_mode,
    )
    if not result.get("should_ask"):
        return response

    pending_reflection[user_id] = {
        "question_id": result["question_id"],
        "question_text": result["question_text"],
        "stage": "awaiting_answer",
        "linked_date": _today_kst(),
    }
    response.setdefault("template", {}).setdefault("outputs", []).append(
        {"simpleText": {"text": (
            "방금 느낀 감정을 조금만 더 자세히 알려주세요 💭\n"
            "언제 어떤 기분이 들었나요?\n\n"
            "당장 적어주지 않아도 돼요.\n"
            "준비가 되었다면 지금 감정을 편하게 한 문장 적어주세요.\n\n"
            "이 글은 아무도 보지 않으니, 그냥 툭 여기에 기록해보아요 👻"
        )}}
    )
    response["template"]["quickReplies"] = REFLECTION_INVITE_QUICK_REPLIES
    return response


def _safe_pending_reflection(user_id: str) -> dict | None:
    data = pending_reflection.get(user_id)
    if not isinstance(data, dict) or not data.get("question_id") or not data.get("question_text"):
        pending_reflection.pop(user_id, None)
        return None
    return data


def _truncate_text(text: str | None, limit: int = 180) -> str:
    value = " ".join(str(text or "").split())
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def _extract_payload_value(body, key: str) -> str:
    if not isinstance(body, dict):
        return ""
    value = body.get(key)
    if value is not None:
        return str(value).strip()

    action = body.get("action")
    if isinstance(action, dict):
        params = action.get("params")
        if isinstance(params, dict) and params.get(key) is not None:
            return str(params.get(key)).strip()

    contexts = body.get("contexts")
    if isinstance(contexts, list):
        for context in contexts:
            if not isinstance(context, dict):
                continue
            params = context.get("params")
            if isinstance(params, dict) and params.get(key) is not None:
                return str(params.get(key)).strip()
    return ""



def get_gem_stats(user_id: str) -> tuple[int, int]:
    """(오늘 채집 수, 전체 채집 수) — 일상/단순기록 제외"""
    today_count = _db_get_today_count(user_id)
    total_count = 0
    if RAILWAY_DATABASE_URL:
        try:
            conn = psycopg2.connect(RAILWAY_DATABASE_URL)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM chatbot WHERE user_id = %s AND gem NOT IN ('일상기록', '단순기록')", (user_id,))
            total_count = cur.fetchone()[0]
            cur.close()
            conn.close()
        except Exception as e:
            print(f"[get_gem_stats error] {e}")
    else:
        print("[get_gem_stats railway error] RAILWAY_DATABASE_URL is not configured")
    return today_count, total_count


def kakao_response(text: str, show_emotion_buttons: bool = False, hide_buttons: bool = False, show_save_button: bool = False, custom_replies: list = None) -> dict:
    result = {"version": "2.0", "template": {"outputs": [{"simpleText": {"text": text}}]}}
    if not hide_buttons:
        if custom_replies is not None:
            result["template"]["quickReplies"] = custom_replies
        elif show_save_button:
            result["template"]["quickReplies"] = SAVE_QUICK_REPLIES
        elif show_emotion_buttons:
            result["template"]["quickReplies"] = EMOTION_QUICK_REPLIES
        else:
            result["template"]["quickReplies"] = BASE_QUICK_REPLIES
    return result


def _extract_kakao_request(body) -> tuple[str, str, str | None]:
    if not isinstance(body, dict):
        return "unknown", "", None

    user_request = body.get("userRequest")
    if not isinstance(user_request, dict):
        return "unknown", "", None

    user = user_request.get("user")
    if not isinstance(user, dict):
        user = {}

    user_id = str(user.get("id") or "unknown")
    raw_utterance = user_request.get("utterance")
    utterance = "" if raw_utterance is None else str(raw_utterance).strip()

    raw_callback_url = user_request.get("callbackUrl")
    callback_url = str(raw_callback_url).strip() if raw_callback_url else None
    return user_id, utterance, callback_url


def _compact_command_text(value: str | None) -> str:
    return "".join(str(value or "").split())


def _matches_command(value: str | None, *commands: str) -> bool:
    compact_value = _compact_command_text(value)
    return compact_value in {_compact_command_text(command) for command in commands}


def _safe_pending_gem(user_id: str, require_text: bool = False) -> dict | None:
    data = pending_gem.get(user_id)
    if not isinstance(data, dict):
        pending_gem.pop(user_id, None)
        return None
    if require_text and not data.get("text"):
        pending_gem.pop(user_id, None)
        return None
    return data


def _safe_pending_emotion_selection(user_id: str) -> dict | None:
    data = pending_emotion_selection.get(user_id)
    if not isinstance(data, dict) or not isinstance(data.get("emotions"), list):
        pending_emotion_selection.pop(user_id, None)
        return None
    if not data.get("text"):
        pending_emotion_selection.pop(user_id, None)
        return None
    return data


def _multi_emotion_selection_replies(sel: dict) -> list:
    selected = sel.get("selected_emotions")
    if not isinstance(selected, list):
        selected = []
    remaining = [e for e in sel["emotions"] if e not in selected]
    replies = [{"label": e, "action": "message", "messageText": e} for e in remaining]
    if selected:
        replies.append({"label": "완료하기", "action": "message", "messageText": "완료하기"})
    return replies


def _multi_emotion_selection_text(sel: dict) -> str:
    selected = sel.get("selected_emotions")
    if not isinstance(selected, list):
        selected = []
    if selected:
        selected_names = ", ".join(selected)
        return f"{selected_names}을 선택했어요.\n더 저장할 감정이 있으면 골라주세요."
    return "저장할 감정을 골라주세요."


def _safe_pending_photo(user_id: str) -> tuple[bool, list[str], datetime | None]:
    data = pending_photo.get(user_id)
    if not isinstance(data, dict):
        pending_photo.pop(user_id, None)
        return False, [], None

    photo_time = data.get("time")
    # "urls" 필드(신규) 또는 "url" 필드(하위 호환)
    urls: list[str] = data.get("urls") or ([data["url"]] if data.get("url") else [])
    if not isinstance(photo_time, datetime) or not urls:
        pending_photo.pop(user_id, None)
        return False, [], None

    if datetime.now() - photo_time > PHOTO_TIMEOUT:
        pending_photo.pop(user_id, None)
        return False, [], None

    return True, [str(u) for u in urls], photo_time


def kakao_save_complete(gem: str, today_count: int, user_id: str = "", alert_msg: str = "") -> dict:
    display = gem
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    description = (
        f"오늘 {today_count}번째 원석이에요!\n"
        "아래 웹 사이트에서 수집한 조각 기록들을 더 자세히 살펴 볼 수 있어요."
    )
    if alert_msg:
        description += f"\n\n{alert_msg.lstrip()}"
    card = {
        "title": f"{display}{_josa_eul(display)} 수집했어요!",
        "description": description,
        "buttons": [{"action": "webLink", "label": "조각 기록들 살펴보기", "webLinkUrl": link_url}],
    }
    card.update(_thumbnail(_gem_save_image_url(gem)))
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"basicCard": card}],
            "quickReplies": BASE_QUICK_REPLIES,
        },
    }


def kakao_multi_save_complete(gems: list[str], today_count: int, user_id: str = "", alert_msg: str = "") -> dict:
    saved_names = ", ".join(gems)
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    description = (
        f"오늘 {today_count}번째 원석이에요!\n"
        "아래 웹 사이트에서 수집한 조각 기록들을 더 자세히 살펴 볼 수 있어요."
    )
    if alert_msg:
        description += f"\n\n{alert_msg.lstrip()}"
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"basicCard": {
                "title": f"{saved_names}{_josa_eul(saved_names)} 수집했어요!",
                "description": description,
                "thumbnail": {"imageUrl": MULTI_EMOTION_IMAGE},
                "buttons": [{"action": "webLink", "label": "조각 기록들 살펴보기", "webLinkUrl": link_url}],
            }}],
            "quickReplies": BASE_QUICK_REPLIES,
        },
    }


def kakao_gem_save_complete(gems: list[str], today_count: int, user_id: str = "", alert_msg: str = "") -> dict:
    if len(gems) == 1:
        return kakao_save_complete(gems[0], today_count, user_id, alert_msg)
    return kakao_multi_save_complete(gems, today_count, user_id, alert_msg)


def kakao_daily_save_complete(user_id: str = "") -> dict:
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"basicCard": {
                "title": "소중한 일상을 저장했어요!",
                "description": (
                    "챗봇을 통한 감정 수집 없이 가벼운 일상 기록을 원한다면,\n"
                    "아래 ‘단순 모드’ 버튼을 눌러주세요.\n\n"
                    "단순 모드에서 언제든 모드를 전환해 챗봇과 감정 수집이 가능해요."
                ),
                "thumbnail": {"imageUrl": MASCOT_IMAGE},
                "buttons": [{"action": "webLink", "label": "저장된 일상 기록 보기", "webLinkUrl": link_url}],
            }}],
            "quickReplies": DAILY_SAVE_COMPLETE_QUICK_REPLIES,
        },
    }


DAILY_RECORD_MESSAGE = (
    "소중한 일상 기록을 확인했어요!\n\n"
    "이 순간 느낀 반짝이는 감정이 있었나요?\n"
    "아래 감정 버튼을 눌러 일상에 감정원석을 함께 저장할 수 있어요.\n\n"
    "감정없이 소중한 일상으로 바로 기록해도 좋아요."
)


def _build_ai_response(user_id: str, utterance: str, has_photo: bool, image_url: str | None, result) -> dict:
    pending_photo.pop(user_id, None)
    if result == "NOT_RECORD":
        pending_gem.pop(user_id, None)
        pending_emotion_selection.pop(user_id, None)
        return {
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "여기서는 기록을 통해 감정 원석을 채집할 수 있어요.",
                    "description": "오늘 있었던 일이나 지금 느끼는 마음을 적어봐요.",
                    "thumbnail": {"imageUrl": MASCOT_IMAGE},
                    "buttons": [
                        {"action": "webLink", "label": "웹 방문하기", "webLinkUrl": WEB_URL},
                    ],
                }}],
                "quickReplies": BASE_QUICK_REPLIES,
            },
        }
    if result == "DAILY_RECORD":
        pending_gem.pop(user_id, None)
        pending_emotion_selection.pop(user_id, None)
        pending_gem[user_id] = {"gem": None, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": None, "daily": True}
        return kakao_response(
            DAILY_RECORD_MESSAGE,
            custom_replies=DAILY_QUICK_REPLIES
        )
    if result == "TIMEOUT":
        pending_emotion_selection.pop(user_id, None)
        pending_gem[user_id] = {"gem": None, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": None, "retry": True}
        return kakao_response(
            "현재 세공소에 광물이 몰려 분류에 시간이 조금 걸리고 있어요!\n잠시 후 다시 시도해볼까요? 🛠️",
            custom_replies=RETRY_QUICK_REPLIES
        )

    if result is None:
        pending_emotion_selection.pop(user_id, None)
        pending_gem[user_id] = {"gem": None, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": None, "retry": True}
        return kakao_response(
            "잠시 오류가 발생했어요.\n잠시 후 다시 시도해볼까요? 🛠️",
            custom_replies=RETRY_QUICK_REPLIES
        )

    VALID_GEMS = set(EMOTION_TO_GEM.values())
    valid_gems = [g for g in result if g in VALID_GEMS][:3]

    pending_gem.pop(user_id, None)
    pending_emotion_selection.pop(user_id, None)
    pending_photo.pop(user_id, None)

    if not valid_gems:
        pending_gem[user_id] = {"gem": None, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": None, "daily": True}
        return kakao_response(
            DAILY_RECORD_MESSAGE,
            custom_replies=DAILY_QUICK_REPLIES
        )

    if len(valid_gems) >= 2:
        emotion_words = [GEM_TO_EMOTION[g] for g in valid_gems if g in GEM_TO_EMOTION]
        pending_emotion_selection[user_id] = {
            "emotions": emotion_words, "text": utterance,
            "has_photo": has_photo, "image_url": image_url,
            "ai_gems": ",".join(valid_gems),
            "selected_emotions": [],
        }
        gem_names = ", ".join(valid_gems)
        return kakao_response(
            f"오늘 여러 마음이 함께 있었네요.\n\n"
            f"{gem_names}이 보여요.\n\n"
            "이 원석들로 오늘을 저장해드릴까요?",
            custom_replies=MULTI_EMOTION_QUICK_REPLIES
        )

    gem = valid_gems[0]
    pending_gem[user_id] = {"gem": gem, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": gem, "reclassify_step": 0}
    return kakao_response(
        f"{gem}{_josa_eul(gem)} 발견했어요.\n"
        "이 감정조각으로 저장해드릴까요?\n\n"
        "다른 감정이었다면 아래 버튼을 통해 수정해주세요.",
        custom_replies=_gem_save_quick_replies(gem)
    )


def _prepend_greeting(response: dict, greeting: str) -> dict:
    if not greeting:
        return response
    outputs = response.get("template", {}).get("outputs", [])
    response["template"]["outputs"] = [{"simpleText": {"text": greeting}}] + outputs
    return response


def _prepend_today_record_count(response: dict, user_id: str) -> dict:
    today_count = _reserve_today_record_count(user_id)
    outputs = response.get("template", {}).get("outputs", [])
    response.setdefault("template", {})["outputs"] = [
        {"simpleText": {"text": f"오늘 {today_count}번째 기록이에요!"}}
    ] + outputs
    return response


def _check_and_update_visit(user_id: str) -> str | None:
    """Returns greeting message on first-ever or first-of-day visit, else None."""
    today = _today_kst()

    if user_last_active.get(user_id) == today:
        return None

    last = None

    # DB에서 마지막 저장일 조회
    last_db = None
    if RAILWAY_DATABASE_URL:
        try:
            conn = psycopg2.connect(RAILWAY_DATABASE_URL)
            cur = conn.cursor()
            cur.execute(
                "SELECT MAX((created_at AT TIME ZONE 'Asia/Seoul')::date) FROM chatbot WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            if row and row[0]:
                last_db = row[0]
        except Exception as e:
            print(f"[_check_and_update_visit db error] {e}")

    # DB 날짜와 인메모리 날짜 중 더 최근 것 사용
    last_mem = user_last_active.get(user_id)
    if last_db and last_mem:
        last = max(last_db, last_mem)
    else:
        last = last_db or last_mem

    user_last_active[user_id] = today

    if last is None:
        return "유로그에 처음 오셨군요! 반가워요 😊"
    return None


def check_negative_accumulation(user_id: str) -> str | None:
    """Returns an alert message if negative emotions are accumulating, else None."""
    if not RAILWAY_DATABASE_URL:
        return None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        week_ago = (_today_kst() - timedelta(days=6)).isoformat()
        cur.execute(
            "SELECT gem, (created_at AT TIME ZONE 'Asia/Seoul')::date as day "
            "FROM chatbot WHERE user_id = %s AND gem != '일상기록' "
            "AND (created_at AT TIME ZONE 'Asia/Seoul')::date >= %s "
            "ORDER BY created_at",
            (user_id, week_ago),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        if len(rows) < 3:
            return None
        negative_count = sum(1 for gem, _ in rows if gem in NEGATIVE_GEMS)
        if negative_count / len(rows) >= 0.7:
            return "\n\n💙 최근 힘든 감정들이 많았던 것 같아요. 당신의 마음이 조금 더 편안해지길 바라요."
        day_gems: dict = defaultdict(list)
        for gem, day in rows:
            day_gems[day].append(gem)
        sorted_days = sorted(day_gems.keys())
        if len(sorted_days) >= 3:
            last3 = sorted_days[-3:]
            if (last3[2] - last3[0]).days == 2:
                if all(all(g in NEGATIVE_GEMS for g in day_gems[d]) for d in last3):
                    return "\n\n💙 3일 연속 힘든 감정들이 함께했네요. 잠깐 쉬어가도 괜찮아요."
        return None
    except Exception as e:
        print(f"[check_negative_accumulation error] {e}")
        return None


def _gem_save_quick_replies(gem: str, include_nav: bool = False) -> list:
    replies = [
        {"label": f"{gem} 채집하기 💎", "action": "message", "messageText": "맞아요"},
        {"label": "다시 찾을게요", "action": "message", "messageText": "다시 찾을게요"},
    ]
    if include_nav:
        replies += [
            {"label": "내 원석 보기", "action": "message", "messageText": "내 원석"},
            {"label": "원석 도감", "action": "message", "messageText": "도감"},
        ]
    return replies


def _callback_task(
    user_id: str, utterance: str, callback_url: str, photo_time, photo_url: str | None,
    greeting: str | None = None,
    *,
    trace_id: _uuid.UUID | None = None,
):
    has_photo = bool(isinstance(photo_time, datetime) and photo_url and datetime.now() - photo_time <= PHOTO_TIMEOUT)
    image_url = str(photo_url) if has_photo else None
    result = classify_emotion_with_supervisor(utterance, trace_id=trace_id, user_id=user_id)
    response = _build_ai_response(user_id, utterance, has_photo, image_url, result)
    if result not in ("NOT_RECORD", "TIMEOUT") and result is not None:
        response = _prepend_today_record_count(response, user_id)
    if greeting:
        response = _prepend_greeting(response, greeting)
    log_message(trace_id=trace_id or new_trace_id(), user_id=user_id,
                direction="outbound", raw_body=response,
                callback_url=callback_url, mode="callback")
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[callback post error] {e}")
        log_error(source="callback_post", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)


def _callback_task_retry(
    user_id: str, utterance: str, callback_url: str, has_photo: bool, image_url: str | None,
    *,
    trace_id: _uuid.UUID | None = None,
):
    result = classify_emotion_with_supervisor(utterance, trace_id=trace_id, user_id=user_id)
    response = _build_ai_response(user_id, utterance, has_photo, image_url, result)
    if result not in ("NOT_RECORD", "TIMEOUT") and result is not None:
        response = _prepend_today_record_count(response, user_id)
    log_message(trace_id=trace_id or new_trace_id(), user_id=user_id,
                direction="outbound", raw_body=response,
                callback_url=callback_url, mode="callback_retry")
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[callback post error] {e}")
        log_error(source="callback_post_retry", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)


def _run_emotion_analysis(
    user_id: str,
    *,
    trace_id: _uuid.UUID | None = None,
) -> str:
    """최근 30개 기록 기반 감정 패턴 분석 텍스트 반환."""
    if not RAILWAY_DATABASE_URL:
        return "분석 기능을 사용할 수 없어요."
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            "SELECT gem, record_text FROM chatbot "
            "WHERE user_id = %s AND gem != '일상기록' AND gem != '단순기록' "
            "ORDER BY created_at DESC LIMIT 30",
            (user_id,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[_run_emotion_analysis db error] {e}")
        log_error(source="emotion_analysis_db", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)
        return "분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."

    if len(rows) < 3:
        return "아직 기록이 부족해요. 최소 3개 이상의 감정 기록이 있어야 분석할 수 있어요!"

    records_text = "\n".join([f"- {gem}: {record_text}" for gem, record_text in rows])
    prompt = (
        "다음은 사용자의 최근 감정 기록들이야. 아래 기준으로 짧고 따뜻하게 분석해줘.\n\n"
        "1. 자주 느끼는 감정 패턴 한 줄\n"
        "2. 긍정/부정 비율 언급\n"
        "3. 따뜻한 마무리 한 줄\n\n"
        "총 200자 내외로, 말투는 친근하게. 다른 말 없이 분석 내용만 답해.\n\n"
        f"기록:\n{records_text}"
    )
    data = _call_openai_chat(prompt, max_tokens=300, log_prefix="emotion_analysis",
                             trace_id=trace_id, user_id=user_id,
                             call_type="emotion_analysis")
    if not data:
        return "분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
    return data["choices"][0]["message"]["content"].strip()


def _fetch_today_records(user_id: str) -> list[dict]:
    if not RAILWAY_DATABASE_URL:
        return []
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT gem, record_text, has_photo, image_url, trace_id,
                   to_char(created_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS saved_time
            FROM chatbot
            WHERE user_id = %s
              AND (created_at AT TIME ZONE 'Asia/Seoul')::date = %s
            ORDER BY created_at DESC
            LIMIT 30
            """,
            (user_id, _today_kst()),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        records = [
            {
                "gem": str(gem or ""),
                "record_text": str(record_text or ""),
                "has_photo": bool(has_photo),
                "image_url": str(image_url or ""),
                "saved_time": str(saved_time or ""),
                "trace_id": str(trace_id or ""),
            }
            for gem, record_text, has_photo, image_url, trace_id, saved_time in rows
        ]
        return _merge_today_display_records(user_id, records)
    except Exception as e:
        print(f"[_fetch_today_records db error] {e}")
        return _merge_today_display_records(user_id, [])


def _get_total_record_counts(user_id: str) -> tuple[int, int]:
    if not RAILWAY_DATABASE_URL:
        return 0, 0
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE gem != '일상기록' AND gem != '단순기록') AS emotion_count,
                COUNT(*) FILTER (WHERE gem = '일상기록' OR gem = '단순기록') AS daily_count
            FROM chatbot
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return 0, 0
        return int(row[0] or 0), int(row[1] or 0)
    except Exception as e:
        print(f"[_get_total_record_counts db error] {e}")
        return 0, 0


def kakao_today_records(user_id: str) -> dict:
    records = _fetch_today_records(user_id)
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    emotion_count, daily_count = _get_total_record_counts(user_id)

    items = [{
        "title": "오늘 기록을 모아봤어요.",
        "description": (
            f"지금까지 총 {emotion_count}개의 감정원석과 {daily_count}개의 일상을 저장했어요.\n\n"
            "웹에서 오늘까지 쌓아온 모든 기록과 분석을 만나보세요!"
        ),
        "thumbnail": {"imageUrl": TODAY_RECORDS_IMAGE},
        "buttons": [{"action": "webLink", "label": "웹 방문하기", "webLinkUrl": link_url}],
    }]

    if not records:
        items.append({
            "title": "오늘 저장한 기록이 아직 없어요.",
            "description": "일상을 보내주시면 오늘 기록에 담아둘게요.",
            "thumbnail": {"imageUrl": MASCOT_IMAGE},
            "buttons": [{"action": "webLink", "label": "웹 방문하기", "webLinkUrl": link_url}],
        })

    for record in records:
        gem = record["gem"]
        gems = [str(item) for item in record.get("gems", [gem]) if str(item)]
        if gem == "일상기록":
            title = f"{record['saved_time']} 소중한 일상"
            image_url = record["image_url"] or MASCOT_IMAGE
        elif gem == "단순기록":
            title = f"{record['saved_time']} 단순 기록"
            image_url = record["image_url"] or MASCOT_IMAGE
        else:
            title = f"{record['saved_time']} {', '.join(gems)}"
            default_image_url = MULTI_EMOTION_IMAGE if len(gems) > 1 else GEM_IMAGE_URL.get(gem)
            image_url = record["image_url"] or default_image_url
        description = _truncate_text(record["record_text"], 160)
        if not description:
            description = "사진으로 저장한 기록이에요." if record["has_photo"] else "내용 없이 저장된 기록이에요."
        item = {
            "title": title.strip(),
            "description": description,
            "buttons": [{"action": "webLink", "label": "웹 방문하기", "webLinkUrl": link_url}],
        }
        item.update(_thumbnail(image_url))
        items.append(item)

    return {
        "version": "2.0",
        "template": {
            "outputs": [{"carousel": {"type": "basicCard", "items": items}}],
            "quickReplies": BASE_QUICK_REPLIES,
        },
    }


def _run_today_emotion_analysis(
    user_id: str,
    *,
    trace_id: _uuid.UUID | None = None,
) -> str:
    """오늘(KST) 저장한 감정/일상 기록 기반 분석 텍스트 반환."""
    if not RAILWAY_DATABASE_URL:
        return "분석 기능을 사용할 수 없어요."
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT gem, record_text
            FROM chatbot
            WHERE user_id = %s
              AND (created_at AT TIME ZONE 'Asia/Seoul')::date = %s
            ORDER BY created_at
            """,
            (user_id, _today_kst()),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[_run_today_emotion_analysis db error] {e}")
        log_error(source="today_emotion_analysis_db", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)
        return "오늘 분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."

    rows = _merge_today_analysis_records(user_id, rows)
    if len(rows) < 1:
        return "오늘 분석할 기록이 아직 없어요.\n오늘의 일상을 남기면 분석할 수 있어요."

    records_text = "\n".join([f"- {gem}: {record_text}" for gem, record_text in rows])
    prompt = (
        "다음은 사용자의 오늘 감정원석 기록과 일상 기록들이야. 오늘 하루에 한정해서 짧고 다정하게 분석해줘.\n\n"
        "형식은 반드시 아래 3줄로 맞추고, 각 줄 사이에는 빈 줄을 하나씩 넣어줘.\n"
        "오늘의 감정 흐름: ...\n\n"
        "가장 눈에 띄는 조각: ...\n\n"
        "오늘의 한 줄 정리: ...\n\n"
        "총 220자 이내로, 과장하거나 진단하지 말고 기록에 근거해서 말해.\n"
        "다른 말 없이 분석 내용만 답해.\n\n"
        f"기록:\n{records_text}"
    )
    data = _call_openai_chat(prompt, max_tokens=300, log_prefix="today_emotion_analysis",
                             trace_id=trace_id, user_id=user_id,
                             call_type="today_emotion_analysis")
    if not data:
        return "오늘 분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
    return data["choices"][0]["message"]["content"].strip()


def _format_today_analysis_text(text: str) -> str:
    lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]
    return "\n\n".join(lines)


def kakao_today_analysis_response(analysis_text: str, user_id: str) -> dict:
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    formatted_analysis = _format_today_analysis_text(analysis_text)
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"basicCard": {
                "title": "오늘 분석",
                "description": (
                    f"{formatted_analysis}\n\n"
                    "아래 버튼을 눌러 더 자세한 분석과 내 기록물을 만나보세요."
                ),
                "thumbnail": {"imageUrl": TODAY_ANALYSIS_IMAGE},
                "buttons": [{"action": "webLink", "label": "웹 방문하기", "webLinkUrl": link_url}],
            }}],
            "quickReplies": BASE_QUICK_REPLIES,
        },
    }


def _callback_task_analysis(
    user_id: str, callback_url: str,
    *,
    trace_id: _uuid.UUID | None = None,
):
    result = _run_emotion_analysis(user_id, trace_id=trace_id)
    response = kakao_response(result, custom_replies=BASE_QUICK_REPLIES)
    log_message(trace_id=trace_id or new_trace_id(), user_id=user_id,
                direction="outbound", utterance=result, raw_body=response,
                callback_url=callback_url, mode="analysis")
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[_callback_task_analysis error] {e}")
        log_error(source="callback_post_analysis", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)


def _callback_task_today_analysis(
    user_id: str, callback_url: str,
    *,
    trace_id: _uuid.UUID | None = None,
):
    result = _run_today_emotion_analysis(user_id, trace_id=trace_id)
    response = kakao_today_analysis_response(result, user_id)
    log_message(trace_id=trace_id or new_trace_id(), user_id=user_id,
                direction="outbound", utterance=result, raw_body=response,
                callback_url=callback_url, mode="today_analysis")
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[_callback_task_today_analysis error] {e}")
        log_error(source="callback_post_today_analysis", message=str(e), exc=e,
                  trace_id=trace_id, user_id=user_id)


@app.post("/skill/check-question")
async def skill_check_question(request: Request):
    try:
        body = await request.json()
    except Exception as e:
        print(f"[check-question json error] {e}")
        body = {}

    user_id = _extract_payload_value(body, "user_id") or _extract_kakao_request(body)[0]
    emotion = _extract_payload_value(body, "emotion")
    emotion_category = _extract_payload_value(body, "emotion_category")
    record_mode = _extract_payload_value(body, "record_mode") or "대화모드"
    try:
        text_length = int(_extract_payload_value(body, "text_length") or 0)
    except ValueError:
        text_length = 0

    return JSONResponse(check_reflection_question(
        user_id,
        emotion,
        emotion_category,
        text_length,
        record_mode=record_mode,
    ))


@app.post("/skill/save-reflection")
async def skill_save_reflection(request: Request):
    try:
        body = await request.json()
    except Exception as e:
        print(f"[save-reflection json error] {e}")
        body = {}

    user_id = _extract_payload_value(body, "user_id") or _extract_kakao_request(body)[0]
    answer_text = _extract_payload_value(body, "answer_text") or _extract_kakao_request(body)[1]
    question_id = _extract_payload_value(body, "question_id")
    question_text = _extract_payload_value(body, "question_text")

    if answer_text:
        save_reflection_answer(user_id, answer_text, question_id, question_text)
    return JSONResponse(kakao_response("잘 담아뒀어요 ✎", custom_replies=BASE_QUICK_REPLIES))


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    trace_id = new_trace_id()
    _current_trace_id.set(str(trace_id))
    try:
        body = await request.json()
    except Exception as e:
        print(f"[webhook json error] {e}")
        log_error(source="webhook.json", message=str(e), exc=e, trace_id=trace_id)
        return JSONResponse(kakao_response("요청을 읽지 못했어요. 메시지를 다시 보내주세요."))

    user_id, utterance, callback_url = _extract_kakao_request(body)
    command_text = _compact_command_text(utterance)
    emotion_by_command = {_compact_command_text(emotion): emotion for emotion in EMOTION_TO_GEM}
    category_by_command = {_compact_command_text(category): category for category in EMOTION_CATEGORIES}
    _current_user_id.set(user_id or "unknown")
    log_message(
        trace_id=trace_id, user_id=user_id or "unknown", direction="inbound",
        utterance=utterance, raw_body=body, callback_url=callback_url,
        pending_state={
            "pending_photo_keys": [k for k in pending_photo.keys() if k == user_id],
            "pending_gem_keys": [k for k in pending_gem.keys() if k == user_id],
            "pending_simple_record": bool(pending_simple_record.get(user_id)),
        },
    )

    if any(kw in utterance for kw in DANGER_KEYWORDS):
        background_tasks.add_task(send_alert_email, "[유로그] 위험 기록 감지", f"유저 ID: {user_id}\n내용: {utterance}")
        return JSONResponse(kakao_response(DANGER_MESSAGE))

    if any(kw in utterance for kw in HARMFUL_KEYWORDS):
        background_tasks.add_task(send_alert_email, "[유로그] 유해 기록 감지", f"유저 ID: {user_id}\n내용: {utterance}")
        return JSONResponse(kakao_response(HARMFUL_MESSAGE))

    reflection = _safe_pending_reflection(user_id)
    if reflection and _matches_command(utterance, "건너뛰기", "건너뛸게요"):
        pending_reflection.pop(user_id, None)
        link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "좋아요. 지금 느낀 만큼만 담아둘게요.",
                    "description": "더 얘기하고 싶어질 때 언제든 다시 찾아와 주세요.",
                    "thumbnail": {"imageUrl": MASCOT_IMAGE},
                    "buttons": [{"action": "webLink", "label": "웹에서 기록 보기", "webLinkUrl": link_url}],
                }}],
                "quickReplies": BASE_QUICK_REPLIES,
            },
        })

    if reflection and _matches_command(utterance, "질문 받을게요"):
        reflection["stage"] = "question_shown"
        return JSONResponse(kakao_response(
            reflection["question_text"],
            custom_replies=REFLECTION_QUESTION_QUICK_REPLIES
        ))

    if reflection and _matches_command(utterance, "답할게요"):
        reflection["stage"] = "awaiting_answer"
        return JSONResponse(kakao_response(
            "편하게 적어주세요 :)",
            custom_replies=REFLECTION_ANSWER_QUICK_REPLIES
        ))

    # 모드 선택 메뉴
    if _matches_command(utterance, "모드"):
        pending_simple_record.pop(user_id, None)
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"simpleText": {"text": "어떤 방식으로 기록할까요?\n\n 대화모드: 챗봇이 감정 조각을 찾아드려요.\n 단순모드: 응답 없이 바로 저장돼요."}}],
                "quickReplies": [
                    {"label": "대화모드", "action": "message", "messageText": "대화모드"},
                    {"label": "단순모드", "action": "message", "messageText": "단순모드"},
                ],
            }
        })

    # 대화모드 선택
    if _matches_command(utterance, "대화모드"):
        pending_simple_record.pop(user_id, None)
        link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "대화모드가 설정됐어요!",
                    "description": (
                        "이제부터 챗봇과 함께 감정 원석을 찾아봐요.\n\n"
                        "수집한 감정원석을 통해 웹에서 내 감정을 더 자세히 들여다 볼 수 있어요.\n"
                        "챗봇과 대화하고 싶지 않은 날에는 단순기록 모드로 기록만 남겨도 좋아요."
                    ),
                    "thumbnail": {"imageUrl": CONVERSATION_MODE_IMAGE},
                    "buttons": [{"action": "webLink", "label": "감정 들여다보기", "webLinkUrl": link_url}],
                }}],
                "quickReplies": [
                    {"label": "단순모드", "action": "message", "messageText": "단순모드"},
                ],
            },
        })

    # 단순모드 선택
    if _matches_command(utterance, "단순모드"):
        pending_simple_record[user_id] = True
        link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "단순기록 모드가 설정됐어요!",
                    "description": (
                        "이제부터는 챗봇 응답을 최소화하고 기록 저장에 집중할게요.\n\n"
                        "기록한 데이터는 AI가 감정 원석을 발견해 저장해드려요.\n"
                        "분석된 감정원석은 언제든지 아래 웹에서 확인할 수 있어요!"
                    ),
                    "thumbnail": {"imageUrl": SIMPLE_MODE_IMAGE},
                    "buttons": [{"action": "webLink", "label": "감정 들여다보기", "webLinkUrl": link_url}],
                }}],
                "quickReplies": [
                    {"label": "대화모드", "action": "message", "messageText": "대화모드"},
                ],
            },
        })

    if _matches_command(utterance, "저장된 일상 기록 보기"):
        link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "저장된 일상 기록을 볼 수 있어요.",
                    "description": "아래 웹 사이트에서 수집한 조각 기록과 일상 기록을 더 자세히 살펴 볼 수 있어요.",
                    "thumbnail": {"imageUrl": MASCOT_IMAGE},
                    "buttons": [{"action": "webLink", "label": "저장된 일상 기록 보기", "webLinkUrl": link_url}],
                }}],
                "quickReplies": BASE_QUICK_REPLIES,
            },
        })

    if _matches_command(utterance, "오늘 기록"):
        return JSONResponse(kakao_today_records(user_id))

    # 오늘 분석
    if _matches_command(utterance, "오늘 분석", "감정분석"):
        if callback_url:
            background_tasks.add_task(_callback_task_today_analysis, user_id, callback_url, trace_id=trace_id)
            return JSONResponse({"version": "2.0", "useCallback": True})
        result = _run_today_emotion_analysis(user_id, trace_id=trace_id)
        return JSONResponse(kakao_today_analysis_response(result, user_id))

    # 다시 시도 (타임아웃 후 재분류)
    if _matches_command(utterance, "다시 시도"):
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("다시 시도할 기록이 없어요. 일상을 다시 보내주세요!"))
        saved_utterance = data["text"]
        saved_has_photo = bool(data.get("has_photo", False))
        saved_image_url = data.get("image_url")
        pending_gem.pop(user_id, None)
        if callback_url:
            background_tasks.add_task(_callback_task_retry, user_id, saved_utterance, callback_url, saved_has_photo, saved_image_url, trace_id=trace_id)
            return JSONResponse({"version": "2.0", "useCallback": True})
        result = classify_emotion_with_supervisor(saved_utterance, trace_id=trace_id, user_id=user_id)
        return JSONResponse(_build_ai_response(user_id, saved_utterance, saved_has_photo, saved_image_url, result))

    # 다시 찾을게요 — 1회차: 카테고리, 2회차: 전체 20개
    if _matches_command(utterance, "다시 찾을게요"):
        data = _safe_pending_gem(user_id)
        if not data:
            return JSONResponse(kakao_response("저장 대기 중인 원석이 없어요. 일상을 먼저 보내주세요!"))
        step = data.get("reclassify_step", 0)
        if step < 1:
            data["reclassify_step"] = 1
            return JSONResponse({
                "version": "2.0",
                "template": {
                    "outputs": [
                        {"simpleText": {"text": "어떤 결에 더 가까운가요?"}},
                        {"basicCard": {
                            "title": "원하는 감정이 없다면",
                            "description": "일상 기록으로도 저장할 수 있어요.",
                            "thumbnail": {"imageUrl": FIND_EMOTION_IMAGE},
                            "buttons": [{"action": "message", "label": "그대로 저장하기", "messageText": "그대로 저장하기"}],
                        }},
                    ],
                    "quickReplies": CATEGORY_QUICK_REPLIES,
                },
            })
        else:
            data["reclassify_step"] = 0
            return JSONResponse(kakao_response("어떤 감정이 가장 가까운가요?", show_emotion_buttons=True))

    # 맞아요 (저장)
    if _matches_command(utterance, "맞아요"):
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("저장할 원석이 없어요. 일상을 먼저 보내주세요!"))
        if not data.get("gem"):
            return JSONResponse(kakao_response("감정을 먼저 선택해주세요!", show_emotion_buttons=True))
        gem_to_save = data["gem"]
        today_count = _reserve_today_gem_count(user_id)
        background_tasks.add_task(save_gem, user_id, gem_to_save, data["text"], bool(data.get("has_photo", False)), data.get("image_url"), data.get("ai_gems"), trace_id=trace_id)
        _remember_today_pending_record(user_id, gem_to_save, data["text"], bool(data.get("has_photo", False)), data.get("image_url"), trace_id=trace_id)
        pending_gem.pop(user_id, None)
        alert_msg = check_negative_accumulation(user_id)
        response = kakao_save_complete(gem_to_save, today_count, user_id, alert_msg or "")
        response = _maybe_attach_reflection_invite(response, user_id, gem_to_save, data["text"])
        return JSONResponse(response)

    # 모두 채집 (복수 감정 전체 저장)
    if _matches_command(utterance, "모두 채집"):
        sel = _safe_pending_emotion_selection(user_id)
        if not sel:
            return JSONResponse(kakao_response("저장할 원석이 없어요."))
        gems_to_save = [EMOTION_TO_GEM[e] for e in sel["emotions"] if e in EMOTION_TO_GEM]
        for gem in gems_to_save:
            background_tasks.add_task(save_gem, user_id, gem, sel["text"], bool(sel.get("has_photo", False)), sel.get("image_url"), sel.get("ai_gems"), trace_id=trace_id)
            _remember_today_pending_record(user_id, gem, sel["text"], bool(sel.get("has_photo", False)), sel.get("image_url"), trace_id=trace_id)
        pending_emotion_selection.pop(user_id, None)
        today_count = _reserve_today_gem_count(user_id, len(gems_to_save))
        alert_msg = check_negative_accumulation(user_id)
        response = kakao_gem_save_complete(gems_to_save, today_count, user_id, alert_msg or "")
        for gem in gems_to_save:
            response = _maybe_attach_reflection_invite(response, user_id, gem, sel["text"])
            if user_id in pending_reflection:
                break
        return JSONResponse(response)

    # 골라서 채집 (복수 감정 중 선택)
    if _matches_command(utterance, "골라서 채집"):
        sel = _safe_pending_emotion_selection(user_id)
        if not sel:
            return JSONResponse(kakao_response("저장할 원석이 없어요."))
        sel["selected_emotions"] = []
        return JSONResponse(kakao_response(
            "저장할 감정을 골라주세요.",
            custom_replies=_multi_emotion_selection_replies(sel),
        ))

    if _matches_command(utterance, "완료하기"):
        sel = _safe_pending_emotion_selection(user_id)
        if not sel:
            return JSONResponse(kakao_response("저장할 원석이 없어요."))
        selected = sel.get("selected_emotions")
        if not isinstance(selected, list) or not selected:
            return JSONResponse(kakao_response(
                "먼저 저장할 감정을 하나 이상 골라주세요.",
                custom_replies=_multi_emotion_selection_replies(sel),
            ))
        gems_to_save = [EMOTION_TO_GEM[e] for e in selected if e in EMOTION_TO_GEM]
        for gem in gems_to_save:
            background_tasks.add_task(save_gem, user_id, gem, sel["text"], bool(sel.get("has_photo", False)), sel.get("image_url"), sel.get("ai_gems"), trace_id=trace_id)
            _remember_today_pending_record(user_id, gem, sel["text"], bool(sel.get("has_photo", False)), sel.get("image_url"), trace_id=trace_id)
        pending_emotion_selection.pop(user_id, None)
        today_count = _reserve_today_gem_count(user_id, len(gems_to_save))
        alert_msg = check_negative_accumulation(user_id)
        response = kakao_gem_save_complete(gems_to_save, today_count, user_id, alert_msg or "")
        for gem in gems_to_save:
            response = _maybe_attach_reflection_invite(response, user_id, gem, sel["text"])
            if user_id in pending_reflection:
                break
        return JSONResponse(response)

    # 감정 선택하기 (일상 기록 후 감정 카테고리 선택)
    if _matches_command(utterance, "감정 선택하기", "감정 추가하기"):
        data = _safe_pending_gem(user_id, require_text=True)
        if not data or not data.get("daily"):
            return JSONResponse(kakao_response("먼저 일상을 기록해주세요!"))
        data["daily_emotion_select"] = True
        data["reclassify_step"] = 1
        return JSONResponse(kakao_response("어떤 감정 결에 더 가까운가요?", custom_replies=CATEGORY_QUICK_REPLIES))

    # 그대로 저장하기 (일상 기록으로 저장)
    if _matches_command(utterance, "그대로 저장하기", "이대로 저장"):
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("저장할 기록이 없어요. 일상을 먼저 보내주세요!"))
        background_tasks.add_task(save_gem, user_id, "일상기록", data["text"], bool(data.get("has_photo", False)), data.get("image_url"), None, trace_id=trace_id)
        _remember_today_pending_record(user_id, "일상기록", data["text"], bool(data.get("has_photo", False)), data.get("image_url"), trace_id=trace_id)
        pending_gem.pop(user_id, None)
        return JSONResponse(kakao_daily_save_complete(user_id))

    # 일상으로 저장 (사진 → 일상 기록, 채집권 미사용)
    if _matches_command(utterance, "일상으로 저장"):
        has_photo, photo_urls, _ = _safe_pending_photo(user_id)
        if has_photo and photo_urls:
            background_tasks.add_task(save_gem, user_id, "일상기록", "", True, photo_urls[0], None, trace_id=trace_id)
            _remember_today_pending_record(user_id, "일상기록", "", True, photo_urls[0], trace_id=trace_id)
            for _extra_url in photo_urls[1:]:
                background_tasks.add_task(save_gem, user_id, "단순기록", "", True, _extra_url, None, trace_id=trace_id)
                _remember_today_pending_record(user_id, "단순기록", "", True, _extra_url, trace_id=trace_id)
            pending_photo.pop(user_id, None)
            return JSONResponse(kakao_response("사진이 일상 기록으로 저장됐어요! 📝"))
        return JSONResponse(kakao_response("저장할 사진이 없어요. 사진을 먼저 보내주세요!"))

    # 감정 적기 (사진 후 텍스트 유도)
    if _matches_command(utterance, "감정 적기"):
        return JSONResponse(kakao_response(
            "오늘 있었던 일이나 지금 느끼는 마음을 적어봐요.\n짧게 적어도 괜찮아요!",
            hide_buttons=True
        ))

    # 감정 퀵버튼 선택
    selected_emotion = emotion_by_command.get(command_text)
    if selected_emotion:
        gem = EMOTION_TO_GEM[selected_emotion]
        sel = _safe_pending_emotion_selection(user_id)
        print(f"[emotion click] utterance={utterance}, emotion={selected_emotion}, sel={sel}, pending_gem={pending_gem.get(user_id)}")
        if sel and selected_emotion in sel["emotions"]:
            selected = sel.get("selected_emotions")
            if not isinstance(selected, list):
                selected = []
                sel["selected_emotions"] = selected
            if selected_emotion not in selected:
                selected.append(selected_emotion)
            replies = _multi_emotion_selection_replies(sel)
            if len(selected) >= len(sel["emotions"]):
                replies = [{"label": "완료하기", "action": "message", "messageText": "완료하기"}]
            return JSONResponse(kakao_response(
                _multi_emotion_selection_text(sel),
                custom_replies=replies,
            ))
        existing = _safe_pending_gem(user_id)
        if existing:
            if existing.get("daily") and existing.get("daily_emotion_select"):
                today_count = _reserve_today_gem_count(user_id)
                background_tasks.add_task(
                    save_gem,
                    user_id,
                    gem,
                    existing["text"],
                    bool(existing.get("has_photo", False)),
                    existing.get("image_url"),
                    gem,
                    trace_id=trace_id,
                )
                _remember_today_pending_record(user_id, gem, existing["text"], bool(existing.get("has_photo", False)), existing.get("image_url"), trace_id=trace_id)
                pending_gem.pop(user_id, None)
                alert_msg = check_negative_accumulation(user_id)
                response = kakao_save_complete(gem, today_count, user_id, alert_msg or "")
                response = _maybe_attach_reflection_invite(response, user_id, gem, existing["text"])
                return JSONResponse(response)
            existing["gem"] = gem
            existing["reclassify_step"] = 0
            existing.pop("direct_input", None)
            return JSONResponse(kakao_response(f"{gem}으로 바꿨어요! ✨\n저장할까요?", custom_replies=_gem_save_quick_replies(gem)))
        return JSONResponse(kakao_response("먼저 오늘의 일상을 적어주세요 🪨\n어떤 일이 있었는지 보내주시면 원석으로 저장해드릴게요!"))

    # 이전 단계로 (감정 선택 → 카테고리 선택)
    if _matches_command(utterance, "이전 단계로"):
        data = _safe_pending_gem(user_id)
        if not data:
            return JSONResponse(kakao_response("저장 대기 중인 원석이 없어요. 일상을 먼저 보내주세요!"))
        data["reclassify_step"] = 1
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [
                    {"simpleText": {"text": "어떤 결에 더 가까운가요?"}},
                    {"basicCard": {
                        "title": "원하는 감정이 없다면",
                        "description": "일상 기록으로도 저장할 수 있어요.",
                        "thumbnail": {"imageUrl": FIND_EMOTION_IMAGE},
                        "buttons": [{"action": "message", "label": "그대로 저장하기", "messageText": "그대로 저장하기"}],
                    }},
                ],
                "quickReplies": CATEGORY_QUICK_REPLIES,
            },
        })

    # 카테고리 선택 (재분류 1회차 → 2회차)
    selected_category = category_by_command.get(command_text)
    if selected_category:
        data = _safe_pending_gem(user_id)
        if not data:
            return JSONResponse(kakao_response("저장 대기 중인 원석이 없어요. 일상을 먼저 보내주세요!"))
        emotions_in_cat = EMOTION_CATEGORIES[selected_category]
        emotion_buttons = [{"label": e, "action": "message", "messageText": e} for e in emotions_in_cat]
        emotion_buttons.append({"label": "이전 단계로", "action": "message", "messageText": "이전 단계로"})
        data["reclassify_step"] = 2
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [
                    {"simpleText": {"text": "이 중에서 골라봐요."}},
                    {"basicCard": {
                        "title": "원하는 감정이 없다면",
                        "description": "일상 기록으로도 저장할 수 있어요.",
                        "thumbnail": {"imageUrl": FIND_EMOTION_IMAGE},
                        "buttons": [{"action": "message", "label": "그대로 저장하기", "messageText": "그대로 저장하기"}],
                    }},
                ],
                "quickReplies": emotion_buttons,
            },
        })

    # 도감 조회
    if _matches_command(utterance, "도감"):
        pdata = _safe_pending_gem(user_id)
        if pdata and pdata.get("gem"):
            pending_replies = _gem_save_quick_replies(pdata["gem"], include_nav=True)
        elif pdata and pdata.get("retry"):
            pending_replies = RETRY_QUICK_REPLIES
        else:
            pending_replies = BASE_QUICK_REPLIES
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [
                    {"simpleText": {"text": (
                        "기록을 통해 채집할 수 있는 감정 원석들이에요.\n\n"
                        "감정 원석은 총 25종,\n크게 다섯 가지 결을 가지고 있어요.\n\n"
                        "💙 슬픔의 결\n우울함 조각 · 외로움 조각 · 상실감 조각 · 서러움 조각 · 실망감 조각\n위로받고 싶은 일상의 순간들이 담겨요.\n\n"
                        "🤍 불안/두려움의 결\n걱정 조각 · 긴장감 조각 · 위축감 조각 · 초조 조각 · 공포 조각\n마음이 팽팽해지는 순간들이 담겨요.\n\n"
                        "🧡 분노의 결\n짜증 조각 · 억울함 조각 · 화남 조각 · 적대감 조각 · 경멸 조각\n뜨겁고 단단한 감정들이 담겨요.\n\n"
                        "💛 기쁨/긍정의 결\n즐거움 조각 · 감사함 조각 · 설렘 조각 · 뿌듯함 조각 · 편안함 조각\n따뜻하고 빛나는 순간들이 담겨요.\n\n"
                        "🩶 복잡/모호의 결\n무기력함 조각 · 공허함 조각 · 후회 조각 · 부끄러움 조각 · 혼란스러움 조각\n잘 정의되지 않는 감정들이 담겨요.\n\n"
                        "각 원석은 강화를 통해 보석으로 세공할 수 있어요."
                    )}},
                    {"basicCard": {
                        "thumbnail": {"imageUrl": ALL_GEMS_IMAGE},
                        "buttons": [{"action": "webLink", "label": "원석 도감 바로가기", "webLinkUrl": WEB_URL}],
                    }},
                ],
                "quickReplies": pending_replies,
            },
        })

    # 원석 가방 조회
    if _matches_command(utterance, "내 원석", "원석 보기", "가방", "인벤토리"):
        pdata = _safe_pending_gem(user_id)
        if pdata and pdata.get("gem"):
            inv_replies = _gem_save_quick_replies(pdata["gem"], include_nav=True)
        elif pdata and pdata.get("retry"):
            inv_replies = RETRY_QUICK_REPLIES
        else:
            inv_replies = BASE_QUICK_REPLIES
        today_count, total_count = get_gem_stats(user_id)
        link_url = f"{WEB_URL}?kakao_hash={user_id}"
        if total_count == 0:
            desc = "아직 채집한 원석이 없어요.\n일상을 기록하면 원석으로 채집해드릴게요!"
        else:
            desc = (
                f"총 {total_count}개 보유 · 오늘 {today_count}번 기록했어요\n\n"
                "아래 링크에서 보유한 원석의 종류와 수량,\n강화 현황을 한눈에 볼 수 있어요."
            )
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "지금까지 채집한 원석을 보여드릴게요.",
                    "thumbnail": {"imageUrl": ALL_GEMS_IMAGE},
                    "description": desc,
                    "buttons": [{"action": "webLink", "label": "내 원석 보러 가기", "webLinkUrl": link_url}],
                }}],
                "quickReplies": inv_replies,
            },
        })

    # 채집 안내
    if _matches_command(utterance, "채집 안내"):
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "오늘의 마음을 기록하면, 감정 원석으로 채집해드릴게요.",
                    "description": (
                        "채집 방법\n"
                        "글이나 사진으로 자유롭게 기록하면 돼요.\n\n"
                        "웹에서 더 많이\n"
                        "원석 강화, 도감, 기록 모아보기는 웹에서 가능해요.\n\n"
                        "개인정보 안내\n"
                        "모든 기록은 안전하게 저장되며,\n"
                        "관리자는 기록에 임의로 접근하지 않아요.\n"
                        "문의나 도움이 필요하신 경우 언제든 채널로 말씀해주세요."
                    ),
                    "thumbnail": {"imageUrl": MASCOT_IMAGE},
                    "buttons": [{"action": "webLink", "label": "세공소 가기", "webLinkUrl": WEB_URL}],
                }}],
                "quickReplies": BASE_QUICK_REPLIES,
            },
        })

    reflection = _safe_pending_reflection(user_id)
    if reflection and reflection.get("stage") == "awaiting_answer":
        linked_date = reflection.get("linked_date")
        if not isinstance(linked_date, date):
            linked_date = _today_kst()
        if utterance:
            background_tasks.add_task(
                save_reflection_answer,
                user_id,
                utterance,
                reflection["question_id"],
                reflection["question_text"],
                linked_date,
            )
        pending_reflection.pop(user_id, None)
        return JSONResponse(kakao_response("잘 담아뒀어요 ✎", custom_replies=BASE_QUICK_REPLIES))

    # 음성 전송 (현재는 분석 미지원 → 안내만 응답)
    if is_audio_url(utterance):
        print(f"[audio detected] user={user_id}, utterance={utterance}")
        return JSONResponse(kakao_response(
            AUDIO_NOT_SUPPORTED_MESSAGE,
            custom_replies=BASE_QUICK_REPLIES,
        ))

    # 영상 전송 (현재는 분석 미지원 → 안내만 응답)
    if is_video_url(utterance):
        print(f"[video detected] user={user_id}, utterance={utterance}")
        return JSONResponse(kakao_response(
            VIDEO_NOT_SUPPORTED_MESSAGE,
            custom_replies=BASE_QUICK_REPLIES,
        ))

    # 사진 전송
    if is_image_url(utterance):
        # 단순모드에서 사진 수신 시 바로 저장
        if pending_simple_record.get(user_id):
            background_tasks.add_task(
                save_simple_record_with_classification,
                user_id,
                "",
                True,
                utterance,
                trace_id=trace_id,
            )
            return JSONResponse(kakao_response(
                "사진이 바로 저장됐어요! ",
                custom_replies=BASE_QUICK_REPLIES
            ))
        print(f"[image detected] user={user_id}, utterance={utterance}")
        existing = pending_photo.get(user_id, {})
        if (
            isinstance(existing.get("urls"), list)
            and isinstance(existing.get("time"), datetime)
            and datetime.now() - existing["time"] <= PHOTO_TIMEOUT
        ):
            existing["urls"].append(utterance)
            existing["time"] = datetime.now()
            pending_photo[user_id] = existing
            count = len(existing["urls"])
            return JSONResponse(kakao_response(
                f"사진 {count}장이 모였어요! ✨\n"
                "텍스트도 함께 보내주시면 감정 원석을 찾아드려요.",
                custom_replies=PHOTO_QUICK_REPLIES
            ))
        else:
            pending_photo[user_id] = {"time": datetime.now(), "urls": [utterance]}
            return JSONResponse(kakao_response(
                "사진으로 오늘을 담아주셨네요.\n\n"
                "이 순간, 어떤 마음이었나요?\n"
                "한 줄만 더 적어주시면 감정 원석을 찾아드려요.\n"
                "10분 안에 적어주시면 사진과 함께 저장돼요! ⏰\n\n"
                "그냥 일상으로 남겨도 괜찮아요.",
                custom_replies=PHOTO_QUICK_REPLIES
            ))

    if not utterance:
        return JSONResponse(kakao_response("조금 더 자세히 감정을 알려주실 수 있나요?"))

    # 단순모드 텍스트 처리
    if pending_simple_record.get(user_id):
        background_tasks.add_task(
            save_simple_record_with_classification,
            user_id,
            utterance,
            False,
            None,
            trace_id=trace_id,
        )
        return JSONResponse(kakao_response(
            "기록됐어요! ",
            custom_replies=BASE_QUICK_REPLIES
        ))

    daily_data = _safe_pending_gem(user_id, require_text=True)
    if daily_data and daily_data.get("daily") and daily_data.get("awaiting_emotion_add"):
        stored_text = daily_data["text"]
        stored_has_photo = bool(daily_data.get("has_photo", False))
        stored_image_url = daily_data.get("image_url")
        combined_utterance = f"{stored_text}\n추가 감정: {utterance}"
        pending_gem.pop(user_id, None)
        if callback_url:
            background_tasks.add_task(
                _callback_task_retry,
                user_id,
                combined_utterance,
                callback_url,
                stored_has_photo,
                stored_image_url,
                trace_id=trace_id,
            )
            return JSONResponse({"version": "2.0", "useCallback": True})
        result = classify_emotion_with_supervisor(combined_utterance, trace_id=trace_id, user_id=user_id)
        return JSONResponse(_build_ai_response(user_id, combined_utterance, stored_has_photo, stored_image_url, result))

    greeting = _check_and_update_visit(user_id)

    has_photo, image_urls, photo_time = _safe_pending_photo(user_id)
    image_url = image_urls[0] if image_urls else None
    for _extra_url in image_urls[1:]:
        background_tasks.add_task(save_gem, user_id, "단순기록", "", True, _extra_url, None, trace_id=trace_id)
        _remember_today_pending_record(user_id, "단순기록", "", True, _extra_url, trace_id=trace_id)

    if callback_url:
        background_tasks.add_task(
            _callback_task, user_id, utterance, callback_url,
            photo_time,
            image_url,
            greeting,
            trace_id=trace_id,
        )
        return JSONResponse({"version": "2.0", "useCallback": True})

    result = classify_emotion_with_supervisor(utterance, trace_id=trace_id, user_id=user_id)
    response = _build_ai_response(user_id, utterance, has_photo, image_url, result)
    if result not in ("NOT_RECORD", "TIMEOUT") and result is not None:
        response = _prepend_today_record_count(response, user_id)
    if greeting:
        response = _prepend_greeting(response, greeting)
    return JSONResponse(response)
