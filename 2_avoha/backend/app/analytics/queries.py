"""대시보드 집계 SQL — Postgres 가 답해야 하는 시계열·랭킹 쿼리.

Redis 카운터로 답할 수 없는 (시간 분포, 페이지별 평균 dwell, 사용자 랭킹,
funnel 등) 쿼리만 여기서 처리. 단순 합계/DAU 는 counters.read_kpi_summary().
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Sequence

from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

Range = Literal["24h", "7d", "30d"]


def _range_to_delta(rng: Range) -> timedelta:
    if rng == "24h":
        return timedelta(hours=24)
    if rng == "7d":
        return timedelta(days=7)
    return timedelta(days=30)


def _since(rng: Range) -> datetime:
    # events.occurred_at 컬럼이 timezone-naive TIMESTAMP 라서 비교 인자도 naive 여야 함.
    # UTC 기준 wall-clock 으로 동일한 시점을 표현.
    return (datetime.now(timezone.utc) - _range_to_delta(rng)).replace(tzinfo=None)


def _since_aware(rng: Range) -> datetime:
    # 과거 가정: chatbot_* 가 timestamptz. 실제론 ORM Mapped[datetime] 가 type 명시
    # 없어 SQLAlchemy 기본인 naive TIMESTAMP 로 매핑됨 → asyncpg 가 aware 인자 받으면
    # "can't subtract offset-naive and offset-aware datetimes" 에러.
    # 안전하게 naive 로 통일 (events 와 동일 패턴).
    return (datetime.now(timezone.utc) - _range_to_delta(rng)).replace(tzinfo=None)


# ─── 운영자 통계 제외 (operator self-exclusion) ───
# OPS_ALLOWED_KAKAO_IDS 에 등록된 운영자가 본인 대시보드를 보면서 발생시킨 트래픽이
# DAU/페이지·이벤트 분포·사용자 랭킹을 오염시키지 않도록 모든 분석 쿼리에서 제외.


async def get_ops_user_ids(session: AsyncSession) -> list[str]:
    """OPS_ALLOWED_KAKAO_IDS → users.id UUID 리스트로 변환. 비어있으면 []."""
    kakao_ids = list(settings.ops_allowed_kakao_ids)
    if not kakao_ids:
        return []
    rows = await session.execute(
        sql_text("SELECT id::text AS id FROM users WHERE kakao_id = ANY(:ids)"),
        {"ids": kakao_ids},
    )
    return [r.id for r in rows]


# WHERE 절 추가용 — events / gems 등에 user_id 컬럼이 있을 때 사용.
# 빈 배열일 때 `<> ALL(ARRAY[])` 는 모든 row 통과시키므로 안전.
# CAST(:ops_ids AS text[]) — asyncpg 가 빈 list 의 array 타입 추론 못 하는 케이스 대비.
_EXCLUDE_OPS_EVENTS = (
    "AND (user_id IS NULL OR user_id::text <> ALL(CAST(:ops_ids AS text[]))) "
    "AND (props->>'path' IS NULL OR props->>'path' NOT LIKE '/ops/%')"
)
_EXCLUDE_OPS_GEMS = (
    "AND (g.user_id IS NULL OR g.user_id::text <> ALL(CAST(:ops_ids AS text[])))"
)


async def page_breakdown(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """페이지별 PV / unique users / 평균 dwell ms / 평균 스크롤 깊이."""
    rows = await session.execute(
        sql_text(
            f"""
            WITH views AS (
              SELECT
                COALESCE(props->>'path', '/(unknown)') AS path,
                user_id,
                COALESCE(props->>'anonId', '') AS anon
              FROM events
              WHERE event_type = 'page.view' AND occurred_at >= :since
                {_EXCLUDE_OPS_EVENTS}
            ),
            dwells AS (
              SELECT
                COALESCE(props->>'path', '/(unknown)') AS path,
                NULLIF((props->>'durationMs')::numeric, 0) AS d,
                NULLIF((props->>'scrollDepthPct')::numeric, 0) AS s
              FROM events
              WHERE event_type = 'page.dwell' AND occurred_at >= :since
                {_EXCLUDE_OPS_EVENTS}
            )
            SELECT
              v.path,
              COUNT(*)::int AS views,
              COUNT(DISTINCT COALESCE(v.user_id::text, v.anon))::int AS uniq,
              (SELECT COALESCE(AVG(d), 0)::int FROM dwells WHERE dwells.path = v.path) AS avg_dwell_ms,
              (SELECT COALESCE(AVG(s), 0)::numeric(5,1) FROM dwells WHERE dwells.path = v.path) AS avg_scroll_pct
            FROM views v
            GROUP BY v.path
            ORDER BY views DESC
            LIMIT 50
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [
        {
            "path": r.path,
            "views": r.views,
            "uniq": r.uniq,
            "avgDwellMs": r.avg_dwell_ms,
            "avgScrollPct": float(r.avg_scroll_pct or 0),
        }
        for r in rows
    ]


