"""대시보드 집계 SQL — Postgres 가 답해야 하는 시계열·랭킹 쿼리.

Redis 카운터로 답할 수 없는 (시간 분포, 페이지별 평균 dwell, 사용자 랭킹,
funnel 등) 쿼리만 여기서 처리. 단순 합계/DAU 는 counters.read_kpi_summary().
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

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


async def page_breakdown(session: AsyncSession, rng: Range) -> list[dict]:
    """페이지별 PV / unique users / 평균 dwell ms."""
    rows = await session.execute(
        sql_text(
            """
            WITH views AS (
              SELECT
                COALESCE(props->>'path', '/(unknown)') AS path,
                user_id,
                COALESCE(props->>'anonId', '') AS anon
              FROM events
              WHERE event_type = 'page.view' AND occurred_at >= :since
            ),
            dwells AS (
              SELECT
                COALESCE(props->>'path', '/(unknown)') AS path,
                NULLIF((props->>'durationMs')::numeric, 0) AS d
              FROM events
              WHERE event_type = 'page.dwell' AND occurred_at >= :since
            )
            SELECT
              v.path,
              COUNT(*)::int AS views,
              COUNT(DISTINCT COALESCE(v.user_id::text, v.anon))::int AS uniq,
              (SELECT COALESCE(AVG(d), 0)::int FROM dwells WHERE dwells.path = v.path) AS avg_dwell_ms
            FROM views v
            GROUP BY v.path
            ORDER BY views DESC
            LIMIT 50
            """
        ),
        {"since": _since(rng)},
    )
    return [
        {
            "path": r.path,
            "views": r.views,
            "uniq": r.uniq,
            "avgDwellMs": r.avg_dwell_ms,
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


async def page_transitions(session: AsyncSession, rng: Range) -> list[dict]:
    """from → to 페이지 이동 페어 빈도 (LAG window)."""
    rows = await session.execute(
        sql_text(
            """
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
            )
            SELECT prev_path AS from_path, path AS to_path, count(*)::int AS cnt
            FROM pv
            WHERE prev_path IS NOT NULL AND prev_path <> path
            GROUP BY 1, 2
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng)},
    )
    return [{"from": r.from_path, "to": r.to_path, "count": r.cnt} for r in rows]


async def entry_pages(session: AsyncSession, rng: Range) -> list[dict]:
    """각 세션의 첫 page.view = 진입 페이지."""
    rows = await session.execute(
        sql_text(
            """
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
            )
            SELECT path, count(*)::int AS sessions
            FROM ranked WHERE rn = 1 AND path IS NOT NULL
            GROUP BY path
            ORDER BY sessions DESC
            LIMIT 15
            """
        ),
        {"since": _since(rng)},
    )
    return [{"path": r.path, "sessions": r.sessions} for r in rows]


async def exit_pages(session: AsyncSession, rng: Range) -> list[dict]:
    """각 세션의 마지막 page.view = 이탈 페이지."""
    rows = await session.execute(
        sql_text(
            """
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
            )
            SELECT path, count(*)::int AS sessions
            FROM ranked WHERE rn = 1 AND path IS NOT NULL
            GROUP BY path
            ORDER BY sessions DESC
            LIMIT 15
            """
        ),
        {"since": _since(rng)},
    )
    return [{"path": r.path, "sessions": r.sessions} for r in rows]


async def session_paths_top(session: AsyncSession, rng: Range) -> list[dict]:
    """세션별 page.view 시퀀스를 화살표로 묶어 동일 시퀀스 빈도."""
    rows = await session.execute(
        sql_text(
            """
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
        {"since": _since(rng)},
    )
    return [
        {"sequence": r.path_seq, "steps": r.steps, "sessions": r.sessions}
        for r in rows
    ]


# ─── 감정 기록 분석 — gems × emotions JOIN ───


async def emotion_distribution(session: AsyncSession, rng: Range) -> list[dict]:
    """전체 감정 분포 — emotion_code 별 카운트 + 한글명 + hex_color."""
    rows = await session.execute(
        sql_text(
            """
            SELECT
              g.emotion_code AS code,
              COALESCE(e.name_ko, g.emotion_code) AS name_ko,
              COALESCE(e.hex_color, '#A0BCA8') AS hex_color,
              count(*)::int AS cnt
            FROM gems g
            LEFT JOIN emotions e ON e.code = g.emotion_code
            WHERE g.created_at >= :since
            GROUP BY g.emotion_code, e.name_ko, e.hex_color
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng)},
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


