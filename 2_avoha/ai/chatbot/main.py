from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from collections import defaultdict
import requests
import os
import json
import time
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
import psycopg2

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
ALERT_EMAIL = os.getenv("ALERT_EMAIL")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
RAILWAY_DATABASE_URL = os.getenv("RAILWAY_DATABASE_URL")
ASSET_BASE_URL = (
    os.getenv("ASSET_BASE_URL")
    or os.getenv("RAILWAY_PUBLIC_DOMAIN")
    or "https://sentiment-chatbot-production.up.railway.app"
).rstrip("/")
if not ASSET_BASE_URL.startswith(("http://", "https://")):
    ASSET_BASE_URL = f"https://{ASSET_BASE_URL}"

app = FastAPI()

if os.path.isdir("gems"):
    app.mount("/gems", StaticFiles(directory="gems"), name="gems")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[unhandled error] {exc}")
    return JSONResponse(
        status_code=200,
        content={
            "version": "2.0",
            "template": {
                "outputs": [{"simpleText": {"text": "잠시 오류가 발생했어요. 다시 시도해주세요!"}}],
                "quickReplies": [
                    {"label": "원석 도감", "action": "message", "messageText": "도감"},
                    {"label": "내 원석 보기", "action": "message", "messageText": "내 원석"},
                    {"label": "채집 안내", "action": "message", "messageText": "채집 안내"},
                ],
            },
        },
    )

user_count: dict = {}
pending_photo: dict = {}
pending_gem: dict = {}
pending_emotion_selection: dict = {}
user_last_active: dict = {}  # {user_id: date(KST)}
pending_simple_record: dict = {}  # {user_id: True} 단순기록 모드 여부

PHOTO_TIMEOUT = timedelta(minutes=10)


def _today_kst() -> date:
    return datetime.now(tz=ZoneInfo("Asia/Seoul")).date()


