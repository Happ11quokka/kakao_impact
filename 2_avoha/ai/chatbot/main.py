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
    or "https://chatbot-production-367e8.up.railway.app"
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

pending_photo: dict = {}
pending_gem: dict = {}
pending_emotion_selection: dict = {}
user_last_active: dict = {}  # {user_id: date(KST)}
pending_simple_record: dict = {}  # {user_id: True} 단순기록 모드 여부
pending_reflection: dict = {}  # {user_id: {question_id, question_text, stage, linked_date}}

PHOTO_TIMEOUT = timedelta(minutes=10)
reflection_schema_ready = False


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


def _db_get_today_count(user_id: str) -> int:
    """오늘(KST) 채집한 원석 수 (일상기록 제외). 에러 시 0 반환."""
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
              AND gem != '일상기록'
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
VIDEO_NOT_SUPPORTED_MESSAGE = (
    "영상으로 마음을 담아주셨네요. \n\n"
    "아직은 영상을 함께 들여다보지는 못해요. \n"
    "대신 한 줄 글이나 사진으로 적어주시면\n"
    "오늘의 감정 원석을 같이 찾아드릴게요. ✨"
)

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

REFLECTION_INVITE_QUICK_REPLIES = [
    {"label": "질문 받을게요", "action": "message", "messageText": "질문 받을게요"},
    {"label": "건너뛸게요", "action": "message", "messageText": "건너뛸게요"},
]

REFLECTION_QUESTION_QUICK_REPLIES = [
    {"label": "답할게요", "action": "message", "messageText": "답할게요"},
    {"label": "건너뛸게요", "action": "message", "messageText": "건너뛸게요"},
]

REFLECTION_ANSWER_QUICK_REPLIES = [
    {"label": "건너뛸게요", "action": "message", "messageText": "건너뛸게요"},
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
    week_ago = today - timedelta(days=6)
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(RAILWAY_DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM questions_log WHERE user_id = %s AND asked_date = %s LIMIT 1",
            (user_id, today),
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


def check_reflection_question(user_id: str, emotion: str = "", emotion_category: str = "", text_length: int = 0) -> dict:
    category = _normalize_reflection_category(emotion, emotion_category)
    if text_length < 15 or category == POSITIVE_REFLECTION_CATEGORY:
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
    emotion = GEM_TO_EMOTION.get(gem, gem)
    result = check_reflection_question(
        user_id=user_id,
        emotion=emotion,
        emotion_category=GEM_TO_REFLECTION_CATEGORY.get(gem, ""),
        text_length=len(record_text or ""),
    )
    if not result.get("should_ask"):
        return response

    pending_reflection[user_id] = {
        "question_id": result["question_id"],
        "question_text": result["question_text"],
        "stage": "invited",
        "linked_date": _today_kst(),
    }
    response.setdefault("template", {}).setdefault("outputs", []).append(
        {"simpleText": {"text": "잠깐, 하나만 물어봐도 될까요?"}}
    )
    response["template"]["quickReplies"] = REFLECTION_INVITE_QUICK_REPLIES
    return response


def _safe_pending_reflection(user_id: str) -> dict | None:
    data = pending_reflection.get(user_id)
    if not isinstance(data, dict) or not data.get("question_id") or not data.get("question_text"):
        pending_reflection.pop(user_id, None)
        return None
    return data


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
    """(오늘 채집 수, 전체 채집 수) — 일상기록 제외"""
    today_count = _db_get_today_count(user_id)
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


def kakao_save_complete(gem: str, today_count: int, user_id: str = "", alert_msg: str = "") -> dict:
    display = gem
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    description = "세공소에서 직접 다듬어볼 수 있어요."
    if today_count > 0:
        description += f"\n\n오늘 {today_count}번째 원석이에요! 🪨"
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
    try:
        text_length = int(_extract_payload_value(body, "text_length") or 0)
    except ValueError:
        text_length = 0

    return JSONResponse(check_reflection_question(user_id, emotion, emotion_category, text_length))


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

    reflection = _safe_pending_reflection(user_id)
    if reflection and utterance == "건너뛸게요":
        pending_reflection.pop(user_id, None)
        return JSONResponse(kakao_response("알겠어요 :)", custom_replies=BASE_QUICK_REPLIES))

    if reflection and utterance == "질문 받을게요":
        reflection["stage"] = "question_shown"
        return JSONResponse(kakao_response(
            reflection["question_text"],
            custom_replies=REFLECTION_QUESTION_QUICK_REPLIES
        ))

    if reflection and utterance == "답할게요":
        reflection["stage"] = "awaiting_answer"
        return JSONResponse(kakao_response(
            "편하게 적어주세요 :)",
            custom_replies=REFLECTION_ANSWER_QUICK_REPLIES
        ))

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
        gem_to_save = data["gem"]
        today_count = _db_get_today_count(user_id) + 1
        background_tasks.add_task(save_gem, user_id, gem_to_save, data["text"], bool(data.get("has_photo", False)), data.get("image_url"), data.get("ai_gems"))
        pending_gem.pop(user_id, None)
        alert_msg = check_negative_accumulation(user_id)
        response = kakao_save_complete(gem_to_save, today_count, user_id, alert_msg or "")
        response = _maybe_attach_reflection_invite(response, user_id, gem_to_save, data["text"])
        return JSONResponse(response)

    # 모두 채집 (복수 감정 전체 저장)
    if utterance == "모두 채집":
        sel = _safe_pending_emotion_selection(user_id)
        if not sel:
            return JSONResponse(kakao_response("저장할 원석이 없어요."))
        gems_to_save = [EMOTION_TO_GEM[e] for e in sel["emotions"] if e in EMOTION_TO_GEM]
        for gem in gems_to_save:
            background_tasks.add_task(save_gem, user_id, gem, sel["text"], bool(sel.get("has_photo", False)), sel.get("image_url"), sel.get("ai_gems"))
        pending_emotion_selection.pop(user_id, None)
        saved_names = ", ".join(gems_to_save)
        today_count = _db_get_today_count(user_id) + len(gems_to_save)
        msg = f"✨ {saved_names}{_josa_eul(saved_names)} 채집했어요!\n오늘 {today_count}번째 원석이에요! 🪨"
        alert_msg = check_negative_accumulation(user_id)
        if alert_msg:
            msg += alert_msg
        response = kakao_response(msg)
        for gem in gems_to_save:
            response = _maybe_attach_reflection_invite(response, user_id, gem, sel["text"])
            if user_id in pending_reflection:
                break
        return JSONResponse(response)

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
        data["awaiting_emotion_add"] = True
        return JSONResponse(kakao_response(
            "그 순간 어떤 마음이었는지 한 문장으로 더 적어주세요.\n"
            "예: 사실 조금 서운했어 / 그래도 뿌듯했어",
            custom_replies=[{"label": "이대로 저장", "action": "message", "messageText": "이대로 저장"}],
        ))

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
    if utterance == "채집 안내":
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

    # 영상 전송 (현재는 분석 미지원 → 안내만 응답)
    if is_video_url(utterance):
        print(f"[video detected] user={user_id}, utterance={utterance}")
        return JSONResponse(kakao_response(
            VIDEO_NOT_SUPPORTED_MESSAGE,
            custom_replies=BASE_QUICK_REPLIES,
        ))

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
            )
            return JSONResponse({"version": "2.0", "useCallback": True})
        result = classify_emotion_with_supervisor(combined_utterance)
        return JSONResponse(_build_ai_response(user_id, combined_utterance, stored_has_photo, stored_image_url, result))

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