async def emotion_by_hour(session: AsyncSession, rng: Range) -> list[dict]:
    """KST 시간대(0-23)별 감정 분포 — stacked bar 용."""
    rows = await session.execute(
        sql_text(
            """
            SELECT
              date_part('hour', g.created_at AT TIME ZONE 'Asia/Seoul')::int AS hour,
              g.emotion_code AS code,
              COALESCE(e.name_ko, g.emotion_code) AS name_ko,
              COALESCE(e.hex_color, '#A0BCA8') AS hex_color,
              count(*)::int AS cnt
            FROM gems g
            LEFT JOIN emotions e ON e.code = g.emotion_code
            WHERE g.created_at >= :since
            GROUP BY 1, g.emotion_code, e.name_ko, e.hex_color
            ORDER BY 1 ASC
            """
        ),
        {"since": _since(rng)},
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


async def emotion_by_dow(session: AsyncSession, rng: Range) -> list[dict]:
    """요일(0=일~6=토)별 감정 분포."""
    rows = await session.execute(
        sql_text(
            """
            SELECT
              EXTRACT(DOW FROM g.created_at AT TIME ZONE 'Asia/Seoul')::int AS dow,
              g.emotion_code AS code,
              COALESCE(e.name_ko, g.emotion_code) AS name_ko,
              COALESCE(e.hex_color, '#A0BCA8') AS hex_color,
              count(*)::int AS cnt
            FROM gems g
            LEFT JOIN emotions e ON e.code = g.emotion_code
            WHERE g.created_at >= :since
            GROUP BY 1, g.emotion_code, e.name_ko, e.hex_color
            ORDER BY 1 ASC
            """
        ),
        {"since": _since(rng)},
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


async def emotion_by_user(session: AsyncSession, rng: Range) -> list[dict]:
    """사용자별 Top 감정 (가장 많이 기록한 감정 1위)."""
    rows = await session.execute(
        sql_text(
            """
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
        {"since": _since(rng)},
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


async def event_type_distribution(session: AsyncSession, rng: Range) -> list[dict]:
    rows = await session.execute(
        sql_text(
            """
            SELECT event_type AS type, COUNT(*)::int AS cnt
            FROM events
            WHERE occurred_at >= :since
            GROUP BY event_type
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng)},
    )
    return [{"type": r.type, "count": r.cnt} for r in rows]


async def hourly_timeseries(session: AsyncSession, rng: Range) -> list[dict]:
    rows = await session.execute(
        sql_text(
            """
            SELECT
              date_trunc('hour', occurred_at) AS bucket,
              COUNT(*)::int AS cnt
            FROM events
            WHERE occurred_at >= :since
            GROUP BY 1
            ORDER BY 1 ASC
            """
        ),
        {"since": _since(rng)},
    )
    return [{"hour": r.bucket.isoformat(), "count": r.cnt} for r in rows]


async def users_ranking(session: AsyncSession, rng: Range) -> list[dict]:
    """사용자별 활동량 Top — 익명 anon_user_links 도 묶어서 본다."""
    rows = await session.execute(
        sql_text(
            """
            WITH owner AS (
              SELECT
                COALESCE(e.user_id, l.user_id) AS uid,
                e.occurred_at,
                e.props->>'sessionId' AS session_id
              FROM events e
              LEFT JOIN anon_user_links l
                ON l.anon_id = (e.props->>'anonId') AND e.user_id IS NULL
              WHERE e.occurred_at >= :since
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
            GROUP BY o.uid, u.nickname
            ORDER BY event_count DESC
            LIMIT 50
            """
        ),
        {"since": _since(rng)},
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


async def error_ranking(session: AsyncSession, rng: Range) -> list[dict]:
    rows = await session.execute(
        sql_text(
            """
            SELECT
              event_type,
              COALESCE(props->>'message', props->>'code', '(unknown)') AS message,
              COUNT(*)::int AS cnt,
              MAX(occurred_at) AS last_seen
            FROM events
            WHERE occurred_at >= :since
              AND event_type IN ('error.client', 'error.api')
            GROUP BY 1, 2
            ORDER BY cnt DESC
            LIMIT 30
            """
        ),
        {"since": _since(rng)},
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


async def recent_events(session: AsyncSession, rng: Range, limit: int = 200) -> list[dict]:
    rows = await session.execute(
        sql_text(
            """
            SELECT
              event_type, user_id::text AS user_id, props, occurred_at
            FROM events
            WHERE occurred_at >= :since
            ORDER BY occurred_at DESC
            LIMIT :limit
            """
        ),
        {"since": _since(rng), "limit": limit},
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
