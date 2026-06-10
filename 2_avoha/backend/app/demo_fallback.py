"""데모용 고정 감정기록 fallback.

목적: 데모 시연 중 **신규 가입자를 포함해 아직 기록이 없는 모든 계정**에게도
6/1~6/13 감정기록이 보이도록, 기록이 비어 있을 때 이 고정 세트를 반환한다.
(`DEMO_RECORDS_FALLBACK` 환경변수가 켜져 있을 때만 동작)

중요: 여기 들어 있는 감정코드/조각은 사람이 임의로 만든 값이 아니라,
실제 챗봇 분류 로직 `classify_emotion_with_supervisor`(OpenAI) 를 텍스트에 돌려
검증된 결과를 그대로 박아둔 것이다. 10개 감정이 골고루 분포하도록 큐레이션.

데모가 끝나면 `DEMO_RECORDS_FALLBACK` 만 끄면(또는 미설정) 즉시 비활성화된다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

_KST = ZoneInfo("Asia/Seoul")

# (날짜 YYYY-MM-DD, KST 시, 분, emotion_code, gem(조각), record_text)
# code/gem 이 None / "일상기록" 이면 감정 없는 일상 기록(plain).
# 모든 (text -> gem -> code) 는 실제 분류기 결과(seed dry-run 에서 검증).
_DEMO_ENTRIES: list[tuple] = [
    ("2026-06-01", 8, 10, "untroubled", "무기력함 조각", "오늘은 진짜 피곤하다. 일찍 자야지."),
    ("2026-06-01", 21, 30, "joy", "즐거움 조각", "오랜만에 푹 웃은 하루. 기분 좋다."),
    ("2026-06-02", 14, 20, "serenity", "편안함 조각", "비 오는 소리를 들으면서 누워 있으니 마음이 차분해진다."),
    ("2026-06-02", 23, 10, "solace", "걱정 조각", "할 일을 다 못 끝내서 찜찜한 채로 잠든다."),
    ("2026-06-03", 19, 5, "annoyance", "짜증 조각", "친구가 약속을 또 당일에 취소했다. 솔직히 좀 짜증났다."),
    ("2026-06-03", 22, 40, "flutter", "설렘 조각", "내일 좋아하는 가수 콘서트라 벌써부터 설렌다."),
    ("2026-06-04", 13, 0, None, "일상기록", "오늘 수업 듣고 점심 먹고 집에 왔다."),
    ("2026-06-04", 18, 50, "pride", "뿌듯함 조각", "두 달 준비한 프로젝트를 드디어 제출했다. 진짜 뿌듯하다."),
    ("2026-06-05", 12, 30, "satisfaction", "감사함 조각", "오늘 힘들 때 옆에서 묵묵히 도와준 친구한테 진심으로 고맙다고 말했다."),
    ("2026-06-05", 20, 15, "sadness", "서러움 조각", "별것도 아닌 말에 눈물이 핑 돌았다. 왜 이렇게 서러운지 모르겠다."),
    ("2026-06-06", 15, 20, "joy", "즐거움 조각", "길에서 강아지를 봤는데 너무 귀여워서 기분이 몽글몽글해졌다."),
    ("2026-06-06", 21, 45, "regret", "후회 조각", "괜히 아까 그 말을 했나 싶어서 집에 오는 내내 후회됐다."),
    ("2026-06-07", 19, 40, "serenity", "편안함 조각", "오랜만에 일찍 퇴근해서 집에서 푹 쉬었다. 평온한 하루였다."),
    ("2026-06-07", 23, 0, "solace", "위축감 조각", "다들 앞서가는 것 같은데 나만 제자리인 것 같아 자꾸 작아진다."),
    ("2026-06-08", 11, 10, "flutter", "설렘 조각", "새로 산 운동화를 신고 나갔더니 괜히 기분이 들떴다."),
    ("2026-06-08", 22, 20, "untroubled", "무기력함 조각", "딱히 한 것도 없는데 시간이 훅 가버렸다."),
    ("2026-06-09", 18, 30, "annoyance", "억울함 조각", "회의에서 내 의견이 무시당한 것 같아 내내 억울했다."),
    ("2026-06-09", 23, 30, "sadness", "우울함 조각", "별 이유도 없이 자꾸 한숨이 나온다."),
    ("2026-06-10", 8, 0, "pride", "뿌듯함 조각", "오늘 처음으로 5km를 쉬지 않고 뛰었다. 스스로가 대견했다."),
    ("2026-06-10", 20, 50, "satisfaction", "감사함 조각", "선생님이 보내주신 응원 메시지를 다시 읽었다. 정말 감사한 하루였다."),
    ("2026-06-11", 13, 40, "joy", "즐거움 조각", "카페에서 우연히 옛 친구를 만났다. 너무 반가워서 한참 수다를 떨었다."),
    ("2026-06-11", 16, 15, "regret", "부끄러움 조각", "발표하다 말이 꼬여서 다들 쳐다봤다. 너무 창피했다."),
    ("2026-06-12", 13, 15, None, "일상기록", "도서관에서 과제하다가 저녁에 돌아왔다."),
    ("2026-06-12", 20, 30, "joy", "즐거움 조각", "저녁에 동생이랑 치킨 시켜 먹으면서 드라마 봤다. 이런 게 행복인가 싶었다."),
    ("2026-06-13", 12, 10, "flutter", "설렘 조각", "첫 월급으로 부모님 선물을 샀다. 드릴 생각에 벌써 설렌다."),
    ("2026-06-13", 21, 20, "serenity", "편안함 조각", "미뤄둔 일들을 오늘 다 처리했더니 속이 후련하다."),
]


def _iso_z(date_str: str, hh: int, mm: int) -> str:
    """KST 벽시계 → UTC ISO('...Z'). 앱은 createdAt 을 UTC로 해석하므로 Z 표기."""
    y, mo, da = (int(x) for x in date_str.split("-"))
    dt_utc = datetime(y, mo, da, hh, mm, tzinfo=_KST).astimezone(timezone.utc)
    return dt_utc.replace(tzinfo=None).isoformat() + "Z"


def demo_records() -> list[dict]:
    """GET /records 용 RecordDto 목록 (최신순)."""
    out = []
    for i, (d, hh, mm, code, gem, text) in enumerate(_DEMO_ENTRIES):
        rid = -(i + 1)
        created = _iso_z(d, hh, mm)
        is_emotion = code is not None
        out.append({
            "id": rid,
            "gem": gem,
            "recordText": text,
            "hasPhoto": False,
            "imageUrl": None,
            "aiGems": gem if is_emotion else None,
            "questionId": None,
            "questionText": None,
            "answerText": None,
            "linkedDate": d,
            "entryMode": "emotion_classification" if is_emotion else "plain_record",
            "classificationStatus": "user_confirmed",
            "aiEmotionCode": code,
            "confirmedEmotionCode": code,
            "confirmedEmotionCodes": [code] if is_emotion else [],
            "confirmedAt": created if is_emotion else None,
            "webReviewedAt": None,
            "createdAt": created,
            "updatedAt": created,
            "gemId": f"demo-gem-{i + 1}" if is_emotion else None,
            "gemEmotionCode": code,
        })
    out.sort(key=lambda r: r["createdAt"], reverse=True)
    return out


def demo_chatbot_records() -> list[dict]:
    """GET /inventory/chatbot-records 용 ChatbotRecordDto 목록 (최신순)."""
    out = []
    for i, (d, hh, mm, code, gem, text) in enumerate(_DEMO_ENTRIES):
        out.append({
            "id": -(i + 1),
            "gem": gem,
            "recordText": text,
            "hasPhoto": False,
            "imageUrl": None,
            "aiGems": gem if code is not None else None,
            "createdAt": _iso_z(d, hh, mm),
        })
    out.sort(key=lambda r: r["createdAt"], reverse=True)
    return out


def demo_gems() -> list[dict]:
    """GET /inventory/gems 용 GemDto 목록 (감정 기록 1건당 1개, 최신순)."""
    out = []
    for i, (d, hh, mm, code, gem, text) in enumerate(_DEMO_ENTRIES):
        if code is None:
            continue
        out.append({
            "id": f"demo-gem-{i + 1}",
            "emotionCode": code,
            "tier": 1,
            "source": "chatbot",
            "sourceMessageId": None,
            "sourceChatbotId": -(i + 1),
            "craftedFrom": [],
            "createdAt": _iso_z(d, hh, mm),
        })
    out.sort(key=lambda g: g["createdAt"], reverse=True)
    return out
