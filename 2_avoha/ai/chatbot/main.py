from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from datetime import date, datetime, timedelta
import requests
import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
ALERT_EMAIL = os.getenv("ALERT_EMAIL")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")

app = FastAPI()

user_count: dict = {}  # { "유저ID": {"date": date, "count": int} }
pending_photo: dict = {}  # { "유저ID": {"time": datetime, "url": str} }
pending_gem: dict = {}  # { "유저ID": {"gem": str, "text": str, "has_photo": bool, "image_url": str|None} }
pending_emotion_selection: dict = {}  # { "유저ID": {"emotions": [emotion_word], "text": str, "has_photo": bool, "image_url": str|None} }
classify_fail_count: dict = {}  # { "유저ID": int } 감정 분류 실패 횟수

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
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={
                "model": "google/gemma-3-4b-it:free",
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            "다음 입력이 일상 기록인지 판단해줘.\n"
                            "인사말, 단순 질문, 의미 없는 말(예: 하이, 안녕, ㅎㅎ, 테스트 등)이면 '기록아님'이라고만 답해.\n"
                            "일상 기록이라면 담긴 감정을 분석해서 아래 매핑에 맞는 원석 이름으로 답해줘.\n"
                            "감정-원석 매핑:\n"
                            "무탈→월장석, 평온→아쿠아마린, 뿌듯→황수정, 기쁨→루비, 만족→앰버, "
                            "설렘→로즈쿼츠, 슬픔→사파이어, 짜증→가넷, 후회→연수정, 위로→오팔\n"
                            "여러 감정이 담겨있으면 원석 이름들을 쉼표로만 구분해서 답해줘. "
                            "감정이 하나라면 원석 이름 하나만 답해줘. 다른 말은 절대 하지 마.\n\n"
                            f"입력: {text}"
                        ),
                    },
                ],
            },
            timeout=4,
        )
        raw = response.json()["choices"][0]["message"]["content"].strip()
        if raw == "기록아님":
            return "NOT_RECORD"
        gems = [g.strip() for g in raw.split(",") if g.strip()]
        return gems if gems else None
    except requests.Timeout:
        return "TIMEOUT"
    except Exception as e:
        print(f"[classify_emotion error] {e}")
        print(f"[response] {response.text if 'response' in dir() else 'no response'}")
        return None


def save_gem(user_id: str, gem: str, record_text: str, has_photo: bool, image_url: str = None):
    try:
        data = {
            "user_id": user_id,
            "gem": gem,
            "record_text": record_text,
            "has_photo": has_photo,
        }
        if image_url:
            data["image_url"] = image_url
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
        print(f"[save_gem error] {e}")


def get_gems(user_id: str) -> list:
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
        return response.json()
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
            result["template"]["quickReplies"] = EMOTION_QUICK_REPLIES + BASE_QUICK_REPLIES
        else:
            result["template"]["quickReplies"] = BASE_QUICK_REPLIES
    return result