def _safe_count(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


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


# --- DB 동기화 헬퍼 (collection_tickets 직접 조작) -------------------------
# Why: chatbot이 인메모리만 쓰면 백엔드 /me 응답(`collection_tickets` SELECT)과
#      불일치 → 카톡과 웹 화면 채집권 숫자가 어긋남. provider_user_key로
#      users.id 조회 후 DB 차감을 시도, 실패(미로그인 등)하면 인메모리 fallback.

def _get_user_uuid(user_id_hash: str) -> str | None:
    """provider_user_key로 users.id 조회. 없으면 None."""
    if not RAILWAY_DATABASE_URL:
        return None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM users WHERE provider_user_key = %s LIMIT 1",
            (user_id_hash,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return str(row[0]) if row else None
    except Exception as e:
        print(f"[_get_user_uuid error] {e}")
        return None


def _db_get_remaining(user_uuid: str) -> int | None:
    """오늘(KST) 잔여 채집권 조회. row 없으면 5, 에러 시 None."""
    if not RAILWAY_DATABASE_URL:
        return None
    today = _today_kst()
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            "SELECT remaining FROM collection_tickets WHERE user_id = %s AND date = %s LIMIT 1",
            (user_uuid, today),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row[0] if row else 5
    except Exception as e:
        print(f"[_db_get_remaining error] {e}")
        return None


def _db_decrement_ticket(user_uuid: str, n: int) -> tuple[int, int] | None:
    """
    오늘(KST) 채집권에서 n개 차감 (UPSERT + FOR UPDATE 단일 TX).
    Returns: (actual_decremented, remaining) or None on error.
    """
    if not RAILWAY_DATABASE_URL:
        return None
    today = _today_kst()
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        # 없으면 5로 INSERT, 있으면 그대로 (atomic)
        cur.execute(
            """
            INSERT INTO collection_tickets (user_id, date, remaining)
            VALUES (%s, %s, 5)
            ON CONFLICT (user_id, date) DO NOTHING
            """,
            (user_uuid, today),
        )
        # FOR UPDATE로 같은 TX 안에서 lock
        cur.execute(
            "SELECT remaining FROM collection_tickets WHERE user_id = %s AND date = %s FOR UPDATE",
            (user_uuid, today),
        )
        row = cur.fetchone()
        if row is None:
            conn.rollback()
            return None
        current = row[0]
        actual = min(n, current)
        new_remaining = current - actual
        cur.execute(
            "UPDATE collection_tickets SET remaining = %s WHERE user_id = %s AND date = %s",
            (new_remaining, user_uuid, today),
        )
        conn.commit()
        return (actual, new_remaining)
    except Exception as e:
        print(f"[_db_decrement_ticket error] {e}")
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


def get_remaining_count(user_id: str) -> int:
    # DB 우선 (OAuth 로그인된 사용자), 실패 시 인메모리 fallback
    user_uuid = _get_user_uuid(user_id)
    if user_uuid is not None:
        db_val = _db_get_remaining(user_uuid)
        if db_val is not None:
            return db_val
    today = _today_kst()
    record = user_count.get(user_id)
    if not isinstance(record, dict) or record.get("date") != today:
        return 5
    return max(0, 5 - _safe_count(record.get("count")))


def check_and_increment(user_id: str) -> int | None:
    """채집권 1개 차감. 잔여 수 반환, 이미 소진 시 None."""
    user_uuid = _get_user_uuid(user_id)
    if user_uuid is not None:
        result = _db_decrement_ticket(user_uuid, 1)
        if result is not None:
            actual, remaining = result
            if actual == 0:
                return None
            return remaining
        # DB 실패 → 인메모리 fallback
    today = _today_kst()
    record = user_count.get(user_id)
    if not isinstance(record, dict) or record.get("date") != today:
        user_count[user_id] = {"date": today, "count": 1}
        return 4
    current = _safe_count(record.get("count"))
    if current >= 5:
        return None
    record["count"] = current + 1
    return 5 - record["count"]


def check_and_increment_n(user_id: str, n: int) -> tuple[int, int]:
    """채집권 n개 차감. (실제 차감 수, 잔여 수) 반환."""
    user_uuid = _get_user_uuid(user_id)
    if user_uuid is not None:
        result = _db_decrement_ticket(user_uuid, n)
        if result is not None:
            return result
        # DB 실패 → 인메모리 fallback
    today = _today_kst()
    record = user_count.get(user_id)
    current = 0 if (not isinstance(record, dict) or record.get("date") != today) else _safe_count(record.get("count"))
    can = max(0, 5 - current)
    actual = min(n, can)
    if actual > 0:
        user_count[user_id] = {"date": today, "count": current + actual}
    return actual, max(0, 5 - current - actual)


def is_image_url(text: str) -> bool:
    if " " in text or "\n" in text:
        return False
    return text.startswith("http") and any(
        ext in text.lower() for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]
    )


EMOTION_TO_GEM = {
    "우울함": "우울함 조각", "외로움": "외로움 조각", "상실감": "상실감 조각",
    "서러움": "서러움 조각", "실망감": "실망감 조각",
    "걱정": "걱정 조각", "긴장감": "긴장감 조각", "위축감": "위축감 조각",
    "짜증": "짜증 조각", "억울함": "억울함 조각", "화남": "화남 조각", "적대감": "적대감 조각",
    "즐거움": "즐거움 조각", "감사함": "감사함 조각", "설렘": "설렘 조각",
    "뿌듯함": "뿌듯함 조각", "편안함": "편안함 조각",
    "무기력함": "무기력함 조각", "공허함": "공허함 조각", "후회": "후회 조각",
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
    # 불안/두려움 계열
    "걱정 조각": "solace",        # 오팔
    "긴장감 조각": "solace",
    "위축감 조각": "solace",
    # 복잡/모호 계열
    "무기력함 조각": "untroubled", # 월장석
    "공허함 조각": "solace",      # 오팔
    "후회 조각": "regret",        # 연수정
}

EMOTION_CATEGORIES = {
    "슬픔 계열": ["우울함", "외로움", "상실감", "서러움", "실망감"],
    "불안/두려움 계열": ["걱정", "긴장감", "위축감"],
    "분노 계열": ["짜증", "억울함", "화남", "적대감"],
    "기쁨/긍정 계열": ["즐거움", "감사함", "설렘", "뿌듯함", "편안함"],
    "복잡/모호 계열": ["무기력함", "공허함", "후회"],
}

NEGATIVE_GEMS = {
    EMOTION_TO_GEM[e]
    for cat, emotions in EMOTION_CATEGORIES.items()
    if cat != "기쁨/긍정 계열"
    for e in emotions
}

REMAINING_MESSAGES = {
    4: "채집권 4개가 남았어요! 신나게 원석 채집을 이어가요!",
    3: "채집권 3개가 남았어요. 오늘도 잘 기록하고 있어요.",
    2: "채집권 2개가 남았어요. 오늘 빛나는 순간이 또 있을까요?",
    1: "이제 채집권이 1개 남았어요. 오늘의 마지막 원석, 어떤 마음으로 채집해볼까요?",
    0: "오늘의 채집권을 모두 썼어요.\n내일 오전 10시에 다시 채워드릴게요.",
}

DANGER_KEYWORDS = [
    "죽고싶", "죽고 싶", "자살", "자해", "사라지고싶", "사라지고 싶",
    "없어지고싶", "없어지고 싶", "살기싫", "살기 싫", "죽어버리고싶", "끝내고싶",
]
HARMFUL_KEYWORDS = [
    "섹스", "야동", "포르노", "성인", "씨발", "개새끼", "죽여", "죽일", "살인",
    "협박", "폭행", "강간", "테러",
]
DANGER_MESSAGE = (
    "많이 힘드시겠어요. 혼자 감당하기 어려운 감정이 느껴질 때는 도움을 받을 수 있어요.\n\n"
    "📞 자살예방상담전화: 1393 (24시간)\n"
    "📞 정신건강위기상담전화: 1577-0199 (24시간)\n\n"
    "당신의 이야기를 들어줄 사람이 있어요. 꼭 전화해보세요."
)
HARMFUL_MESSAGE = "해당 기록은 서비스 정책에 따라 채집이 어려워요. 일상 속 소중한 순간을 담아 다시 보내주세요."

WEB_URL = "https://frontend-production-09f81.up.railway.app/login"
_IMG_BASE = f"{ASSET_BASE_URL}/gems/"
DEFAULT_CARD_IMAGE = _IMG_BASE + "depression.png"
ALL_GEMS_IMAGE = _IMG_BASE + "all_gems.png"
MASCOT_IMAGE = _IMG_BASE + "character_2x1.png"
GEM_IMAGE_URL = {
    "우울함 조각":   _IMG_BASE + "depression.png",
    "외로움 조각":   _IMG_BASE + "loneliness.png",
    "상실감 조각":   _IMG_BASE + "loss.png",
    "서러움 조각":   _IMG_BASE + "sorrow.png",
    "실망감 조각":   _IMG_BASE + "disappointment.png",
    "걱정 조각":     _IMG_BASE + "worry.png",
    "긴장감 조각":   _IMG_BASE + "tension.png",
    "위축감 조각":   _IMG_BASE + "timidity.png",
    "짜증 조각":     _IMG_BASE + "irritation.png",
    "억울함 조각":   _IMG_BASE + "resentment.png",
    "화남 조각":     _IMG_BASE + "anger.png",
    "적대감 조각":   _IMG_BASE + "hostility.png",
    "즐거움 조각":   _IMG_BASE + "joy.png",
    "감사함 조각":   _IMG_BASE + "gratitude.png",
    "설렘 조각":     _IMG_BASE + "flutter.png",
    "뿌듯함 조각":   _IMG_BASE + "pride.png",
    "편안함 조각":   _IMG_BASE + "serenity.png",
    "무기력함 조각": _IMG_BASE + "lethargy.png",
    "공허함 조각":   _IMG_BASE + "emptiness.png",
    "후회 조각":     _IMG_BASE + "regret.png",
}

BASE_QUICK_REPLIES = [
    {"label": "원석 도감", "action": "message", "messageText": "도감"},
    {"label": "내 원석 보기", "action": "message", "messageText": "내 원석"},
    {"label": "채집 안내", "action": "message", "messageText": "채집 안내"},
    {"label": "모드 전환", "action": "message", "messageText": "모드"},
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
    {"label": "감정 추가하기", "action": "message", "messageText": "감정 추가하기"},
    {"label": "이대로 저장", "action": "message", "messageText": "이대로 저장"},
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


def _call_openai_chat(prompt: str, max_tokens: int = 50, log_prefix: str = "classify_emotion") -> dict | None:
    for attempt in range(1, 3):
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
            try:
                data = response.json()
            except ValueError:
                data = None

            if response.status_code == 200 and data and "choices" in data:
                return data

            print(f"[{log_prefix} status] attempt={attempt} status={response.status_code}")
            print(f"[{log_prefix} body] {response.text[:1000]}")
            if attempt < 2 and response.status_code in {408, 409, 429, 500, 502, 503, 504}:
                time.sleep(attempt)
                continue
            return None
        except requests.exceptions.Timeout:
            print(f"[{log_prefix} timeout] attempt={attempt}")
            if attempt < 2:
                time.sleep(attempt)
                continue
            return None
        except requests.exceptions.RequestException as e:
            print(f"[{log_prefix} request error] attempt={attempt} error={e}")
            if attempt < 2:
                time.sleep(attempt)
                continue
            return None

    return None


def classify_emotion(text: str) -> list[str] | str | None:
    emotion_list = ", ".join(EMOTION_TO_GEM.keys())
    prompt = (
        "다음 입력을 세 가지로 분류해줘.\n"
        "1. 인사말만 있거나 감정/일상 내용이 없으면: '기록아님'만 답해\n"
        "2. 일상 사실만 나열되고 감정이 전혀 느껴지지 않으면(예: '수업 들었어', '밥 먹었어', '회사 갔다왔어'): '일상기록'만 답해\n"
        "3. 감정이 담긴 기록이면: 아래 감정 목록 중 해당하는 단어로 답해줘\n"
        "   감정 단어가 직접 등장하지 않아도 문장의 맥락과 뉘앙스에서 감정이 느껴지면 추론해서 답해줘.\n"
        "   (예: '드디어 배가 나아졌어' → 편안함, '오늘 발표 잘 끝났다' → 뿌듯함, '기다리던 택배 왔다' → 설렘)\n"
        f"감정 목록: {emotion_list}\n"
        "여러 감정이 담겨있으면 쉼표로만 구분해서 최대 3개까지만 답해줘. "
        "감정이 하나라면 단어 하나만 답해줘. 다른 말은 절대 하지 마.\n\n"
        f"입력: {text}"
    )
    if not OPENAI_API_KEY:
        print("[classify_emotion config error] OPENAI_API_KEY is not configured")
        return "TIMEOUT"

    try:
        data = _call_openai_chat(prompt)
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


def supervisor_check_classification(text: str, initial_result: list[str] | str | None) -> list[str] | str | None:
    if initial_result == "TIMEOUT" or initial_result is None:
        return initial_result
    if os.getenv("SUPERVISOR_ENABLED", "true").lower() in {"0", "false", "no", "off"}:
        return initial_result
    if not OPENAI_API_KEY:
        return initial_result

    emotion_list = ", ".join(EMOTION_TO_GEM.keys())
    gem_list = ", ".join(EMOTION_TO_GEM.values())
    initial_text = _classification_to_text(initial_result)
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
        f"1차 분류 결과: {initial_text}\n\n"
        "검증 기준:\n"
        "- 발화에 감정 맥락이 있는데 '일상기록' 또는 '기록아님'으로 빠졌는지 확인한다.\n"
        "- 단순 사실 나열인데 감정 원석으로 과잉 분류했는지 확인한다.\n"
        "- 허용 목록 밖의 값은 실패로 본다.\n"
        "- 애매하면 사용자에게 감정을 더 물어볼 수 있도록 '일상기록'을 선택한다.\n\n"
        "반드시 JSON만 답해라. 예시:\n"
        "{\"pass\": false, \"corrected_result\": \"일상기록\", \"reason\": \"감정 단서가 약함\"}"
    )

    try:
        data = _call_openai_chat(prompt, max_tokens=180, log_prefix="supervisor")
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
        return initial_result


def classify_emotion_with_supervisor(text: str) -> list[str] | str | None:
    initial_result = classify_emotion(text)
    return supervisor_check_classification(text, initial_result)


def save_gem(user_id: str, gem: str, record_text: str, has_photo: bool, image_url: str = None, ai_gems: str = None):
    if not RAILWAY_DATABASE_URL:
        print("[save_gem railway error] RAILWAY_DATABASE_URL is not configured")
        return

    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO chatbot (user_id, gem, record_text, has_photo, image_url, ai_gems) VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, gem, record_text, has_photo, image_url, ai_gems),
        )

        # gems 테이블에도 INSERT → 인벤토리 "광물" 탭에 표시
        emotion_code = CHATBOT_GEM_TO_EMOTION_CODE.get(gem)
        if emotion_code:
            cur.execute(
                "SELECT id FROM users WHERE provider_user_key = %s LIMIT 1",
                (user_id,),
            )
            user_row = cur.fetchone()
            if user_row:
                user_uuid = user_row[0]
                cur.execute(
                    "INSERT INTO gems (user_id, emotion_code, tier, source) "
                    "VALUES (%s, %s, 1, %s)",
                    (user_uuid, emotion_code, "chatbot"),
                )
                print(f"[save_gem] synced to gems table: user={user_uuid}, emotion={emotion_code}")
            else:
                print(f"[save_gem] no user found for provider_user_key={user_id}, skipping gems insert")

        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[save_gem railway error] {e}")




