from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from datetime import date, datetime, timedelta
import requests
import asyncio
import threading
import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
import psycopg2
import anthropic

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
ALERT_EMAIL = os.getenv("ALERT_EMAIL")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
RAILWAY_DATABASE_URL = os.getenv("RAILWAY_DATABASE_URL")

anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[unhandled error] {exc}")
    from fastapi.responses import JSONResponse as _JSONResponse
    return _JSONResponse(
        status_code=200,
        content={
            "version": "2.0",
            "template": {
                "outputs": [{"simpleText": {"text": "잠시 오류가 발생했어요. 다시 시도해주세요!"}}],
                "quickReplies": [
                    {"label": "인벤토리 👜", "action": "message", "messageText": "인벤토리"},
                    {"label": "도감 📖", "action": "message", "messageText": "도감"},
                ],
            },
        },
    )

user_count: dict = {}  # { "유저ID": {"date": date, "count": int} }
pending_photo: dict = {}  # { "유저ID": {"time": datetime, "url": str} }
pending_gem: dict = {}  # { "유저ID": {"gem": str, "text": str, "has_photo": bool, "image_url": str|None} }
pending_emotion_selection: dict = {}  # { "유저ID": {"emotions": [emotion_word], "text": str, "has_photo": bool, "image_url": str|None} }
classify_fail_count: dict = {}  # { "유저ID": int } 감정 분류 실패 횟수
pending_ai_result: dict = {}  # { "유저ID": dict } 콜백 테스트용 AI 결과 임시 저장

PHOTO_TIMEOUT = timedelta(minutes=10)


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


def check_and_increment(user_id: str) -> bool:
    today = date.today()
    record = user_count.get(user_id)
    if record is None or record["date"] != today:
        user_count[user_id] = {"date": today, "count": 1}
        return True
    if record["count"] >= 5:
        return False
    record["count"] += 1
    return True


def is_image_url(text: str) -> bool:
    return text.startswith("http") and any(
        ext in text.lower() for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]
    )


def classify_emotion(text: str) -> list[str] | str | None:
    prompt = (
        "다음 입력이 일상 기록인지 판단해줘.\n"
        "인사말만 있거나(예: 하이, 안녕, ㅎㅎ, 테스트 등), 감정이나 일상 내용이 전혀 없는 경우에만 '기록아님'이라고만 답해.\n"
        "인사말과 함께 감정이나 일상 내용이 포함되어 있으면 감정을 분류해줘.\n"
        "일상 기록이라면 담긴 감정을 분석해서 아래 매핑에 맞는 원석 이름으로 답해줘.\n"
        "감정-원석 매핑:\n"
        "무탈→월장석, 평온→아쿠아마린, 뿌듯→황수정, 기쁨→루비, 만족→앰버, "
        "설렘→로즈쿼츠, 슬픔→사파이어, 짜증→가넷, 후회→연수정, 위로→오팔\n"
        "여러 감정이 담겨있으면 원석 이름들을 쉼표로만 구분해서 답해줘. "
        "감정이 하나라면 원석 이름 하나만 답해줘. 다른 말은 절대 하지 마.\n\n"
        f"입력: {text}"
    )
    try:
        response = anthropic_client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=50,
            messages=[{"role": "user", "content": prompt}],
            timeout=4.0,
        )
        raw = response.content[0].text.strip()
        print(f"[classify_emotion raw] {raw}")
        if "기록아님" in raw:
            return "NOT_RECORD"
        valid_gem_names = set(EMOTION_TO_GEM.values())
        found = [g for g in valid_gem_names if g in raw]
        if not found:
            found = [EMOTION_TO_GEM[e] for e in EMOTION_TO_GEM if e in raw]
        return found if found else None
    except anthropic.APITimeoutError:
        return "TIMEOUT"
    except Exception as e:
        print(f"[classify_emotion error] {e}")
        return None


def save_gem(user_id: str, gem: str, record_text: str, has_photo: bool, image_url: str = None, ai_gems: str = None):
    # Supabase 저장
    try:
        data = {
            "user_id": user_id,
            "gem": gem,
            "record_text": record_text,
            "has_photo": has_photo,
        }
        if image_url:
            data["image_url"] = image_url
        if ai_gems:
            data["ai_gems"] = ai_gems
        requests.post(
            f"{SUPABASE_URL}/rest/v1/gems",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            },
            json=data,
            timeout=5,
        )
    except Exception as e:
        print(f"[save_gem supabase error] {e}")

    # Railway DB 저장
    if RAILWAY_DATABASE_URL:
        try:
            conn = psycopg2.connect(RAILWAY_DATABASE_URL)
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO chatbot (user_id, gem, record_text, has_photo, image_url, ai_gems)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, gem, record_text, has_photo, image_url, ai_gems),
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"[save_gem railway error] {e}")


