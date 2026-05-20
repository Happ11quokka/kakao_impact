"""사용자/익명별 events ingest rate limit (분당 N개 cap).

자동 클릭/스크롤 트래킹이 폭주할 때 백엔드·Postgres 보호.
"""

from __future__ import annotations

import time

from app.logging import logger
from app.services.redis import get_app_redis

LIMIT_PER_MINUTE = 300
WINDOW_SECONDS = 60


async def check_and_increment(identity: str) -> tuple[bool, int]:
    """현재 1분 윈도우 카운트 증가 후 (허용여부, 현재값) 반환.

    Redis 장애 시엔 허용으로 fail-open (분석이 앱을 죽이면 안 됨).
    """
    redis = get_app_redis()
    bucket = int(time.time() // WINDOW_SECONDS)
    key = f"RATELIMIT:events:{identity}:{bucket}"
    try:
        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, WINDOW_SECONDS * 2)
        result = await pipe.execute()
        count = int(result[0])
    except Exception as exc:  # noqa: BLE001
        logger.warning("rate_limit_redis_failed", error=str(exc))
        return True, 0
    return count <= LIMIT_PER_MINUTE, count
