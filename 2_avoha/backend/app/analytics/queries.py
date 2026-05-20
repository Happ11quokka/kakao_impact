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
    return datetime.now(timezone.utc) - _range_to_delta(rng)


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


async def chatbot_funnel(session: AsyncSession, rng: Range) -> dict[str, int]:
    """챗봇 깔때기: 질문 → 분류확인."""
    rows = await session.execute(
        sql_text(
            """
            SELECT event_type, COUNT(*)::int AS cnt
            FROM events
            WHERE occurred_at >= :since
              AND event_type IN ('chatbot.question.sent', 'record_emotion_confirmed')
            GROUP BY event_type
            """
        ),
        {"since": _since(rng)},
    )
    counts = {r.event_type: r.cnt for r in rows}
    questions = counts.get("chatbot.question.sent", 0)
    confirmations = counts.get("record_emotion_confirmed", 0)
    rate = (confirmations / questions) if questions else 0.0
    return {
        "questions": questions,
        "confirmations": confirmations,
        "confirmRate": round(rate, 3),
    }


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