def get_gems(user_id: str) -> list:
    if RAILWAY_DATABASE_URL:
        try:
            conn = psycopg2.connect(RAILWAY_DATABASE_URL)
            cur = conn.cursor()
            cur.execute(
                "SELECT gem, record_text, created_at FROM chatbot WHERE user_id = %s ORDER BY created_at DESC LIMIT 10",
                (user_id,),
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
            return [{"gem": r[0], "record_text": r[1], "created_at": r[2].isoformat()} for r in rows]
        except Exception as e:
            print(f"[get_gems railway error] {e}")
            return []
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/gems",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
            params={
                "user_id": f"eq.{user_id}",
                "order": "created_at.desc",
                "limit": "10",
            },
            timeout=5,
        )
        data = response.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[get_gems error] {e}")
        return []


EMOTION_QUICK_REPLIES = [
    {"label": "무탈", "action": "message", "messageText": "무탈"},
    {"label": "평온", "action": "message", "messageText": "평온"},
    {"label": "뿌듯", "action": "message", "messageText": "뿌듯"},
    {"label": "기쁨", "action": "message", "messageText": "기쁨"},
    {"label": "만족", "action": "message", "messageText": "만족"},
    {"label": "설렘", "action": "message", "messageText": "설렘"},
    {"label": "슬픔", "action": "message", "messageText": "슬픔"},
    {"label": "짜증", "action": "message", "messageText": "짜증"},
    {"label": "후회", "action": "message", "messageText": "후회"},
    {"label": "위로", "action": "message", "messageText": "위로"},
]

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

EMOTION_TO_GEM = {
    "무탈": "월장석", "평온": "아쿠아마린", "뿌듯": "황수정",
    "기쁨": "루비", "만족": "앰버", "설렘": "로즈쿼츠",
    "슬픔": "사파이어", "짜증": "가넷", "후회": "연수정", "위로": "오팔",
}
GEM_TO_EMOTION = {v: k for k, v in EMOTION_TO_GEM.items()}


WEB_URL = "https://frontend-production-09f81.up.railway.app/login"

SUPABASE_IMG = "https://tetatvafhnqbtwgfebic.supabase.co/storage/v1/object/public/gem-images"
GEM_IMAGE_URL = {
    "월장석": f"{SUPABASE_IMG}/moonstone.png",
    "아쿠아마린": f"{SUPABASE_IMG}/aquamarine.png",
    "황수정": f"{SUPABASE_IMG}/citrine.png",
    "루비": f"{SUPABASE_IMG}/ruby.png",
    "앰버": f"{SUPABASE_IMG}/amber.png",
    "로즈쿼츠": f"{SUPABASE_IMG}/rose_quartz.png",
    "사파이어": f"{SUPABASE_IMG}/sapphire.png",
    "가넷": f"{SUPABASE_IMG}/garnet.png",
    "연수정": f"{SUPABASE_IMG}/smoky_quartz.png",
    "오팔": f"{SUPABASE_IMG}/opal.png",
}

BASE_QUICK_REPLIES = [
    {"label": "인벤토리 👜", "action": "message", "messageText": "내 원석"},
    {"label": "도감 📖", "action": "message", "messageText": "도감"},
]

SAVE_QUICK_REPLIES = [
    {"label": "저장하기 💎", "action": "message", "messageText": "저장하기"},
    {"label": "다른 감정 선택 🔄", "action": "message", "messageText": "다른 감정 선택"},
    {"label": "인벤토리 👜", "action": "message", "messageText": "내 원석"},
    {"label": "도감 📖", "action": "message", "messageText": "도감"},
]

SAVE_ONLY_QUICK_REPLIES = [
    {"label": "저장하기 💎", "action": "message", "messageText": "저장하기"},
    {"label": "다른 감정 선택 🔄", "action": "message", "messageText": "다른 감정 선택"},
]


def kakao_response(text: str, show_emotion_buttons: bool = False, hide_buttons: bool = False, show_save_button: bool = False, custom_replies: list = None) -> dict:
    result = {
        "version": "2.0",
        "template": {
            "outputs": [{"simpleText": {"text": text}}],
        },
    }
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


