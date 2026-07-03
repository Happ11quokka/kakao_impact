from __future__ import annotations

from redis.asyncio import Redis

from app.config import settings

_app_redis: Redis | None = None


def get_app_redis() -> Redis:
    global _app_redis
    if _app_redis is None:
        _app_redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _app_redis


async def close_redis() -> None:
    global _app_redis
    if _app_redis is not None:
        await _app_redis.close()
        _app_redis = None
