#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""데모용 더미 감정 기록 시딩 스크립트.

설계 원칙
- 일기 텍스트는 사람이 직접 쓴 자연스럽고 다양한 문장(DIARY_POOL).
- 감정 분석(감정코드/조각/카테고리)은 임의로 만들지 않고, 실제 챗봇 로직
  `classify_emotion_with_supervisor()` (OpenAI gpt-4.1-mini, supervisor 검증 포함)을
  그대로 호출해서 생성한다. 고유 텍스트당 1회만 분류하고 캐시한다(온도 0, 결정적).
- 저장은 `save_gem()`과 동일한 컬럼으로 chatbot + gems 두 테이블에 INSERT 하되,
  created_at / linked_date 만 대상 기간(6/1~6/13, KST)으로 백데이트한다.
- 모든 더미 행은 식별/제거가 가능하도록 태깅한다:
    · chatbot.trace_id = uuid5(DEMO_NS, "<key>|<YYYY-MM-DD>|<slot>")  (결정적)
    · 미연동 계정의 합성 provider_user_key = "demo-seed-<user uuid>"

실행 (production, Railway env 주입)
    railway run --service chatbot -- .venv/bin/python seed_demo_records.py --dry-run
    railway run --service chatbot -- .venv/bin/python seed_demo_records.py --commit
    railway run --service chatbot -- .venv/bin/python seed_demo_records.py --clean

--dry-run  : DB를 건드리지 않고 풀 분류 결과 + 코드 분포 + 샘플 사용자 스케줄만 출력.
--commit   : 모든 미삭제 사용자에 대해 기존 더미 데이터 정리 후 재삽입(멱등).
--clean    : 더미 chatbot/gems 행 + 합성 provider_user_key 전부 제거.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import psycopg2
from psycopg2.extras import execute_values

# 실제 챗봇 모듈 (import 시 부수효과 없음: load_dotenv + app 정의뿐).
import main as chatbot

# ----------------------------------------------------------------------------
# 설정
# ----------------------------------------------------------------------------
KST = ZoneInfo("Asia/Seoul")
START_DATE = date(2026, 6, 1)
END_DATE = date(2026, 6, 13)            # 포함
MAX_SLOTS = 3                            # 하루 최대 기록 수 (trace_id 정리 시에도 사용)
DAY_COUNT_WEIGHTS = [45, 40, 15]         # 하루 1/2/3건 가중치
SYNTHETIC_PREFIX = "demo-seed-"
DEMO_NS = uuid.uuid5(uuid.NAMESPACE_URL, "avoha:demo-seed:v1")

# 하루 중 기록이 찍힐 만한 시간대(KST) 후보. n건이면 서로 다른 창에서 뽑아 분산.
TIME_WINDOWS = [(7, 9), (12, 14), (15, 17), (19, 21), (21, 23)]