def kakao_save_complete(gem: str, user_id: str = "") -> dict:
    emotion = GEM_TO_EMOTION.get(gem, "")
    gem_label = f"{gem}({emotion})" if emotion else gem
    link_url = f"{WEB_URL}?kakao_hash={user_id}" if user_id else WEB_URL
    card = {
        "title": f"✨ {gem_label} 원석 채집 완료!",
        "description": "일상 속 순간을 원석으로 저장했어요.\n오늘 주운 원석은 가방에서 확인해볼 수 있어요!",
        "buttons": [
            {
                "action": "webLink",
                "label": "닥토 공방 열기 🌐",
                "webLinkUrl": link_url,
            }
        ],
    }
    img_url = GEM_IMAGE_URL.get(gem)
    if img_url:
        card["thumbnail"] = {"imageUrl": img_url}
    return {
        "version": "2.0",
        "template": {
            "outputs": [
                {
                    "basicCard": card
                }
            ],
            "quickReplies": BASE_QUICK_REPLIES,
        },
    }


def kakao_carousel(gems: list) -> dict:
    cards = []
    gem_emoji = {
        "월장석": "🤍", "아쿠아마린": "🩵", "황수정": "💛",
        "루비": "❤️", "앰버": "🟠", "로즈쿼츠": "🌸",
        "사파이어": "💙", "가넷": "🔴", "연수정": "🤎", "오팔": "🫧",
    }
    for g in gems:
        emoji = gem_emoji.get(g["gem"], "💎")
        dt = (datetime.fromisoformat(g["created_at"].replace("Z", "+00:00"))
              .astimezone(__import__("zoneinfo").ZoneInfo("Asia/Seoul"))
              .strftime("%m/%d %H:%M"))
        cards.append({
            "title": f"{emoji} {g['gem']}",
            "description": f"{dt}\n{g['record_text'] or ''}",
        })
    return {
        "version": "2.0",
        "template": {
            "outputs": [
                {
                    "basicCard": cards[0]
                } if len(cards) == 1 else {
                    "carousel": {
                        "type": "basicCard",
                        "items": cards,
                    }
                }
            ]
        },
    }