def get_gem_stats(user_id: str) -> tuple[int, int]:
    """(오늘 채집 수, 전체 채집 수) — 일상기록 제외"""
    today = _today_kst()
    record = user_count.get(user_id)
    today_count = _safe_count(record.get("count")) if (isinstance(record, dict) and record.get("date") == today) else 0

    total_count = 0
    if RAILWAY_DATABASE_URL:
        try:
            conn = psycopg2.connect(RAILWAY_DATABASE_URL)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM chatbot WHERE user_id = %s AND gem != '일상기록'", (user_id,))
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


def _safe_pending_photo(user_id: str) -> tuple[bool, str | None, datetime | None]:
    data = pending_photo.get(user_id)
    if not isinstance(data, dict):
        pending_photo.pop(user_id, None)
        return False, None, None

    photo_time = data.get("time")
    photo_url = data.get("url")
    if not isinstance(photo_time, datetime) or not photo_url:
        pending_photo.pop(user_id, None)
        return False, None, None

    if datetime.now() - photo_time > PHOTO_TIMEOUT:
        pending_photo.pop(user_id, None)
        return False, None, None

    return True, str(photo_url), photo_time


def kakao_save_complete(gem: str, remaining: int, user_id: str = "", alert_msg: str = "") -> dict:
    display = gem
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    remaining_msg = REMAINING_MESSAGES.get(remaining, "")
    description = "세공소에서 직접 다듬어볼 수 있어요."
    if remaining_msg:
        description += f"\n\n{remaining_msg}"
    if alert_msg:
        description += alert_msg
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"basicCard": {
                "title": f"✨ {display}{_josa_eul(display)} 채집했어요!",
                "description": description,
                "thumbnail": {"imageUrl": GEM_IMAGE_URL.get(gem, DEFAULT_CARD_IMAGE)},
                "buttons": [{"action": "webLink", "label": "세공소 가기", "webLinkUrl": link_url}],
            }}],
            "quickReplies": BASE_QUICK_REPLIES,
        },
    }



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
                        {"action": "message", "label": "내 원석 보기", "messageText": "내 원석"},
                        {"action": "message", "label": "채집 안내", "messageText": "채집 안내"},
                        {"action": "webLink", "label": "세공소 가기", "webLinkUrl": WEB_URL},
                    ],
                }}],
            },
        }
    if result == "DAILY_RECORD":
        pending_gem.pop(user_id, None)
        pending_emotion_selection.pop(user_id, None)
        pending_gem[user_id] = {"gem": None, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": None, "daily": True}
        return kakao_response(
            "오늘의 일상이 담겼어요.\n\n"
            "이 순간 어떤 마음이었어요?\n"
            "감정을 함께 남기면 원석으로 채집해드려요.\n\n"
            "이대로 일상 기록만 남겨도 괜찮아요.",
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
    valid_gems = [g for g in result if g in VALID_GEMS]

    pending_gem.pop(user_id, None)
    pending_emotion_selection.pop(user_id, None)
    pending_photo.pop(user_id, None)

    if not valid_gems:
        pending_gem[user_id] = {"gem": None, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": None, "daily": True}
        return kakao_response(
            "오늘의 일상이 담겼어요.\n\n"
            "이 순간 어떤 마음이었어요?\n"
            "감정을 함께 남기면 원석으로 채집해드려요.\n\n"
            "이대로 일상 기록만 남겨도 괜찮아요.",
            custom_replies=DAILY_QUICK_REPLIES
        )

    if len(valid_gems) >= 2:
        emotion_words = [GEM_TO_EMOTION[g] for g in valid_gems if g in GEM_TO_EMOTION]
        pending_emotion_selection[user_id] = {
            "emotions": emotion_words, "text": utterance,
            "has_photo": has_photo, "image_url": image_url,
            "ai_gems": ",".join(valid_gems),
        }
        gem_names = ", ".join(valid_gems)
        return kakao_response(
            f"오늘 여러 마음이 함께 있었네요.\n\n"
            f"{gem_names}이 보여요.\n\n"
            "이 원석들로 오늘을 저장해드릴까요?",
            custom_replies=MULTI_EMOTION_QUICK_REPLIES
        )

    gem = valid_gems[0]
    emotion = GEM_TO_EMOTION.get(gem, "")
    pending_gem[user_id] = {"gem": gem, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": gem, "reclassify_step": 0}
    return kakao_response(
        f"{emotion}{_josa_i(emotion)} 느껴졌어요.\n"
        f"{gem}{_josa_eul(gem)} 채집해드릴까요?\n\n"
        "다른 감정이었다면 알려주세요.",
        custom_replies=_gem_save_quick_replies(gem)
    )


def _prepend_greeting(response: dict, greeting: str) -> dict:
    if not greeting:
        return response
    outputs = response.get("template", {}).get("outputs", [])
    response["template"]["outputs"] = [{"simpleText": {"text": greeting}}] + outputs
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
        return "닥토공방에 처음 오셨군요! 반가워요 😊"
    if last < today:
        return "오늘도 돌아오셨군요! 🌟"
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


def _callback_task(user_id: str, utterance: str, callback_url: str, photo_time, photo_url: str | None, greeting: str | None = None):
    has_photo = bool(isinstance(photo_time, datetime) and photo_url and datetime.now() - photo_time <= PHOTO_TIMEOUT)
    image_url = str(photo_url) if has_photo else None
    result = classify_emotion_with_supervisor(utterance)
    response = _build_ai_response(user_id, utterance, has_photo, image_url, result)
    if greeting:
        response = _prepend_greeting(response, greeting)
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[callback post error] {e}")


def _callback_task_retry(user_id: str, utterance: str, callback_url: str, has_photo: bool, image_url: str | None):
    result = classify_emotion_with_supervisor(utterance)
    response = _build_ai_response(user_id, utterance, has_photo, image_url, result)
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[callback post error] {e}")


def _run_emotion_analysis(user_id: str) -> str:
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
    data = _call_openai_chat(prompt, max_tokens=300, log_prefix="emotion_analysis")
    if not data:
        return "분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
    return data["choices"][0]["message"]["content"].strip()


def _callback_task_analysis(user_id: str, callback_url: str):
    result = _run_emotion_analysis(user_id)
    response = kakao_response(result, custom_replies=BASE_QUICK_REPLIES)
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[_callback_task_analysis error] {e}")


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
    except Exception as e:
        print(f"[webhook json error] {e}")
        return JSONResponse(kakao_response("요청을 읽지 못했어요. 메시지를 다시 보내주세요."))

    user_id, utterance, callback_url = _extract_kakao_request(body)

    if any(kw in utterance for kw in DANGER_KEYWORDS):
        background_tasks.add_task(send_alert_email, "[닥토공방] 위험 기록 감지", f"유저 ID: {user_id}\n내용: {utterance}")
        return JSONResponse(kakao_response(DANGER_MESSAGE))

    if any(kw in utterance for kw in HARMFUL_KEYWORDS):
        background_tasks.add_task(send_alert_email, "[닥토공방] 유해 기록 감지", f"유저 ID: {user_id}\n내용: {utterance}")
        return JSONResponse(kakao_response(HARMFUL_MESSAGE))

    # 모드 선택 메뉴
    if utterance == "모드":
        pending_simple_record.pop(user_id, None)
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"simpleText": {"text": "어떤 방식으로 기록할까요?\n\n 감정분류: AI가 감정 원석을 찾아드려요.\n 단순기록: 응답 없이 바로 저장돼요.\n 감정분석: 지금까지의 기록을 분석해드려요."}}],
                "quickReplies": [
                    {"label": " 감정분류", "action": "message", "messageText": "감정분류 모드"},
                    {"label": " 단순기록", "action": "message", "messageText": "단순기록 모드"},
                    {"label": " 감정분석", "action": "message", "messageText": "감정분석"},
                ],
            }
        })

    # 감정분류 모드 선택
    if utterance == "감정분류 모드":
        pending_simple_record.pop(user_id, None)
        return JSONResponse(kakao_response(
            " 감정분류 모드예요.\n일상을 보내주시면 AI가 감정 원석을 찾아드려요!",
            custom_replies=BASE_QUICK_REPLIES
        ))

    # 단순기록 모드 선택
    if utterance == "단순기록 모드":
        pending_simple_record[user_id] = True
        return JSONResponse(kakao_response(
            " 단순기록 모드예요.\n기록을 보내주시면 바로 저장해드릴게요!",
            custom_replies=BASE_QUICK_REPLIES
        ))

    # 감정분석
    if utterance == "감정분석":
        if callback_url:
            background_tasks.add_task(_callback_task_analysis, user_id, callback_url)
            return JSONResponse({"version": "2.0", "useCallback": True})
        result = _run_emotion_analysis(user_id)
        return JSONResponse(kakao_response(result, custom_replies=BASE_QUICK_REPLIES))

    # 다시 시도 (타임아웃 후 재분류)
    if utterance == "다시 시도":
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("다시 시도할 기록이 없어요. 일상을 다시 보내주세요!"))
        saved_utterance = data["text"]
        saved_has_photo = bool(data.get("has_photo", False))
        saved_image_url = data.get("image_url")
        pending_gem.pop(user_id, None)
        if callback_url:
            background_tasks.add_task(_callback_task_retry, user_id, saved_utterance, callback_url, saved_has_photo, saved_image_url)
            return JSONResponse({"version": "2.0", "useCallback": True})
        result = classify_emotion_with_supervisor(saved_utterance)
        return JSONResponse(_build_ai_response(user_id, saved_utterance, saved_has_photo, saved_image_url, result))

    # 다시 찾을게요 — 1회차: 카테고리, 2회차: 전체 20개
    if utterance == "다시 찾을게요":
        data = _safe_pending_gem(user_id)
        if not data:
            return JSONResponse(kakao_response("저장 대기 중인 원석이 없어요. 일상을 먼저 보내주세요!"))
        step = data.get("reclassify_step", 0)
        if step < 2:
            data["reclassify_step"] = 1
            return JSONResponse({
                "version": "2.0",
                "template": {
                    "outputs": [
                        {"simpleText": {"text": "어떤 결에 더 가까운가요?"}},
                        {"basicCard": {
                            "title": "원하는 감정이 없다면",
                            "description": "일상 기록으로도 저장할 수 있어요.",
                            "thumbnail": {"imageUrl": MASCOT_IMAGE},
                            "buttons": [{"action": "message", "label": "일상으로 저장", "messageText": "이대로 저장"}],
                        }},
                    ],
                    "quickReplies": CATEGORY_QUICK_REPLIES,
                },
            })
        else:
            data["reclassify_step"] = 0
            return JSONResponse(kakao_response("어떤 감정이 가장 가까운가요?", show_emotion_buttons=True))

    # 맞아요 (저장)
    if utterance == "맞아요":
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("저장할 원석이 없어요. 일상을 먼저 보내주세요!"))
        if not data.get("gem"):
            return JSONResponse(kakao_response("감정을 먼저 선택해주세요!", show_emotion_buttons=True))
        remaining = check_and_increment(user_id)
        if remaining is None:
            pending_gem.pop(user_id, None)
            return JSONResponse(kakao_response(
                "오늘 채집 바구니가 가득 찼습니다! 🧺\n"
                "5개를 모두 줍다니 엄청난 하루를 보내셨군요!\n\n"
                "내일 오전 10시에 다시 채워드릴게요."
            ))
        gem_to_save = data["gem"]
        background_tasks.add_task(save_gem, user_id, gem_to_save, data["text"], bool(data.get("has_photo", False)), data.get("image_url"), data.get("ai_gems"))
        pending_gem.pop(user_id, None)
        alert_msg = check_negative_accumulation(user_id)
        return JSONResponse(kakao_save_complete(gem_to_save, remaining, user_id, alert_msg or ""))

    # 모두 채집 (복수 감정 전체 저장)
    if utterance == "모두 채집":
        sel = _safe_pending_emotion_selection(user_id)
        if not sel:
            return JSONResponse(kakao_response("저장할 원석이 없어요."))
        gems_to_save = [EMOTION_TO_GEM[e] for e in sel["emotions"] if e in EMOTION_TO_GEM]
        actual, remaining = check_and_increment_n(user_id, len(gems_to_save))
        if actual == 0:
            pending_emotion_selection.pop(user_id, None)
            return JSONResponse(kakao_response("오늘 채집 바구니가 가득 찼습니다! 🧺\n내일 오전 10시에 다시 채워드릴게요."))
        for gem in gems_to_save[:actual]:
            background_tasks.add_task(save_gem, user_id, gem, sel["text"], bool(sel.get("has_photo", False)), sel.get("image_url"), sel.get("ai_gems"))
        pending_emotion_selection.pop(user_id, None)
        saved_names = ", ".join(gems_to_save[:actual])
        remaining_msg = REMAINING_MESSAGES.get(remaining, "")
        skipped = len(gems_to_save) - actual
        msg = f"✨ {saved_names}{_josa_eul(saved_names)} 채집했어요!"
        if skipped > 0:
            msg += f"\n채집권이 부족해 {skipped}개는 채집하지 못했어요."
        if remaining_msg:
            msg += f"\n\n{remaining_msg}"
        alert_msg = check_negative_accumulation(user_id)
        if alert_msg:
            msg += alert_msg
        return JSONResponse(kakao_response(msg))

    # 골라서 채집 (복수 감정 중 선택)
    if utterance == "골라서 채집":
        sel = _safe_pending_emotion_selection(user_id)
        if not sel:
            return JSONResponse(kakao_response("저장할 원석이 없어요."))
        emotion_buttons = [{"label": e, "action": "message", "messageText": e} for e in sel["emotions"]]
        return JSONResponse(kakao_response("어떤 원석을 채집할까요?", custom_replies=emotion_buttons))

    # 감정 추가하기 (일상 기록 후 감정 추가)
    if utterance == "감정 추가하기":
        data = _safe_pending_gem(user_id, require_text=True)
        if not data or not data.get("daily"):
            return JSONResponse(kakao_response("먼저 일상을 기록해주세요!"))
        stored_text = data["text"]
        stored_has_photo = bool(data.get("has_photo", False))
        stored_image_url = data.get("image_url")
        if callback_url:
            background_tasks.add_task(_callback_task_retry, user_id, stored_text, callback_url, stored_has_photo, stored_image_url)
            return JSONResponse({"version": "2.0", "useCallback": True})
        result = classify_emotion_with_supervisor(stored_text)
        return JSONResponse(_build_ai_response(user_id, stored_text, stored_has_photo, stored_image_url, result))

    # 이대로 저장 (일상 기록만 저장, 채집권 미사용)
    if utterance == "이대로 저장":
        data = _safe_pending_gem(user_id, require_text=True)
        if not data:
            return JSONResponse(kakao_response("저장할 기록이 없어요. 일상을 먼저 보내주세요!"))
        background_tasks.add_task(save_gem, user_id, "일상기록", data["text"], bool(data.get("has_photo", False)), data.get("image_url"), None)
        pending_gem.pop(user_id, None)
        return JSONResponse(kakao_response("일상 기록이 저장됐어요! 📝\n오늘도 소중한 순간을 담아주셨네요."))

    # 일상으로 저장 (사진 → 일상 기록, 채집권 미사용)
    if utterance == "일상으로 저장":
        has_photo, photo_url, _ = _safe_pending_photo(user_id)
        if has_photo and photo_url:
            background_tasks.add_task(save_gem, user_id, "일상기록", "", True, photo_url, None)
            pending_photo.pop(user_id, None)
            return JSONResponse(kakao_response("사진이 일상 기록으로 저장됐어요! 📝"))
        return JSONResponse(kakao_response("저장할 사진이 없어요. 사진을 먼저 보내주세요!"))

    # 감정 적기 (사진 후 텍스트 유도)
    if utterance == "감정 적기":
        return JSONResponse(kakao_response(
            "오늘 있었던 일이나 지금 느끼는 마음을 적어봐요.\n짧게 적어도 괜찮아요!",
            hide_buttons=True
        ))

    # 감정 퀵버튼 선택
    if utterance in EMOTION_TO_GEM:
        gem = EMOTION_TO_GEM[utterance]
        sel = _safe_pending_emotion_selection(user_id)
        print(f"[emotion click] utterance={utterance}, sel={sel}, pending_gem={pending_gem.get(user_id)}")
        if sel and utterance in sel["emotions"]:
            pending_emotion_selection.pop(user_id, None)
            pending_gem[user_id] = {"gem": gem, "text": sel["text"], "has_photo": bool(sel.get("has_photo", False)), "image_url": sel.get("image_url"), "ai_gems": sel.get("ai_gems"), "reclassify_step": 0}
            return JSONResponse(kakao_response(f"{gem}{_josa_eul(gem)} 선택하셨어요! ✨\n저장할까요?", custom_replies=_gem_save_quick_replies(gem)))
        existing = _safe_pending_gem(user_id)
        if existing:
            existing["gem"] = gem
            existing["reclassify_step"] = 0
            existing.pop("direct_input", None)
            return JSONResponse(kakao_response(f"{gem}으로 바꿨어요! ✨\n저장할까요?", custom_replies=_gem_save_quick_replies(gem)))
        return JSONResponse(kakao_response("먼저 오늘의 일상을 적어주세요 🪨\n어떤 일이 있었는지 보내주시면 원석으로 저장해드릴게요!"))

    # 이전 단계로 (감정 선택 → 카테고리 선택)
    if utterance == "이전 단계로":
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
                        "thumbnail": {"imageUrl": MASCOT_IMAGE},
                        "buttons": [{"action": "message", "label": "일상으로 저장", "messageText": "이대로 저장"}],
                    }},
                ],
                "quickReplies": CATEGORY_QUICK_REPLIES,
            },
        })

    # 카테고리 선택 (재분류 1회차 → 2회차)
    if utterance in EMOTION_CATEGORIES:
        data = _safe_pending_gem(user_id)
        if not data:
            return JSONResponse(kakao_response("저장 대기 중인 원석이 없어요. 일상을 먼저 보내주세요!"))
        emotions_in_cat = EMOTION_CATEGORIES[utterance]
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
                        "thumbnail": {"imageUrl": MASCOT_IMAGE},
                        "buttons": [{"action": "message", "label": "일상으로 저장", "messageText": "이대로 저장"}],
                    }},
                ],
                "quickReplies": emotion_buttons,
            },
        })

    # 도감 조회
    if utterance == "도감":
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
                        "감정 원석은 총 20종,\n크게 다섯 가지 결을 가지고 있어요.\n\n"
                        "💙 슬픔의 결\n우울함 조각 · 외로움 조각 · 상실감 조각 · 서러움 조각 · 실망감 조각\n위로받고 싶은 일상의 순간들이 담겨요.\n\n"
                        "🤍 불안/두려움의 결\n걱정 조각 · 긴장감 조각 · 위축감 조각\n마음이 팽팽해지는 순간들이 담겨요.\n\n"
                        "🧡 분노의 결\n짜증 조각 · 억울함 조각 · 화남 조각 · 적대감 조각\n뜨겁고 단단한 감정들이 담겨요.\n\n"
                        "💛 기쁨/긍정의 결\n즐거움 조각 · 감사함 조각 · 설렘 조각 · 뿌듯함 조각 · 편안함 조각\n따뜻하고 빛나는 순간들이 담겨요.\n\n"
                        "🩶 복잡/모호의 결\n무기력함 조각 · 공허함 조각 · 후회 조각\n잘 정의되지 않는 감정들이 담겨요.\n\n"
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
    if utterance in ("내 원석", "원석 보기", "가방", "인벤토리"):
        pdata = _safe_pending_gem(user_id)
        if pdata and pdata.get("gem"):
            inv_replies = _gem_save_quick_replies(pdata["gem"], include_nav=True)
        elif pdata and pdata.get("retry"):
            inv_replies = RETRY_QUICK_REPLIES
        else:
            inv_replies = BASE_QUICK_REPLIES
        _, total_count = get_gem_stats(user_id)
        remaining = get_remaining_count(user_id)
        link_url = f"{WEB_URL}?kakao_hash={user_id}"
        if total_count == 0:
            desc = "아직 채집한 원석이 없어요.\n일상을 기록하면 원석으로 채집해드릴게요!"
        else:
            desc = (
                f"총 {total_count}개 보유 · 채집권 {remaining}개 남음\n\n"
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
    if utterance == "채집 안내":
        return JSONResponse({
            "version": "2.0",
            "template": {
                "outputs": [{"basicCard": {
                    "title": "오늘의 마음을 기록하면, 감정 원석으로 채집해드릴게요.",
                    "description": (
                        "채집 방법\n"
                        "글이나 사진으로 자유롭게 기록하면 돼요.\n\n"
                        "채집권\n"
                        "하루 5개까지 채집할 수 있어요.\n"
                        "다 써도 기록은 계속 남길 수 있어요.\n\n"
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

    # 사진 전송
    if is_image_url(utterance):
        # 단순기록 모드에서 사진 수신 시 바로 저장
        if pending_simple_record.get(user_id):
            background_tasks.add_task(save_gem, user_id, "단순기록", "", True, utterance, None)
            return JSONResponse(kakao_response(
                "사진이 바로 저장됐어요! ",
                custom_replies=BASE_QUICK_REPLIES
            ))
        print(f"[image detected] user={user_id}, utterance={utterance}")
        pending_photo[user_id] = {"time": datetime.now(), "url": utterance}
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

    # 단순기록 모드 텍스트 처리
    if pending_simple_record.get(user_id):
        background_tasks.add_task(save_gem, user_id, "단순기록", utterance, False, None, None)
        return JSONResponse(kakao_response(
            "기록됐어요! ",
            custom_replies=BASE_QUICK_REPLIES
        ))

    greeting = _check_and_update_visit(user_id)

    has_photo, image_url, photo_time = _safe_pending_photo(user_id)

    if callback_url:
        background_tasks.add_task(
            _callback_task, user_id, utterance, callback_url,
            photo_time,
            image_url,
            greeting,
        )
        return JSONResponse({"version": "2.0", "useCallback": True})

    result = classify_emotion_with_supervisor(utterance)
    response = _build_ai_response(user_id, utterance, has_photo, image_url, result)
    if greeting:
        response = _prepend_greeting(response, greeting)
    return JSONResponse(response)