# ----------------------------------------------------------------------------
# 사람이 작성한 일기 풀 (다양한 말투 / 사건·음식·대화 / 공부·피로 / 감정 노출)
# 감정 분석 결과는 여기서 만들지 않는다. 분류는 전적으로 실제 로직이 수행한다.
# ----------------------------------------------------------------------------
DIARY_POOL = [
    # 짧고 편한 말투
    "오늘은 그냥 좀 피곤했다.",
    "별일 없었는데 하루가 유난히 길었다.",
    "아침부터 비가 와서 그런지 종일 축 처졌다.",
    "그냥저냥 무난한 하루였다.",
    "오늘은 진짜 피곤하다. 일찍 자야지.",
    "날이 좋아서 그런가 기분이 살짝 좋아졌다.",
    "딱히 한 것도 없는데 시간이 훅 가버렸다.",
    "오늘따라 모든 게 다 귀찮다.",
    "별 이유도 없이 자꾸 한숨이 나온다.",
    "그냥 평범한 하루였지만 그래도 나쁘지 않았다.",
    "오랜만에 푹 웃은 하루. 기분 좋다.",
    "할 일을 다 못 끝내서 찜찜한 채로 잠든다.",
    "오늘은 아무 생각 없이 그냥 쉬고 싶었다.",
    # 감정이 드러나는 일상 기록
    "시험 공부하느라 바쁘긴 한데, 아무 일도 없었는데 살짝 외로웠다.",
    "다들 약속이 있는 것 같은데 나만 집에 있는 것 같아 좀 쓸쓸했다.",
    "이유도 없이 하루종일 마음이 가라앉아 있었다.",
    "별것도 아닌 말에 눈물이 핑 돌았다. 왜 이렇게 서러운지 모르겠다.",
    "다들 앞서가는 것 같은데 나만 제자리인 것 같아 자꾸 작아진다.",
    "괜히 아까 그 말을 했나 싶어서 집에 오는 내내 후회됐다.",
    "해야 할 일은 많은데 몸이 안 따라줘서 조금 답답했다.",
    "머리가 복잡해서 뭐부터 해야 할지 갈피를 못 잡겠다.",
    "할 거 다 했는데도 마음 한구석이 텅 빈 것 같다.",
    "내일 일이 자꾸 걱정돼서 잠이 잘 안 온다.",
    "오늘은 괜히 모든 게 buggy하게 느껴졌다. 마음이 싱숭생숭하다.",
    # 사건 / 음식 / 대화가 포함된 기록
    "점심에 친구랑 마라탕 먹었는데 오랜만에 웃어서 기분이 좀 나아졌다.",
    "퇴근길에 붕어빵을 사 먹었다. 별거 아닌데 그게 위로가 됐다.",
    "오랜만에 고등학교 친구랑 통화했는데 두 시간이 훅 갔다. 마음이 따뜻해졌다.",
    "엄마가 갑자기 반찬 택배를 보내주셨다. 괜히 코끝이 찡했다.",
    "저녁에 동생이랑 치킨 시켜 먹으면서 드라마 봤다. 이런 게 행복인가 싶었다.",
    "카페에서 우연히 옛 친구를 만났다. 너무 반가워서 한참 수다를 떨었다.",
    "길에서 강아지를 봤는데 너무 귀여워서 기분이 몽글몽글해졌다.",
    "팀 회식 분위기가 어색해서 내내 좀 불편했다.",
    "친구가 약속을 또 당일에 취소했다. 솔직히 좀 짜증났다.",
    "보낸 카톡에 답장이 종일 없어서 괜히 신경이 쓰였다.",
    "오랜만에 가족이랑 외식했다. 다 같이 웃으니까 참 좋았다.",
    "지갑을 잃어버린 줄 알고 패닉이었는데 가방 안에 있었다. 정말 안도했다.",
    "친구 결혼식에 다녀왔다. 축하하면서도 괜히 마음이 싱숭생숭했다.",
    # 공부 / 일정 / 피로
    "과제 세 개가 한꺼번에 몰려서 멘붕이 왔다.",
    "발표 준비를 끝내고 나니 진이 다 빠졌다.",
    "밤새 공부했는데 시험은 생각보다 못 본 것 같아 속상하다.",
    "알바하고 와서 과제까지 하려니 몸이 천근만근이다.",
    "일정이 너무 빡빡해서 하루종일 숨 돌릴 틈이 없었다.",
    "두 달 준비한 프로젝트를 드디어 제출했다. 진짜 뿌듯하다.",
    "미뤄둔 일들을 오늘 다 처리했더니 속이 후련하다.",
    "자격증 시험 합격 발표가 떴는데 붙었다! 나도 모르게 소리를 질렀다.",
    "새벽까지 게임하다 잤더니 하루종일 머리가 멍했다.",
    "강의 듣고 팀플 회의까지 하고 나니 하루가 다 갔다.",
    # 긍정 / 설렘 / 평온
    "내일 좋아하는 가수 콘서트라 벌써부터 설렌다.",
    "오랜만에 알람 없이 푹 자고 일어났더니 몸도 마음도 가볍다.",
    "산책하다 노을이 너무 예뻐서 한참 멍하니 봤다. 마음이 편안해졌다.",
    "길에서 버스킹을 들었는데 노래가 좋아서 한참 서서 들었다.",
    "새로 산 운동화를 신고 나갔더니 괜히 기분이 들떴다.",
    "친구한테 깜짝 생일 축하를 받았다. 감동해서 울 뻔했다.",
    "오늘 처음으로 5km를 쉬지 않고 뛰었다. 스스로가 대견했다.",
    "면접 합격 메일을 받았다. 그동안 고생한 게 떠올라서 뭉클했다.",
    "빨래 다 개고 방 정리까지 했더니 마음이 한결 정돈된 기분이다.",
    "따뜻한 차 한 잔 마시면서 책 읽는 저녁. 이런 고요함이 참 좋다.",
    "비 오는 소리를 들으면서 누워 있으니 마음이 차분해진다.",
    "오랜만에 일찍 퇴근해서 집에서 푹 쉬었다. 평온한 하루였다.",
    "화분에 새잎이 난 걸 발견했다. 사소한데 괜히 기뻤다.",
    "주말에 늦잠 자고 브런치 만들어 먹었다. 여유로운 아침이었다.",
    "오랜만에 친구들이랑 노래방 가서 세 시간을 놀았다. 목은 쉬었는데 신난다.",
    "동아리 공연을 무사히 마쳤다. 끝나고 다 같이 박수 칠 때 뭉클했다.",
    "첫 월급으로 부모님 선물을 샀다. 드릴 생각에 벌써 설렌다.",
    "오늘 힘들 때 옆에서 묵묵히 도와준 친구한테 진심으로 고맙다고 말했다.",
    "후배가 말없이 챙겨준 따뜻한 커피 한 잔에 하루 종일 고마운 마음이 들었다.",
    "별 탈 없이 건강하게 하루를 보낼 수 있다는 게 새삼 감사하게 느껴졌다.",
    "선생님이 보내주신 응원 메시지를 다시 읽었다. 정말 감사한 하루였다.",
    # 부정 / 미묘한 감정
    "회의에서 내 의견이 무시당한 것 같아 내내 억울했다.",
    "내가 한 일도 아닌데 나한테만 뭐라고 해서 너무 분했다.",
    "사람 많은 지하철에서 발을 밟히고도 사과를 못 받아 짜증이 확 났다.",
    "친한 친구가 다른 친구들이랑만 노는 것 같아 좀 서운했다.",
    "괜히 부모님한테 짜증을 냈다. 자려고 누우니 후회된다.",
    "발표하다 말이 꼬여서 다들 쳐다봤다. 너무 창피했다.",
    "단톡방에서 내 메시지만 읽씹당한 것 같아 위축됐다.",
    "자꾸 실수만 하는 것 같아서 내가 좀 한심하게 느껴졌다.",
    "큰 소리에 깜짝 놀랐는데 한참 동안 심장이 두근거렸다.",
    "내일 병원 검사 결과를 들으러 가는데 무서워서 잠이 안 온다.",
    "좋아하던 카페가 문을 닫는다는 소식에 괜히 마음이 허전했다.",
    "키우던 화분이 시들어버려서 속상했다.",
    "길 가다 넘어져서 무릎이 까졌다. 아프기도 하고 창피하기도 했다.",
    # 감정이 약한 순수 일상 기록 (DAILY_RECORD 경로 자연 탐색)
    "오늘 수업 듣고 점심 먹고 집에 왔다.",
    "도서관에서 과제하다가 저녁에 돌아왔다.",
    "아침에 운동 갔다가 장 보고 왔다.",
    "회사 갔다가 평소처럼 야근하고 퇴근했다.",
    "친구랑 약속이 있어서 시내에 나갔다 왔다.",
    "점심엔 김치찌개 먹고 저녁엔 라면을 먹었다.",
    "택배 받고 방 청소를 좀 했다.",
]