async def chatbot_funnel(session: AsyncSession, rng: Range) -> dict[str, object]:
    """챗봇 3단계 깔때기: 카카오 inbound → AI 분류 row → 사용자 web 확정.

    events 테이블 X — 카카오 webhook 이 우리 backend 가 아닌 ai/chatbot/ 서비스로
    직접 가서 chatbot_messages 에 쌓이고 있음. 그 데이터 소스로 교체.
    """
    row = await session.execute(
        sql_text(
            """
            SELECT
              (SELECT count(*) FROM chatbot_messages
                 WHERE direction='inbound' AND created_at >= :since) AS inbound,
              (SELECT count(*) FROM chatbot WHERE created_at >= :since) AS classified,
              (SELECT count(*) FROM chatbot
                 WHERE created_at >= :since AND confirmed_emotion_code IS NOT NULL) AS confirmed
            """
        ),
        {"since": _since_aware(rng)},
    )
    r = row.first()
    inbound = int(r.inbound or 0) if r else 0
    classified = int(r.classified or 0) if r else 0
    confirmed = int(r.confirmed or 0) if r else 0
    classify_rate = round(classified / inbound, 3) if inbound else 0.0
    confirm_rate = round(confirmed / classified, 3) if classified else 0.0
    overall_rate = round(confirmed / inbound, 3) if inbound else 0.0
    return {
        "inbound": inbound,
        "classified": classified,
        "confirmed": confirmed,
        "classifyRate": classify_rate,
        "confirmRate": confirm_rate,
        "overallRate": overall_rate,
    }


# ─── 사용자 플로우 — events 의 page.view 시퀀스 ───


