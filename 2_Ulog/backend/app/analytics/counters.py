"""Redis 카운터/HyperLogLog/SET 헬퍼.

대시보드 KPI 카드를 Postgres 집계 없이 Redis 에서 즉시 응답하기 위해,
/events ingest 시 다음 키들을 동시에 업데이트한다.

키 컨벤션:
- analytics:daily:events:{YYYY-MM-DD}       — 일 총 이벤트 INCR
- analytics:daily:type:{type}:{YYYY-MM-DD}  — 이벤트 타입별 INCR
- analytics:daily:uniq:{YYYY-MM-DD}         — HyperLogLog (PFADD) — DAU
- analytics:active:sessions                 — SET (SADD) + 슬라이딩 30분 TTL — 실시간 동시접속
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from app.logging import logger
from app.services.redis import get_app_redis

DAY_TTL_SECONDS = 35 * 24 * 60 * 60  # 35일 보관
ACTIVE_SESSION_TTL_SECONDS = 30 * 60  # 30분


def _today_key() -> str:
    return date.today().isoformat()


async def bump_event_counters(event_type: str) -> None:
    """일 총 + 타입별 카운터 증가. 실패는 silent."""
    await bump_event_counters_batch([event_type])


async def bump_event_counters_batch(event_types: list[str]) -> None:
    """배치 buper — 한 ingest 콜의 여러 이벤트를 단일 round-trip 으로.

    100 이벤트 배치 시 100x → 1x Redis round-trip 으로 감소.
    """
    if not event_types:
        return
    redis = get_app_redis()
    day = _today_key()
    try:
        pipe = redis.pipeline()
        total_key = f"analytics:daily:events:{day}"
        pipe.incrby(total_key, len(event_types))
        pipe.expire(total_key, DAY_TTL_SECONDS)
        # 타입별로 그룹지어 incrby 1회씩.
        type_counts: dict[str, int] = {}
        for t in event_types:
            type_counts[t] = type_counts.get(t, 0) + 1
        for t, n in type_counts.items():
            type_key = f"analytics:daily:type:{t}:{day}"
            pipe.incrby(type_key, n)
            pipe.expire(type_key, DAY_TTL_SECONDS)
        await pipe.execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("redis_counter_failed", error=str(exc), n=len(event_types))


async def add_unique_user(identity: str | uuid.UUID | None) -> None:
    """DAU 측정용 HyperLogLog. identity 는 user_id 또는 anon_id."""
    if not identity:
        return
    redis = get_app_redis()
    day = _today_key()
    try:
        await redis.pfadd(f"analytics:daily:uniq:{day}", str(identity))
        await redis.expire(f"analytics:daily:uniq:{day}", DAY_TTL_SECONDS)
    except Exception as exc:  # noqa: BLE001
        logger.warning("redis_uniq_failed", error=str(exc))


async def bump_active_session(session_id: str | None) -> None:
    """현재 활성 세션 SET 에 추가. 30분 TTL 슬라이딩."""
    if not session_id:
        return
    redis = get_app_redis()
    try:
        await redis.sadd("analytics:active:sessions", session_id)
        await redis.expire("analytics:active:sessions", ACTIVE_SESSION_TTL_SECONDS)
    except Exception as exc:  # noqa: BLE001
        logger.warning("redis_session_failed", error=str(exc))


async def read_kpi_summary() -> dict[str, int]:
    """대시보드 KPI 카드용 — Redis 한 번에 읽기."""
    redis = get_app_redis()
    day = _today_key()
    try:
        pipe = redis.pipeline()
        pipe.get(f"analytics:daily:events:{day}")
        pipe.get(f"analytics:daily:type:chatbot.question.sent:{day}")
        pipe.get(f"analytics:daily:type:error.client:{day}")
        pipe.get(f"analytics:daily:type:error.api:{day}")
        pipe.pfcount(f"analytics:daily:uniq:{day}")
        pipe.scard("analytics:active:sessions")
        raw = await pipe.execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("redis_kpi_failed", error=str(exc))
        return {
            "totalEvents": 0,
            "totalQuestions": 0,
            "totalErrors": 0,
            "dau": 0,
            "activeSessions": 0,
        }

    def _i(v: object) -> int:
        if v is None:
            return 0
        try:
            return int(v)
        except (TypeError, ValueError):
            return 0

    total = _i(raw[0])
    questions = _i(raw[1])
    errors_client = _i(raw[2])
    errors_api = _i(raw[3])
    dau = _i(raw[4])
    active = _i(raw[5])

    return {
        "totalEvents": total,
        "totalQuestions": questions,
        "totalErrors": errors_client + errors_api,
        "dau": dau,
        "activeSessions": active,
        "date": day,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


# ─── DAU 변화 곡선 + WAU + MAU ───
# `analytics:daily:uniq:{YYYY-MM-DD}` HyperLogLog 가 35일 보관되므로
# 일별 PFCOUNT 호출로 DAU 곡선, 다중 키 PFCOUNT 로 trailing WAU/MAU 까지
# 모두 Redis 단일 pipeline 으로 처리.


def _uniq_key(d: date) -> str:
    return f"analytics:daily:uniq:{d.isoformat()}"


async def read_active_users_history(days: int = 30) -> dict[str, object]:
    """최근 N일 DAU 곡선 + 오늘 기준 trailing 7일 WAU / 30일 MAU.

    HyperLogLog 의 PFCOUNT 는 multiple keys 를 받으면 union cardinality 를
    estimate 하므로 PFMERGE 없이도 trailing 합산 가능. 존재하지 않는 키는
    빈 set 으로 취급되어 안전.
    """
    days = max(1, min(days, 35))
    redis = get_app_redis()
    today = date.today()
    day_keys = [_uniq_key(today - timedelta(days=i)) for i in range(days - 1, -1, -1)]
    wau_keys = [_uniq_key(today - timedelta(days=i)) for i in range(7)]
    mau_keys = [_uniq_key(today - timedelta(days=i)) for i in range(30)]

    try:
        pipe = redis.pipeline()
        for k in day_keys:
            pipe.pfcount(k)
        pipe.pfcount(*wau_keys)
        pipe.pfcount(*mau_keys)
        raw = await pipe.execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("redis_active_users_failed", error=str(exc))
        return {
            "daily": [],
            "wau": 0,
            "mau": 0,
            "days": days,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

    def _i(v: object) -> int:
        if v is None:
            return 0
        try:
            return int(v)
        except (TypeError, ValueError):
            return 0

    daily_counts = [_i(v) for v in raw[:days]]
    wau = _i(raw[days])
    mau = _i(raw[days + 1])

    daily = [
        {"date": (today - timedelta(days=days - 1 - i)).isoformat(), "dau": daily_counts[i]}
        for i in range(days)
    ]

    return {
        "daily": daily,
        "wau": wau,
        "mau": mau,
        "days": days,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