# ----------------------------------------------------------------------------
# 분류 (실제 로직)
# ----------------------------------------------------------------------------
def classify_pool(verbose: bool = True) -> dict[str, dict]:
    """고유 텍스트당 1회 실제 분류. 반환: text -> {kind, gems, codes}.

    kind: 'emotion' | 'plain' | 'skip'
    """
    gem_to_code = chatbot.CHATBOT_GEM_TO_EMOTION_CODE
    valid_gems = set(chatbot.EMOTION_TO_GEM.values())
    cache: dict[str, dict] = {}
    for idx, text in enumerate(DIARY_POOL):
        if text in cache:
            continue
        result = None
        for attempt in range(2):  # TIMEOUT/None 이면 1회 재시도
            result = chatbot.classify_emotion_with_supervisor(
                text,
                trace_id=uuid.uuid5(DEMO_NS, f"classify|{text}"),
                user_id="demo-seed-classifier",
            )
            if result not in ("TIMEOUT", None):
                break

        if isinstance(result, list):
            gems = [g for g in result if g in valid_gems]
            codes = [gem_to_code[g] for g in gems if g in gem_to_code]
            gems = [g for g in gems if g in gem_to_code]
            if gems:
                entry = {"kind": "emotion", "gems": gems, "codes": codes}
            else:
                entry = {"kind": "plain", "gems": [], "codes": []}
        elif result == "DAILY_RECORD":
            entry = {"kind": "plain", "gems": [], "codes": []}
        else:  # NOT_RECORD / TIMEOUT / None
            entry = {"kind": "skip", "gems": [], "codes": [], "reason": str(result)}

        cache[text] = entry
        if verbose:
            label = (
                f"{entry['kind']:7s} {','.join(entry['codes']) or '-':<24} "
                f"{','.join(entry['gems'])}"
            )
            print(f"  [{idx + 1:02d}/{len(DIARY_POOL)}] {label}  | {text}")
    return cache