def kakao_save_complete(gem: str) -> dict:
    emotion = GEM_TO_EMOTION.get(gem, "")
    gem_label = f"{gem}({emotion})" if emotion else gem
    return {
        "version": "2.0",
        "template": {
            "outputs": [
                {
                    "basicCard": {
                        "title": f"✨ {gem_label} 원석 채집 완료!",
                        "description": "일상 속 순간을 원석으로 저장했어요.\n오늘 주운 원석은 가방에서 확인해볼 수 있어요!",
                        "buttons": [
                            {
                                "action": "webLink",
                                "label": "닥토 공방 열기 🌐",
                                "webLinkUrl": WEB_URL,
                            }
                        ],
                    }
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


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.json()

    user_id = body.get("userRequest", {}).get("user", {}).get("id", "unknown")
    utterance = body.get("userRequest", {}).get("utterance", "").strip()

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
        background_tasks.add_task(save_gem, user_id, data["gem"], data["text"], data["has_photo"], data.get("image_url"))
        del pending_gem[user_id]
        return JSONResponse(kakao_save_complete(data["gem"]))

    # 퀵 버튼으로 감정 선택 (복수 감정 확인 중 / 다른 감정 선택 중 / 분류 실패 시 직접 선택)
    if utterance in EMOTION_TO_GEM:
        gem = EMOTION_TO_GEM[utterance]
        sel = pending_emotion_selection.get(user_id)
        if sel and utterance in sel["emotions"]:
            # 복수 감정 중 메인 감정 선택 → 저장 대기 (인벤/도감 숨김)
            del pending_emotion_selection[user_id]
            pending_gem[user_id] = {
                "gem": gem, "text": sel["text"],
                "has_photo": sel["has_photo"], "image_url": sel.get("image_url"),
            }
            return JSONResponse(kakao_response(
                f"{gem} 원석을 선택하셨어요! ✨\n저장할까요?",
                custom_replies=SAVE_ONLY_QUICK_REPLIES
            ))
        existing = pending_gem.get(user_id)
        if existing:
            # 다른 감정으로 교체 → 저장 대기 유지
            existing["gem"] = gem
            return JSONResponse(kakao_response(
                f"{gem} 원석으로 바꿨어요! ✨\n저장할까요?",
                show_save_button=True
            ))
        # 분류 실패 시 직접 선택 → 즉시 저장
        if not check_and_increment(user_id):
            return JSONResponse(kakao_response("오늘 채집권을 모두 사용했어요! 내일 또 만나요 🌙"))
        background_tasks.add_task(save_gem, user_id, gem, utterance, False)
        return JSONResponse(kakao_save_complete(gem))

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

    result = classify_emotion(utterance)
    if result == "NOT_RECORD":
        return JSONResponse(kakao_response(
            "순간을 조금 더 담아주세요 🪨\n"
            "어떤 일이 있었는지, 어떤 기분이었는지 적어주시면\n"
            "딱 맞는 원석을 찾아드릴게요!"
        ))
    if result == "TIMEOUT":
        return JSONResponse(kakao_response(
            "현재 세공소에 광물이 몰려 분류에 시간이 조금 걸리고 있어요!\n"
            "조금만 기다리면 세공소 주인장을 불러올게요 🛠️"
        ))
    VALID_GEMS = set(EMOTION_TO_GEM.values())
    valid_gems = [g for g in (result or []) if g in VALID_GEMS]
    if not valid_gems:
        fail_count = classify_fail_count.get(user_id, 0) + 1
        classify_fail_count[user_id] = fail_count
        if fail_count >= 2:
            classify_fail_count[user_id] = 0
            background_tasks.add_task(
                send_alert_email,
                "[닥토공방] 감정 분류 2회 실패 - 운영자 개입 필요",
                f"유저 ID: {user_id}\n내용: {utterance}"
            )
            return JSONResponse(kakao_response(
                "세공소 주인장을 직접 불러올게요! 🛠️\n"
                "잠시만 기다려주시면 운영자가 직접 도와드릴게요."
            ))
        return JSONResponse(kakao_response(
            "앗! 순간이 너무 빨라 줍지 못했어요.\n"
            "지금을 조금 더 깊이 적어 채집을 완료해보세요!\n\n"
            "아래 감정 버튼을 눌러 더 쉽게 주울 수도 있어요!",
            show_emotion_buttons=True
        ))

    # 사진+텍스트 여부 확인
    photo_data = pending_photo.get(user_id)
    has_photo = bool(photo_data and datetime.now() - photo_data["time"] <= PHOTO_TIMEOUT)
    image_url = photo_data["url"] if has_photo else None
    if has_photo:
        del pending_photo[user_id]
    elif user_id in pending_photo:
        del pending_photo[user_id]

    # 복수 감정 감지 → 메인 감정 선택 요청
    if len(valid_gems) >= 2:
        emotion_words = [GEM_TO_EMOTION[g] for g in valid_gems if g in GEM_TO_EMOTION]
        pending_emotion_selection[user_id] = {
            "emotions": emotion_words, "text": utterance,
            "has_photo": has_photo, "image_url": image_url,
        }
        emotion_buttons = [
            {"label": e, "action": "message", "messageText": e} for e in emotion_words
        ]
        return JSONResponse(kakao_response(
            f"이 순간엔 여러 감정이 담겨있네요!\n"
            f"가장 크게 느껴진 감정을 골라주세요 💎",
            custom_replies=emotion_buttons
        ))

    # 단일 감정 → 저장 대기
    gem = valid_gems[0]
    pending_gem[user_id] = {"gem": gem, "text": utterance, "has_photo": has_photo, "image_url": image_url}
    if has_photo:
        return JSONResponse(kakao_response(
            f"사진과 함께 발견한 {gem} 원석이에요! ✨\n저장할까요?",
            show_save_button=True
        ))
    return JSONResponse(kakao_response(
        f"일상 속 순간에서 {gem} 원석을 발견했어요! ✨\n저장할까요?",
        show_save_button=True
    ))