async def page_transitions(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """from → to 페이지 이동 페어 빈도 (LAG window)."""
    rows = await session.execute(
        sql_text(
            f"""
            WITH pv AS (
              SELECT
                props->>'sessionId' AS sid,
                props->>'path' AS path,
                occurred_at,
                LAG(props->>'path') OVER (
                  PARTITION BY props->>'sessionId'
                  ORDER BY occurred_at
                ) AS prev_path
              FROM events
              WHERE event_type = 'page.view'
                AND occurred_at >= :since
                AND props->>'sessionId' IS NOT NULL
                {_EXCLUDE_OPS_EVENTS}
            )
            SELECT prev_path AS from_path, path AS to_path, count(*)::int AS cnt
            FROM pv
            WHERE prev_path IS NOT NULL AND prev_path <> path
            GROUP BY 1, 2
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [{"from": r.from_path, "to": r.to_path, "count": r.cnt} for r in rows]


async def entry_pages(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """각 세션의 첫 page.view = 진입 페이지."""
    rows = await session.execute(
        sql_text(
            f"""
            WITH ranked AS (
              SELECT
                props->>'sessionId' AS sid,
                props->>'path' AS path,
                ROW_NUMBER() OVER (
                  PARTITION BY props->>'sessionId' ORDER BY occurred_at ASC
                ) AS rn
              FROM events
              WHERE event_type = 'page.view'
                AND occurred_at >= :since
                AND props->>'sessionId' IS NOT NULL
                {_EXCLUDE_OPS_EVENTS}
            )
            SELECT path, count(*)::int AS sessions
            FROM ranked WHERE rn = 1 AND path IS NOT NULL
            GROUP BY path
            ORDER BY sessions DESC
            LIMIT 15
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [{"path": r.path, "sessions": r.sessions} for r in rows]


async def exit_pages(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """각 세션의 마지막 page.view = 이탈 페이지."""
    rows = await session.execute(
        sql_text(
            f"""
            WITH ranked AS (
              SELECT
                props->>'sessionId' AS sid,
                props->>'path' AS path,
                ROW_NUMBER() OVER (
                  PARTITION BY props->>'sessionId' ORDER BY occurred_at DESC
                ) AS rn
              FROM events
              WHERE event_type = 'page.view'
                AND occurred_at >= :since
                AND props->>'sessionId' IS NOT NULL
                {_EXCLUDE_OPS_EVENTS}
            )
            SELECT path, count(*)::int AS sessions
            FROM ranked WHERE rn = 1 AND path IS NOT NULL
            GROUP BY path
            ORDER BY sessions DESC
            LIMIT 15
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [{"path": r.path, "sessions": r.sessions} for r in rows]


async def session_paths_top(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """세션별 page.view 시퀀스를 화살표로 묶어 동일 시퀀스 빈도."""
    rows = await session.execute(
        sql_text(
            f"""
            WITH seq AS (
              SELECT
                props->>'sessionId' AS sid,
                string_agg(props->>'path', ' → ' ORDER BY occurred_at) AS path_seq,
                count(*) AS steps,
                min(occurred_at) AS started_at
              FROM events
              WHERE event_type = 'page.view'
                AND occurred_at >= :since
                AND props->>'sessionId' IS NOT NULL
                {_EXCLUDE_OPS_EVENTS}
              GROUP BY props->>'sessionId'
              HAVING count(*) BETWEEN 2 AND 12
            )
            SELECT path_seq, steps::int AS steps, count(*)::int AS sessions
            FROM seq
            GROUP BY path_seq, steps
            ORDER BY sessions DESC, steps DESC
            LIMIT 20
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [
        {"sequence": r.path_seq, "steps": r.steps, "sessions": r.sessions}
        for r in rows
    ]


# ─── 감정 기록 분석 — gems × emotions JOIN ───


async def emotion_distribution(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """전체 감정 분포 — emotion_code 별 카운트 + 한글명 + hex_color."""
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              g.emotion_code AS code,
              COALESCE(e.name_ko, g.emotion_code) AS name_ko,
              COALESCE(e.hex_color, '#A0BCA8') AS hex_color,
              count(*)::int AS cnt
            FROM gems g
            LEFT JOIN emotions e ON e.code = g.emotion_code
            WHERE g.created_at >= :since
              {_EXCLUDE_OPS_GEMS}
            GROUP BY g.emotion_code, e.name_ko, e.hex_color
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    items = [
        {
            "code": r.code,
            "nameKo": r.name_ko,
            "hexColor": r.hex_color,
            "count": r.cnt,
        }
        for r in rows
    ]
    total = sum(it["count"] for it in items) or 1
    for it in items:
        it["pct"] = round(it["count"] / total * 100, 1)
    return items


async def emotion_by_hour(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """KST 시간대(0-23)별 감정 분포 — heatmap 용."""
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              date_part('hour', g.created_at AT TIME ZONE 'Asia/Seoul')::int AS hour,
              g.emotion_code AS code,
              COALESCE(e.name_ko, g.emotion_code) AS name_ko,
              COALESCE(e.hex_color, '#A0BCA8') AS hex_color,
              count(*)::int AS cnt
            FROM gems g
            LEFT JOIN emotions e ON e.code = g.emotion_code
            WHERE g.created_at >= :since
              {_EXCLUDE_OPS_GEMS}
            GROUP BY 1, g.emotion_code, e.name_ko, e.hex_color
            ORDER BY 1 ASC
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [
        {
            "hour": r.hour,
            "code": r.code,
            "nameKo": r.name_ko,
            "hexColor": r.hex_color,
            "count": r.cnt,
        }
        for r in rows
    ]


async def emotion_by_dow(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """요일(0=일~6=토)별 감정 분포."""
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              EXTRACT(DOW FROM g.created_at AT TIME ZONE 'Asia/Seoul')::int AS dow,
              g.emotion_code AS code,
              COALESCE(e.name_ko, g.emotion_code) AS name_ko,
              COALESCE(e.hex_color, '#A0BCA8') AS hex_color,
              count(*)::int AS cnt
            FROM gems g
            LEFT JOIN emotions e ON e.code = g.emotion_code
            WHERE g.created_at >= :since
              {_EXCLUDE_OPS_GEMS}
            GROUP BY 1, g.emotion_code, e.name_ko, e.hex_color
            ORDER BY 1 ASC
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [
        {
            "dow": r.dow,
            "code": r.code,
            "nameKo": r.name_ko,
            "hexColor": r.hex_color,
            "count": r.cnt,
        }
        for r in rows
    ]


async def emotion_by_user(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """사용자별 Top 감정 (가장 많이 기록한 감정 1위)."""
    rows = await session.execute(
        sql_text(
            f"""
            WITH per_user_emo AS (
              SELECT
                g.user_id,
                u.nickname,
                g.emotion_code,
                COALESCE(e.name_ko, g.emotion_code) AS name_ko,
                COALESCE(e.hex_color, '#A0BCA8') AS hex_color,
                count(*)::int AS gem_count,
                ROW_NUMBER() OVER (
                  PARTITION BY g.user_id
                  ORDER BY count(*) DESC
                ) AS rn,
                SUM(count(*)) OVER (PARTITION BY g.user_id) AS total
              FROM gems g
              LEFT JOIN users u ON u.id = g.user_id
              LEFT JOIN emotions e ON e.code = g.emotion_code
              WHERE g.created_at >= :since
                {_EXCLUDE_OPS_GEMS}
              GROUP BY g.user_id, u.nickname, g.emotion_code, e.name_ko, e.hex_color
            )
            SELECT
              user_id::text AS user_id,
              nickname,
              emotion_code AS top_code,
              name_ko AS top_name,
              hex_color AS top_color,
              gem_count AS top_count,
              total::int AS total
            FROM per_user_emo
            WHERE rn = 1
            ORDER BY total DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [
        {
            "userId": r.user_id,
            "nickname": r.nickname or "(unmapped)",
            "topEmotionCode": r.top_code,
            "topEmotionLabel": r.top_name,
            "topEmotionColor": r.top_color,
            "topEmotionCount": r.top_count,
            "totalGems": r.total,
        }
        for r in rows
    ]


async def event_type_distribution(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    rows = await session.execute(
        sql_text(
            f"""
            SELECT event_type AS type, COUNT(*)::int AS cnt
            FROM events
            WHERE occurred_at >= :since
              {_EXCLUDE_OPS_EVENTS}
            GROUP BY event_type
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [{"type": r.type, "count": r.cnt} for r in rows]


async def hourly_timeseries(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              date_trunc('hour', occurred_at) AS bucket,
              COUNT(*)::int AS cnt
            FROM events
            WHERE occurred_at >= :since
              {_EXCLUDE_OPS_EVENTS}
            GROUP BY 1
            ORDER BY 1 ASC
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [{"hour": r.bucket.isoformat(), "count": r.cnt} for r in rows]


async def users_ranking(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """사용자별 활동량 Top — 익명 anon_user_links 도 묶어서 본다."""
    rows = await session.execute(
        sql_text(
            """
            WITH owner AS (
              SELECT
                COALESCE(e.user_id, l.user_id) AS uid,
                e.occurred_at,
                e.props->>'sessionId' AS session_id,
                e.props->>'path' AS path
              FROM events e
              LEFT JOIN anon_user_links l
                ON l.anon_id = (e.props->>'anonId') AND e.user_id IS NULL
              WHERE e.occurred_at >= :since
                AND (e.props->>'path' IS NULL OR e.props->>'path' NOT LIKE '/ops/%')
            )
            SELECT
              o.uid::text AS user_id,
              u.nickname AS nickname,
              COUNT(*)::int AS event_count,
              COUNT(DISTINCT o.session_id)::int AS session_count,
              MAX(o.occurred_at) AS last_seen
            FROM owner o
            LEFT JOIN users u ON u.id = o.uid
            WHERE o.uid IS NOT NULL
              AND o.uid::text <> ALL(CAST(:ops_ids AS text[]))
            GROUP BY o.uid, u.nickname
            ORDER BY event_count DESC
            LIMIT 50
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [
        {
            "userId": r.user_id,
            "nickname": r.nickname or "(anon)",
            "eventCount": r.event_count,
            "sessionCount": r.session_count,
            "lastSeen": r.last_seen.isoformat() if r.last_seen else None,
        }
        for r in rows
    ]


async def user_directory(
    session: AsyncSession, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """등록 사용자 전체 디렉터리 (운영자 제외) — 개인별 드릴다운의 진입점.

    활동 0인 신규 유저도 보이도록 users 에서 시작해 events 를 LEFT JOIN.
    익명(anon_user_links) 활동도 한 사람으로 묶어 카운트. 통계는 전 기간 기준
    (기간 필터는 상세 드로어에서) — LIMIT 없음.
    """
    rows = await session.execute(
        sql_text(
            """
            WITH ev AS (
              SELECT
                COALESCE(e.user_id, l.user_id) AS uid,
                e.occurred_at
              FROM events e
              LEFT JOIN anon_user_links l
                ON l.anon_id = (e.props->>'anonId') AND e.user_id IS NULL
              WHERE e.props->>'path' IS NULL OR e.props->>'path' NOT LIKE '/ops/%'
            ),
            agg AS (
              SELECT uid, COUNT(*)::int AS event_count, MAX(occurred_at) AS last_seen
              FROM ev WHERE uid IS NOT NULL GROUP BY uid
            )
            SELECT
              u.id::text AS user_id,
              u.nickname,
              u.kakao_id::text AS kakao_id,
              u.joined_at,
              COALESCE(a.event_count, 0) AS event_count,
              a.last_seen
            FROM users u
            LEFT JOIN agg a ON a.uid = u.id
            WHERE u.deleted_at IS NULL
              AND u.id::text <> ALL(CAST(:ops_ids AS text[]))
            ORDER BY a.last_seen DESC NULLS LAST, u.joined_at DESC
            """
        ),
        {"ops_ids": list(ops_ids)},
    )
    return [
        {
            "userId": r.user_id,
            "nickname": r.nickname,
            "kakaoId": r.kakao_id,
            "joinedAt": r.joined_at.isoformat() if r.joined_at else None,
            "eventCount": r.event_count,
            "lastSeen": r.last_seen.isoformat() if r.last_seen else None,
        }
        for r in rows
    ]


async def user_profile(
    session: AsyncSession, user_id: str, rng: Range
) -> dict | None:
    """한 사용자의 전체 프로필 — 프로필 + 요약 + 이벤트유형 + 감정 + 타임라인 + 챗봇기록.

    이벤트는 익명 stitching 포함(users_ranking 과 동일 규칙). 명시적으로 그 유저를
    조회하므로 운영자 자기제외는 적용하지 않음. user_id 가 uuid 아님/미존재면 None.
    """
    prof = (
        await session.execute(
            sql_text(
                """
                SELECT id::text AS user_id, nickname, kakao_id::text AS kakao_id,
                       joined_at, profile_url, provider_user_key
                FROM users WHERE id::text = :uid AND deleted_at IS NULL
                """
            ),
            {"uid": user_id},
        )
    ).first()
    if prof is None:
        return None

    since = _since(rng)
    params = {"since": since, "uid": user_id}
    # 익명 stitching 포함한 "이 사용자의 이벤트" 조건. user_id 직매칭은 부분 인덱스 활용.
    ev_pred = (
        "e.occurred_at >= :since AND ("
        "e.user_id::text = :uid OR (e.user_id IS NULL AND e.props->>'anonId' IN "
        "(SELECT anon_id FROM anon_user_links WHERE user_id::text = :uid)))"
    )

    summary_row = (
        await session.execute(
            sql_text(
                f"""
                SELECT COUNT(*)::int AS total_events,
                       COUNT(DISTINCT e.props->>'sessionId')::int AS session_count
                FROM events e WHERE {ev_pred}
                """
            ),
            params,
        )
    ).first()

    type_rows = await session.execute(
        sql_text(
            f"""
            SELECT e.event_type AS type, COUNT(*)::int AS cnt
            FROM events e WHERE {ev_pred}
            GROUP BY e.event_type ORDER BY cnt DESC LIMIT 30
            """
        ),
        params,
    )

    timeline_rows = await session.execute(
        sql_text(
            f"""
            SELECT e.event_type, e.props, e.occurred_at
            FROM events e WHERE {ev_pred}
            ORDER BY e.occurred_at DESC LIMIT 200
            """
        ),
        params,
    )
    timeline = [
        {
            "eventType": r.event_type,
            "props": r.props,
            "occurredAt": r.occurred_at.isoformat() if r.occurred_at else None,
        }
        for r in timeline_rows
    ]

    emo_rows = await session.execute(
        sql_text(
            """
            SELECT g.emotion_code AS code,
                   COALESCE(em.name_ko, g.emotion_code) AS name_ko,
                   COALESCE(em.hex_color, '#A0BCA8') AS hex_color,
                   COUNT(*)::int AS cnt
            FROM gems g
            LEFT JOIN emotions em ON em.code = g.emotion_code
            WHERE g.user_id::text = :uid AND g.created_at >= :since
            GROUP BY g.emotion_code, em.name_ko, em.hex_color
            ORDER BY cnt DESC LIMIT 30
            """
        ),
        {"uid": user_id, "since": since},
    )
    emotions = [
        {"code": r.code, "nameKo": r.name_ko, "hexColor": r.hex_color, "count": r.cnt}
        for r in emo_rows
    ]
    emo_total = sum(e["count"] for e in emotions) or 1
    for e in emotions:
        e["pct"] = round(e["count"] / emo_total * 100, 1)

    gem_count = (
        await session.execute(
            sql_text(
                "SELECT COUNT(*)::int FROM gems WHERE user_id::text = :uid AND created_at >= :since"
            ),
            {"uid": user_id, "since": since},
        )
    ).scalar() or 0

    pkey = prof.provider_user_key
    chatbot_records: list[dict] = []
    chatbot_count = 0
    if pkey:
        cb_rows = await session.execute(
            sql_text(
                """
                SELECT gem, record_text, has_photo, confirmed_emotion_code, created_at
                FROM chatbot
                WHERE user_id = :pkey AND created_at >= :since
                ORDER BY created_at DESC LIMIT 50
                """
            ),
            {"pkey": pkey, "since": _since_aware(rng)},
        )
        chatbot_records = [
            {
                "gem": r.gem,
                "recordText": r.record_text,
                "hasPhoto": r.has_photo,
                "confirmedEmotionCode": r.confirmed_emotion_code,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in cb_rows
        ]
        chatbot_count = (
            await session.execute(
                sql_text(
                    "SELECT COUNT(*)::int FROM chatbot WHERE user_id = :pkey AND created_at >= :since"
                ),
                {"pkey": pkey, "since": _since_aware(rng)},
            )
        ).scalar() or 0

    return {
        "profile": {
            "userId": prof.user_id,
            "nickname": prof.nickname,
            "kakaoId": prof.kakao_id,
            "joinedAt": prof.joined_at.isoformat() if prof.joined_at else None,
            "profileUrl": prof.profile_url,
            "lastSeen": timeline[0]["occurredAt"] if timeline else None,
        },
        "summary": {
            "totalEvents": summary_row.total_events if summary_row else 0,
            "sessionCount": summary_row.session_count if summary_row else 0,
            "gemCount": gem_count,
            "chatbotRecordCount": chatbot_count,
        },
        "eventTypes": [{"type": r.type, "count": r.cnt} for r in type_rows],
        "emotions": emotions,
        "timeline": timeline,
        "chatbotRecords": chatbot_records,
    }


async def error_ranking(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              event_type,
              COALESCE(props->>'message', props->>'code', '(unknown)') AS message,
              COUNT(*)::int AS cnt,
              MAX(occurred_at) AS last_seen
            FROM events
            WHERE occurred_at >= :since
              AND event_type IN ('error.client', 'error.api')
              {_EXCLUDE_OPS_EVENTS}
            GROUP BY 1, 2
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    return [
        {
            "eventType": r.event_type,
            "message": r.message,
            "count": r.cnt,
            "lastSeen": r.last_seen.isoformat() if r.last_seen else None,
        }
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────
# Chatbot 직접 통계 — ai/chatbot/ 서비스가 동일한 Postgres 에 쌓은 데이터.
# chatbot, chatbot_messages, chatbot_llm_calls, chatbot_errors 모두 timestamptz.
# ─────────────────────────────────────────────────────────────────


async def chatbot_traffic_summary(session: AsyncSession, rng: Range) -> dict:
    """챗봇 inbound/outbound 카운트 + 평균 응답 latency (같은 trace_id 의 in→out 시차)."""
    rows = await session.execute(
        sql_text(
            """
            WITH dirs AS (
              SELECT direction, count(*)::int AS cnt
              FROM chatbot_messages
              WHERE created_at >= :since
              GROUP BY direction
            )
            SELECT
              COALESCE((SELECT cnt FROM dirs WHERE direction='inbound'), 0) AS inbound,
              COALESCE((SELECT cnt FROM dirs WHERE direction='outbound'), 0) AS outbound
            """
        ),
        {"since": _since_aware(rng)},
    )
    base = rows.first()
    latency_row = await session.execute(
        sql_text(
            """
            WITH pairs AS (
              SELECT
                trace_id,
                min(CASE WHEN direction='inbound' THEN created_at END) AS in_at,
                min(CASE WHEN direction='outbound' THEN created_at END) AS out_at
              FROM chatbot_messages
              WHERE created_at >= :since
              GROUP BY trace_id
            )
            SELECT
              count(*) FILTER (WHERE out_at IS NOT NULL AND in_at IS NOT NULL)::int AS pairs,
              COALESCE(
                AVG(EXTRACT(EPOCH FROM (out_at - in_at)) * 1000)
                  FILTER (WHERE out_at IS NOT NULL AND in_at IS NOT NULL)
              , 0)::int AS avg_response_ms,
              COALESCE(
                percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (out_at - in_at)) * 1000)
                  FILTER (WHERE out_at IS NOT NULL AND in_at IS NOT NULL)
              , 0)::int AS p95_response_ms
            FROM pairs
            """
        ),
        {"since": _since_aware(rng)},
    )
    lat = latency_row.first()
    return {
        "inbound": base.inbound if base else 0,
        "outbound": base.outbound if base else 0,
        "pairedTraces": lat.pairs if lat else 0,
        "avgResponseMs": lat.avg_response_ms if lat else 0,
        "p95ResponseMs": lat.p95_response_ms if lat else 0,
    }


async def chatbot_hourly(session: AsyncSession, rng: Range) -> list[dict]:
    """챗봇 메시지 시간대별 카운트."""
    rows = await session.execute(
        sql_text(
            """
            SELECT
              date_trunc('hour', created_at) AS bucket,
              count(*) FILTER (WHERE direction='inbound')::int AS inbound,
              count(*) FILTER (WHERE direction='outbound')::int AS outbound
            FROM chatbot_messages
            WHERE created_at >= :since
            GROUP BY 1
            ORDER BY 1 ASC
            """
        ),
        {"since": _since_aware(rng)},
    )
    return [
        {
            "hour": r.bucket.isoformat() if r.bucket else None,
            "inbound": r.inbound,
            "outbound": r.outbound,
        }
        for r in rows
    ]


async def chatbot_llm_stats(session: AsyncSession, rng: Range) -> list[dict]:
    """LLM 호출 통계 — call_type 별 횟수/성공률/평균·p95 latency."""
    rows = await session.execute(
        sql_text(
            """
            SELECT
              call_type,
              model,
              count(*)::int AS calls,
              count(*) FILTER (WHERE status='ok')::int AS ok,
              count(*) FILTER (WHERE status<>'ok')::int AS failed,
              COALESCE(AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL), 0)::int AS avg_ms,
              COALESCE(
                percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
                  FILTER (WHERE latency_ms IS NOT NULL)
              , 0)::int AS p95_ms
            FROM chatbot_llm_calls
            WHERE created_at >= :since
            GROUP BY call_type, model
            ORDER BY calls DESC
            """
        ),
        {"since": _since_aware(rng)},
    )
    out = []
    for r in rows:
        total = r.calls or 1
        out.append({
            "callType": r.call_type,
            "model": r.model,
            "calls": r.calls,
            "ok": r.ok,
            "failed": r.failed,
            "successRate": round((r.ok / total), 3),
            "avgMs": r.avg_ms,
            "p95Ms": r.p95_ms,
        })
    return out


async def chatbot_errors(session: AsyncSession, rng: Range, limit: int = 30) -> dict:
    """챗봇 에러 — source 별 집계 + 최근 N건."""
    rollup = await session.execute(
        sql_text(
            """
            SELECT source, count(*)::int AS cnt, max(created_at) AS last_seen
            FROM chatbot_errors
            WHERE created_at >= :since
            GROUP BY source
            ORDER BY cnt DESC
            LIMIT 20
            """
        ),
        {"since": _since_aware(rng)},
    )
    recent = await session.execute(
        sql_text(
            """
            SELECT id, source, message, user_id, trace_id::text AS trace_id, created_at
            FROM chatbot_errors
            WHERE created_at >= :since
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        {"since": _since_aware(rng), "limit": limit},
    )
    return {
        "bySource": [
            {
                "source": r.source,
                "count": r.cnt,
                "lastSeen": r.last_seen.isoformat() if r.last_seen else None,
            }
            for r in rollup
        ],
        "recent": [
            {
                "id": r.id,
                "source": r.source,
                "message": r.message[:200] if r.message else None,
                "userId": r.user_id,
                "traceId": r.trace_id,
                "occurredAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in recent
        ],
    }


async def chatbot_gem_distribution(session: AsyncSession, rng: Range) -> list[dict]:
    """챗봇이 분류한 감정 원석 분포 (chatbot.gem 컬럼)."""
    rows = await session.execute(
        sql_text(
            """
            SELECT gem, count(*)::int AS cnt
            FROM chatbot
            WHERE created_at >= :since AND gem IS NOT NULL AND gem <> ''
            GROUP BY gem
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since_aware(rng)},
    )
    return [{"gem": r.gem, "count": r.cnt} for r in rows]


async def chatbot_top_users(session: AsyncSession, rng: Range) -> list[dict]:
    """챗봇 사용 Top — users 테이블과 join 해서 닉네임도 함께."""
    rows = await session.execute(
        sql_text(
            """
            SELECT
              c.user_id AS provider_user_key,
              u.nickname,
              count(*)::int AS records,
              count(*) FILTER (WHERE c.has_photo)::int AS with_photo,
              max(c.created_at) AS last_at
            FROM chatbot c
            LEFT JOIN users u ON u.provider_user_key = c.user_id
            WHERE c.created_at >= :since
            GROUP BY c.user_id, u.nickname
            ORDER BY records DESC
            LIMIT 30
            """
        ),
        {"since": _since_aware(rng)},
    )
    return [
        {
            "providerUserKey": (r.provider_user_key or "")[:20],
            "nickname": r.nickname or "(unmapped)",
            "records": r.records,
            "withPhoto": r.with_photo,
            "lastAt": r.last_at.isoformat() if r.last_at else None,
        }
        for r in rows
    ]


async def recent_events(
    session: AsyncSession,
    rng: Range,
    limit: int = 200,
    ops_ids: Sequence[str] = (),
) -> list[dict]:
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              event_type, user_id::text AS user_id, props, occurred_at
            FROM events
            WHERE occurred_at >= :since
              {_EXCLUDE_OPS_EVENTS}
            ORDER BY occurred_at DESC
            LIMIT :limit
            """
        ),
        {"since": _since(rng), "limit": limit, "ops_ids": list(ops_ids)},
    )
    return [
        {
            "eventType": r.event_type,
            "userId": r.user_id,
            "props": r.props,
            "occurredAt": r.occurred_at.isoformat() if r.occurred_at else None,
        }
        for r in rows
    ]


# ─── 신규 4개 시각화 쿼리 ───


async def device_distribution(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """디바이스(mobile/tablet/desktop) 별 고유 사용자 수 + 점유율."""
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              COALESCE(props->>'deviceType', '(unknown)') AS device,
              COUNT(DISTINCT COALESCE(user_id::text, props->>'anonId'))::int AS uniq,
              COUNT(*)::int AS views
            FROM events
            WHERE event_type = 'page.view' AND occurred_at >= :since
              {_EXCLUDE_OPS_EVENTS}
            GROUP BY 1
            ORDER BY uniq DESC
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    items = [
        {"device": r.device, "uniq": r.uniq, "views": r.views}
        for r in rows
    ]
    total_uniq = sum(it["uniq"] for it in items) or 1
    for it in items:
        it["pct"] = round(it["uniq"] / total_uniq * 100, 1)
    return items


async def new_vs_returning(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> dict:
    """anonId 의 첫 등장 시점이 기간 내면 신규, 이전이면 재방문."""
    row = await session.execute(
        sql_text(
            f"""
            WITH active_anons AS (
              SELECT DISTINCT props->>'anonId' AS anon
              FROM events
              WHERE event_type = 'page.view'
                AND occurred_at >= :since
                AND props->>'anonId' IS NOT NULL
                {_EXCLUDE_OPS_EVENTS}
            ),
            first_seen AS (
              SELECT
                props->>'anonId' AS anon,
                MIN(occurred_at) AS first_at
              FROM events
              WHERE event_type = 'page.view'
                AND props->>'anonId' IS NOT NULL
                {_EXCLUDE_OPS_EVENTS}
              GROUP BY 1
            )
            SELECT
              COUNT(*) FILTER (WHERE fs.first_at >= :since)::int AS new_users,
              COUNT(*) FILTER (WHERE fs.first_at < :since)::int AS returning_users
            FROM active_anons aa
            JOIN first_seen fs ON fs.anon = aa.anon
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    r = row.first()
    new_u = int(r.new_users or 0) if r else 0
    ret_u = int(r.returning_users or 0) if r else 0
    total = new_u + ret_u or 1
    return {
        "new": new_u,
        "returning": ret_u,
        "newPct": round(new_u / total * 100, 1),
        "returningPct": round(ret_u / total * 100, 1),
    }


# Core Web Vitals 임계값 (Google 표준). good <= good, needs <= needs, else poor.
_WV_THRESHOLDS = {
    "LCP": (2500, 4000),
    "FCP": (1800, 3000),
    "INP": (200, 500),
    "TTFB": (800, 1800),
    "CLS": (0.1, 0.25),
}


def _wv_rating(metric: str, p75: float) -> str:
    th = _WV_THRESHOLDS.get(metric)
    if not th:
        return "unknown"
    good, needs = th
    if p75 <= good:
        return "good"
    if p75 <= needs:
        return "needs"
    return "poor"


async def web_vitals_summary(
    session: AsyncSession, rng: Range, ops_ids: Sequence[str] = ()
) -> list[dict]:
    """Core Web Vitals — metric 별 p75 + good/needs/poor 분류."""
    rows = await session.execute(
        sql_text(
            f"""
            SELECT
              props->>'name' AS metric,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY (props->>'value')::numeric) AS p75,
              count(*)::int AS samples
            FROM events
            WHERE event_type = 'perf.web_vitals'
              AND occurred_at >= :since
              AND props->>'name' IS NOT NULL
              AND props->>'value' IS NOT NULL
              {_EXCLUDE_OPS_EVENTS}
            GROUP BY 1
            ORDER BY 1
            """
        ),
        {"since": _since(rng), "ops_ids": list(ops_ids)},
    )
    out = []
    for r in rows:
        p75 = float(r.p75 or 0)
        out.append({
            "metric": r.metric,
            "p75": round(p75, 3) if r.metric == "CLS" else round(p75),
            "samples": r.samples,
            "rating": _wv_rating(r.metric, p75),
        })
    return out