# ----------------------------------------------------------------------------
# 스케줄 생성 (사용자별 결정적)
# ----------------------------------------------------------------------------
def date_range() -> list[date]:
    days, d = [], START_DATE
    while d <= END_DATE:
        days.append(d)
        d += timedelta(days=1)
    return days


def build_user_schedule(user_seed: str, usable_texts: list[str]) -> list[tuple]:
    """반환: [(day, slot_index, datetime_utc, text), ...]  (사용자별로 서로 다른 시퀀스)."""
    rng = random.Random(f"avoha-demo|{user_seed}")
    pool = usable_texts[:]
    rng.shuffle(pool)
    cursor = 0
    plan = []
    for day in date_range():
        n = rng.choices([1, 2, 3], weights=DAY_COUNT_WEIGHTS, k=1)[0]
        n = min(n, MAX_SLOTS)
        windows = sorted(rng.sample(TIME_WINDOWS, n))
        for slot, (lo, hi) in enumerate(windows):
            if cursor >= len(pool):
                rng.shuffle(pool)
                cursor = 0
            text = pool[cursor]
            cursor += 1
            hh = rng.randint(lo, hi - 1)
            mm = rng.randint(0, 59)
            dt_kst = datetime.combine(day, time(hh, mm), tzinfo=KST)
            dt_utc = dt_kst.astimezone(timezone.utc)
            plan.append((day, slot, dt_utc, text))
    return plan


# ----------------------------------------------------------------------------
# DB 헬퍼
# ----------------------------------------------------------------------------
def get_conn():
    # 로컬에서 `railway run` 으로 접속하므로 외부에서 닿는 PUBLIC 프록시 URL을 우선 사용한다.
    # (RAILWAY_DATABASE_URL/DATABASE_URL 은 *.railway.internal 내부 호스트라 로컬에서 resolve 불가)
    url = (
        os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("RAILWAY_DATABASE_PUBLIC_URL")
        or os.getenv("RAILWAY_DATABASE_URL")
        or os.getenv("DATABASE_URL")
    )
    if not url:
        sys.exit("[error] DB URL 환경변수가 없습니다. "
                 "`railway run --service Postgres -- ...` 로 실행하세요.")
    # psql/psycopg2는 +asyncpg 드라이버 접미사를 모른다 → 제거.
    url = url.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgres+asyncpg://", "postgresql://")
    if ".railway.internal" in url:
        print("[warn] 내부 호스트(railway.internal) URL입니다. 로컬에서 접속이 막힐 수 있어요. "
              "Postgres 서비스로 실행하여 DATABASE_PUBLIC_URL 을 쓰세요.")
    return psycopg2.connect(url)


