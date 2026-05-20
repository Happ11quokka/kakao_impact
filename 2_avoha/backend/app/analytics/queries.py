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
    # chatbot_* 테이블들은 모두 timestamptz → aware datetime 그대로 사용.
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