def _build_ai_response(user_id: str, utterance: str, has_photo: bool, image_url: str | None, result) -> dict:
    if result == "NOT_RECORD":
        return kakao_response(
            "순간을 조금 더 담아주세요 🪨\n"
            "어떤 일이 있었는지, 어떤 기분이었는지 적어주시면\n"
            "딱 맞는 원석을 찾아드릴게요!"
        )
    if result == "TIMEOUT":
        return kakao_response(
            "현재 세공소에 광물이 몰려 분류에 시간이 조금 걸리고 있어요!\n"
            "조금만 기다리면 세공소 주인장을 불러올게요 🛠️"
        )

    VALID_GEMS = set(EMOTION_TO_GEM.values())
    valid_gems = [g for g in (result or []) if g in VALID_GEMS]

    # 새 메시지 처리 시 이전 대기 상태 초기화
    pending_gem.pop(user_id, None)
    pending_emotion_selection.pop(user_id, None)
    pending_photo.pop(user_id, None)

    if not valid_gems:
        pending_gem[user_id] = {"gem": None, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": None}
        fail_count = classify_fail_count.get(user_id, 0) + 1
        classify_fail_count[user_id] = fail_count
        if fail_count >= 2:
            classify_fail_count[user_id] = 0
            pending_gem.pop(user_id, None)
            send_alert_email(
                "[닥토공방] 감정 분류 2회 실패 - 운영자 개입 필요",
                f"유저 ID: {user_id}\n내용: {utterance}"
            )
            return kakao_response(
                "세공소 주인장을 직접 불러올게요! 🛠️\n"
                "잠시만 기다려주시면 운영자가 직접 도와드릴게요."
            )
        return kakao_response(
            "앗! 순간이 너무 빨라 줍지 못했어요.\n"
            "지금을 조금 더 깊이 적어 채집을 완료해보세요!\n\n"
            "아래 감정 버튼을 눌러 더 쉽게 주울 수도 있어요!",
            show_emotion_buttons=True
        )

    if len(valid_gems) >= 2:
        emotion_words = [GEM_TO_EMOTION[g] for g in valid_gems if g in GEM_TO_EMOTION]
        pending_emotion_selection[user_id] = {
            "emotions": emotion_words, "text": utterance,
            "has_photo": has_photo, "image_url": image_url,
            "ai_gems": ",".join(valid_gems),
        }
        emotion_buttons = [{"label": e, "action": "message", "messageText": e} for e in emotion_words]
        return kakao_response(
            "이 순간엔 여러 감정이 담겨있네요!\n가장 크게 느껴진 감정을 골라주세요 💎",
            custom_replies=emotion_buttons
        )

    gem = valid_gems[0]
    emotion = GEM_TO_EMOTION.get(gem, "")
    gem_label = f"{gem}({emotion})" if emotion else gem
    pending_gem[user_id] = {"gem": gem, "text": utterance, "has_photo": has_photo, "image_url": image_url, "ai_gems": gem}
    if has_photo:
        return kakao_response(f"사진과 함께 발견한 {gem_label} 원석이에요! ✨\n저장할까요?", show_save_button=True)
    return kakao_response(f"일상 속 순간에서 {gem_label} 원석을 발견했어요! ✨\n저장할까요?", show_save_button=True)


def _callback_task(user_id: str, utterance: str, callback_url: str, photo_time, photo_url: str | None):
    has_photo = bool(photo_time and datetime.now() - photo_time <= PHOTO_TIMEOUT)
    image_url = photo_url if has_photo else None
    result = classify_emotion(utterance)
    response = _build_ai_response(user_id, utterance, has_photo, image_url, result)
    try:
        requests.post(callback_url, json=response, timeout=5)
    except Exception as e:
        print(f"[callback post error] {e}")


def _classify_and_store(user_id: str, utterance: str, has_photo: bool, image_url: str | None):
    # 테스트용: 첫 요청에서 AI 결과를 미리 계산해 저장
    result = classify_emotion(utterance)
    pending_ai_result[user_id] = _build_ai_response(user_id, utterance, has_photo, image_url, result)


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
    except Exception as e:
        print(f"[webhook json error] {e}")
        return JSONResponse(kakao_response("잠시 오류가 발생했어요. 다시 시도해주세요!"))

    user_id = body.get("userRequest", {}).get("user", {}).get("id", "unknown")
    utterance = body.get("userRequest", {}).get("utterance", "").strip()
    print(f"[full_body] {body}")
    print(f"[callback_url] {body.get('callbackUrl')}")

    # 위험 기록 감지
    if any(kw in utterance for kw in DANGER_KEYWORDS):
        background_tasks.add_task(
            send_alert_email,
            "[닥토공방] 위험 기록 감지",
            f"유저 ID: {user_id}\n내용: {utterance}"
        )
        return JSONResponse(kakao_response(DANGER_MESSAGE))

    # 유해 기록 감지
    if any(kw in utterance for kw in HARMFUL_KEYWORDS):
        background_tasks.add_task(
            send_alert_email,
            "[닥토공방] 유해 기록 감지",
            f"유저 ID: {user_id}\n내용: {utterance}"
        )
        return JSONResponse(kakao_response(HARMFUL_MESSAGE))

    # 다른 감정 선택
    if utterance == "다른 감정 선택":
        if user_id not in pending_gem:
            return JSONResponse(kakao_response("저장 대기 중인 원석이 없어요. 일상을 먼저 보내주세요!"))
        return JSONResponse(kakao_response(
            "어떤 감정이 더 잘 맞나요? 골라주세요!",
            show_emotion_buttons=True
        ))

    # 저장하기 확인
    if utterance == "저장하기":
        data = pending_gem.get(user_id)
        if not data:
            return JSONResponse(kakao_response("저장할 원석이 없어요. 일상을 먼저 보내주세요!"))
        if not check_and_increment(user_id):
            del pending_gem[user_id]
            return JSONResponse(kakao_response(
                "오늘 채집 바구니가 가득 찼습니다! 🧺\n"
                "5개를 모두 줍다니 엄청난 하루를 보내셨군요!\n\n"
                "아이템은 모두 주웠지만, 일상 속 소중한 순간은 계속 모을 수 있어요."
            ))
        background_tasks.add_task(save_gem, user_id, data["gem"], data["text"], data["has_photo"], data.get("image_url"), data.get("ai_gems"))
        del pending_gem[user_id]
        return JSONResponse(kakao_save_complete(data["gem"], user_id))

    # 퀵 버튼으로 감정 선택 (복수 감정 확인 중 / 다른 감정 선택 중 / 분류 실패 시 직접 선택)
    if utterance in EMOTION_TO_GEM:
        gem = EMOTION_TO_GEM[utterance]
        sel = pending_emotion_selection.get(user_id)
        print(f"[emotion click] utterance={utterance}, sel={sel}, pending_gem={pending_gem.get(user_id)}")
        if sel and utterance in sel["emotions"]:
            # 복수 감정 중 메인 감정 선택 → 저장 대기 (인벤/도감 숨김)
            del pending_emotion_selection[user_id]
            pending_gem[user_id] = {
                "gem": gem, "text": sel["text"],
                "has_photo": sel["has_photo"], "image_url": sel.get("image_url"),
                "ai_gems": sel.get("ai_gems"),
            }
            gem_label = f"{gem}({utterance})"
            return JSONResponse(kakao_response(
                f"{gem_label} 원석을 선택하셨어요! ✨\n저장할까요?",
                custom_replies=SAVE_ONLY_QUICK_REPLIES
            ))
        existing = pending_gem.get(user_id)
        if existing:
            # 다른 감정으로 교체 → 저장 대기 유지
            existing["gem"] = gem
            gem_label = f"{gem}({utterance})"
            return JSONResponse(kakao_response(
                f"{gem_label} 원석으로 바꿨어요! ✨\n저장할까요?",
                show_save_button=True
            ))
        # pending_gem 없는 상태에서 감정 단어 입력 → 일상 기록 먼저 요청
        return JSONResponse(kakao_response(
            "먼저 오늘의 일상을 적어주세요 🪨\n"
            "어떤 일이 있었는지 보내주시면 원석으로 저장해드릴게요!"
        ))

    # 도감 조회
    if utterance == "도감":
        has_pending = user_id in pending_gem
        return JSONResponse(kakao_response(
            "📖 닥토 공방 원석 도감\n\n"
            "✨ 채집 가능한 원석 10가지\n\n"
            "🤍 월장석 — 무탈한 하루\n"
            "🩵 아쿠아마린 — 고요하고 평온한 순간\n"
            "💛 황수정 — 뿌듯하고 자랑스러운 순간\n"
            "❤️ 루비 — 기쁘고 즐거운 순간\n"
            "🟠 앰버 — 흡족하고 만족스러운 순간\n"
            "🌸 로즈쿼츠 — 설레고 두근거리는 순간\n"
            "💙 사파이어 — 슬프고 우울한 순간\n"
            "🔴 가넷 — 짜증나고 화나는 순간\n"
            "🤎 연수정 — 후회되고 아쉬운 순간\n"
            "🫧 오팔 — 힘들고 위로받고 싶은 순간\n\n"
            "하루 최대 5개까지 채집할 수 있어요.\n"
            "오늘은 어떤 원석을 주워볼까요? 🧳",
            show_save_button=has_pending
        ))

    # 원석 가방 조회
    if utterance in ("내 원석", "원석 보기", "가방", "인벤토리"):
        gems = get_gems(user_id)
        if not gems:
            return JSONResponse(kakao_response(
                "아직 채집한 원석이 없어요!\n일상을 보내주시면 원석으로 저장해드릴게요. 🪨",
                show_save_button=(user_id in pending_gem)
            ))
        response = kakao_carousel(gems)
        if user_id in pending_gem:
            response["template"]["quickReplies"] = SAVE_QUICK_REPLIES
        return JSONResponse(response)

    # 사진 전송
    if is_image_url(utterance):
        pending_photo[user_id] = {"time": datetime.now(), "url": utterance}
        return JSONResponse(kakao_response("찰칵! 오늘은 사진으로 일상을 채집했군요!\n카메라를 들어 일상을 찍을 때, 당신은 어떤 기분이 들었나요?\n슬쩍 알려주면 사진에 어울리는 원석을 추천해드릴게요. 📸", hide_buttons=True))

    if not utterance:
        return JSONResponse(kakao_response("조금 더 자세히 감정을 알려주실 수 있나요?"))

    photo_data = pending_photo.get(user_id)
    has_photo = bool(photo_data and datetime.now() - photo_data["time"] <= PHOTO_TIMEOUT)
    image_url = photo_data["url"] if has_photo else None

    callback_url = body.get("callbackUrl")
    if callback_url:
        background_tasks.add_task(
            _callback_task, user_id, utterance, callback_url,
            photo_data["time"] if photo_data else None,
            photo_data["url"] if photo_data else None,
        )
        return JSONResponse({"version": "2.0", "useCallback": True})

    result = classify_emotion(utterance)
    return JSONResponse(_build_ai_response(user_id, utterance, has_photo, image_url, result))