def load_cache(path: str) -> dict[str, dict]:
    with open(path, encoding="utf-8") as f:
        cache = json.load(f)
    print(f"[cache] {len(cache)}개 분류 로드: {path}")
    return cache


def save_cache(cache: dict[str, dict], path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)
    print(f"[cache] {len(cache)}개 분류 저장: {path}")


def get_cache(args, verbose: bool) -> dict[str, dict]:
    """--in 캐시가 있으면 로드, 없으면 실제 분류(OpenAI 필요)."""
    if getattr(args, "in_path", None):
        return load_cache(args.in_path)
    cache = classify_pool(verbose=verbose)
    if getattr(args, "out_path", None):
        save_cache(cache, args.out_path)
    return cache


def usable_texts(cache: dict[str, dict]) -> list[str]:
    return [t for t in DIARY_POOL if t in cache and cache[t]["kind"] != "skip"]


def fetch_users(cur) -> list[tuple]:
    cur.execute("SELECT id, provider_user_key FROM users WHERE deleted_at IS NULL")
    return cur.fetchall()


def all_demo_trace_ids(keys: list[str]) -> list[str]:
    out = []
    days = date_range()
    for key in keys:
        for day in days:
            for slot in range(MAX_SLOTS):
                out.append(str(uuid.uuid5(DEMO_NS, f"{key}|{day.isoformat()}|{slot}")))
    return out


def delete_demo_rows(cur, keys: list[str]) -> tuple[int, int]:
    """더미 chatbot/gems 행 삭제. 반환 (gems_deleted, chatbot_deleted)."""
    trace_ids = all_demo_trace_ids(keys)
    cur.execute(
        "SELECT id FROM chatbot "
        "WHERE trace_id = ANY(%s::uuid[]) OR user_id LIKE %s",
        (trace_ids, SYNTHETIC_PREFIX + "%"),
    )
    ids = [r[0] for r in cur.fetchall()]
    if not ids:
        return (0, 0)
    cur.execute("DELETE FROM gems WHERE source_chatbot_id = ANY(%s)", (ids,))
    gems_deleted = cur.rowcount
    cur.execute("DELETE FROM chatbot WHERE id = ANY(%s)", (ids,))
    chatbot_deleted = cur.rowcount
    return (gems_deleted, chatbot_deleted)


INSERT_CHATBOT = (
    "INSERT INTO chatbot "
    "(user_id, gem, record_text, has_photo, image_url, ai_gems, kakao_image_url, "
    " trace_id, ai_emotion_code, confirmed_emotion_code, confirmed_emotion_codes, "
    " classification_status, entry_mode, created_at, updated_at, linked_date) "
    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s) RETURNING id"
)
INSERT_GEM = (
    "INSERT INTO gems (user_id, emotion_code, tier, source, source_chatbot_id, created_at) "
    "VALUES (%s,%s,1,'chatbot',%s,%s)"
)


# ----------------------------------------------------------------------------
# 모드
# ----------------------------------------------------------------------------
def run_dry(args):
    print("=== DRY RUN (DB 미접속, 쓰기 없음) ===")
    print(f"기간: {START_DATE} ~ {END_DATE} (KST), 하루 1~3건\n")
    print("[1] 풀 분류 결과 (실제 classify_emotion_with_supervisor):")
    cache = get_cache(args, verbose=True)

    code_counter = Counter()
    kind_counter = Counter()
    for entry in cache.values():
        kind_counter[entry["kind"]] += 1
        for c in entry["codes"]:
            code_counter[c] += 1
    print("\n[2] 종류 분포:", dict(kind_counter))
    print("[3] 감정코드 분포(풀 기준):", dict(code_counter.most_common()))

    skipped = [t for t, e in cache.items() if e["kind"] == "skip"]
    if skipped:
        print(f"\n[!] 분류 실패/제외 {len(skipped)}건 (재실행 시 제외됨):")
        for t in skipped:
            print(f"    - ({cache[t].get('reason')}) {t}")

    usable = usable_texts(cache)
    print(f"\n[4] 사용 가능 텍스트: {len(usable)}/{len(DIARY_POOL)}")
    print("\n[5] 샘플 사용자 2명 스케줄 미리보기:")
    for s in ("sample-user-A", "sample-user-B"):
        plan = build_user_schedule(s, usable)
        print(f"\n  ── {s}: 총 {len(plan)}건 ──")
        for day, slot, dt_utc, text in plan:
            e = cache[text]
            kst = dt_utc.astimezone(KST)
            tag = ",".join(e["codes"]) if e["kind"] == "emotion" else "일상기록"
            print(f"    {kst:%m-%d %H:%M} [{tag:<20}] {text}")
    print("\n분류가 자연스러우면 --commit 으로 실제 삽입하세요.")


def run_commit(args):
    print("=== COMMIT (production 쓰기) ===")
    print("[1] 분류 캐시 로드 또는 실제 분류...")
    cache = get_cache(args, verbose=False)
    usable = usable_texts(cache)
    skipped = len(DIARY_POOL) - len(usable)
    print(f"    사용 가능 텍스트 {len(usable)}/{len(DIARY_POOL)} (제외 {skipped})")
    if len(usable) < 20:
        sys.exit("[abort] 사용 가능 텍스트가 너무 적습니다. OPENAI_API_KEY/네트워크 확인.")

    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        users = fetch_users(cur)
        if args.limit_users:
            users = users[: args.limit_users]
        print(f"[2] 대상 사용자: {len(users)}명")

        # 미연동 계정 → 결정적 합성 키 부여
        synthetic_set = 0
        resolved = []  # (user_uuid, key)
        for user_uuid, key in users:
            if not key:
                key = f"{SYNTHETIC_PREFIX}{user_uuid}"
                cur.execute(
                    "UPDATE users SET provider_user_key=%s WHERE id=%s AND provider_user_key IS NULL",
                    (key, user_uuid),
                )
                synthetic_set += 1
            resolved.append((str(user_uuid), key))
        print(f"[3] 합성 provider_user_key 부여: {synthetic_set}명")

        # 기존 더미 정리(멱등)
        keys = [k for _, k in resolved]
        gd, cd = delete_demo_rows(cur, keys)
        print(f"[4] 기존 더미 정리: chatbot {cd}행 / gems {gd}행 삭제")

        # 삽입할 행을 메모리에서 전부 구성 (원격 프록시 왕복 최소화를 위해 배치 INSERT).
        chatbot_data = []                  # INSERT_CHATBOT 16개 컬럼 튜플
        gem_specs = []                     # (trace_id, gem, user_uuid, code, cdt)
        plain_rows = 0
        code_counter = Counter()
        for user_uuid, key in resolved:
            plan = build_user_schedule(user_uuid, usable)
            for day, slot, dt_utc, text in plan:
                e = cache[text]
                # created_at 은 timestamp(naive)이고 앱은 이를 UTC로 해석(_iso_utc)하므로 naive-UTC 명시.
                cdt = dt_utc.replace(tzinfo=None)
                trace_id = str(uuid.uuid5(DEMO_NS, f"{key}|{day.isoformat()}|{slot}"))
                if e["kind"] == "emotion":
                    ai_gems = ",".join(e["gems"])
                    for gem, code in zip(e["gems"], e["codes"]):
                        chatbot_data.append((
                            key, gem, text, False, None, ai_gems, None,
                            trace_id, code, code, json.dumps([code]),
                            "user_confirmed", "emotion_classification", cdt, cdt, day,
                        ))
                        gem_specs.append((trace_id, gem, str(user_uuid), code, cdt))
                        code_counter[code] += 1
                else:  # plain
                    chatbot_data.append((
                        key, "일상기록", text, False, None, None, None,
                        trace_id, None, None, None,
                        "user_confirmed", "plain_record", cdt, cdt, day,
                    ))
                    plain_rows += 1

        print(f"[5] 배치 INSERT 준비: chatbot {len(chatbot_data)}행 / gems {len(gem_specs)}행")
        cols = ("user_id, gem, record_text, has_photo, image_url, ai_gems, kakao_image_url, "
                "trace_id, ai_emotion_code, confirmed_emotion_code, confirmed_emotion_codes, "
                "classification_status, entry_mode, created_at, updated_at, linked_date")
        tmpl = "(" + ",".join(["%s"] * 10 + ["%s::jsonb"] + ["%s"] * 5) + ")"
        returned = execute_values(
            cur,
            f"INSERT INTO chatbot ({cols}) VALUES %s RETURNING id, trace_id::text, gem",
            chatbot_data, template=tmpl, page_size=500, fetch=True,
        )
        id_by_key = {(tid, gem): cid for cid, tid, gem in returned}

        gem_data = []
        for trace_id, gem, user_uuid, code, cdt in gem_specs:
            cid = id_by_key.get((trace_id, gem))
            if cid is not None:
                gem_data.append((user_uuid, code, cid, cdt))
        if gem_data:
            execute_values(
                cur,
                "INSERT INTO gems (user_id, emotion_code, tier, source, source_chatbot_id, created_at) VALUES %s",
                gem_data, template="(%s,%s,1,'chatbot',%s,%s)", page_size=500,
            )

        conn.commit()
        print(f"[6] 삽입 완료: chatbot {len(chatbot_data)}행 "
              f"(감정 {len(chatbot_data) - plain_rows} / 일상 {plain_rows}), gems {len(gem_data)}행")
        print(f"[7] 감정코드 분포(삽입 기준): {dict(code_counter.most_common())}")
        print("\n완료. 제거하려면 --clean 으로 실행하세요.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def run_clean(args):
    print("=== CLEAN (더미 데이터 제거) ===")
    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor()
    try:
        users = fetch_users(cur)
        keys = [k for _, k in users if k]
        gd, cd = delete_demo_rows(cur, keys)
        cur.execute(
            "UPDATE users SET provider_user_key=NULL WHERE provider_user_key LIKE %s",
            (SYNTHETIC_PREFIX + "%",),
        )
        keys_reset = cur.rowcount
        conn.commit()
        print(f"삭제: chatbot {cd}행 / gems {gd}행, 합성키 해제 {keys_reset}명")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def run_classify_only(args):
    print("=== CLASSIFY ONLY (실제 분류 → 캐시 저장, DB 미접속) ===")
    cache = classify_pool(verbose=True)
    code_counter, kind_counter = Counter(), Counter()
    for entry in cache.values():
        kind_counter[entry["kind"]] += 1
        for c in entry["codes"]:
            code_counter[c] += 1
    print("\n종류 분포:", dict(kind_counter))
    print("감정코드 분포:", dict(code_counter.most_common()))
    out = args.out_path or "seed_cache.json"
    save_cache(cache, out)
    print(f"\n다음 단계:\n  railway run --service Postgres -- "
          f".venv/bin/python seed_demo_records.py --commit --in {out}")


def main_cli():
    ap = argparse.ArgumentParser(description="데모용 더미 감정 기록 시딩")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", help="분류/플랜만 출력 (기본)")
    g.add_argument("--classify-only", action="store_true",
                   help="실제 분류 후 캐시(JSON)만 저장 (chatbot 서비스에서 실행)")
    g.add_argument("--commit", action="store_true", help="production DB에 삽입")
    g.add_argument("--clean", action="store_true", help="더미 데이터 제거")
    ap.add_argument("--in", dest="in_path", default=None,
                    help="commit/dry-run: 분류 캐시 JSON 로드(분류 재실행 생략)")
    ap.add_argument("--out", dest="out_path", default=None,
                    help="classify-only/dry-run: 분류 캐시 JSON 저장 경로")
    ap.add_argument("--limit-users", type=int, default=0,
                    help="commit 시 앞에서부터 N명만 처리(테스트용; clean은 항상 전체)")
    args = ap.parse_args()

    if args.classify_only:
        run_classify_only(args)
    elif args.commit:
        run_commit(args)
    elif args.clean:
        run_clean(args)
    else:
        run_dry(args)


if __name__ == "__main__":
    main_cli()
