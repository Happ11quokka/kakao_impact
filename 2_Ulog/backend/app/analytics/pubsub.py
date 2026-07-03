"""Redis Pub/Sub — events ingest 를 운영자 대시보드 SSE 로 fan-out.

채널: analytics:events
- publish(): /events ingest 라우터에서 호출.
- subscribe(): /ops/analytics/sse 핸들러가 호출, 들어오는 메시지를 yield.

왜 Redis 인가:
- backend 가 무중단 배포(blue-green) 중일 때 두 인스턴스 동시 가동.
  in-memory pubsub 은 인스턴스 경계를 넘지 못함 → 한쪽 구독자가 다른쪽
  publisher 의 메시지를 못 받음.
- 향후 수평 스케일 시에도 그대로 안전.

장애 시 fail-safe: publish 실패는 silent 로깅 후 무시.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from app.logging import logger
from app.services.redis import get_app_redis

CHANNEL = "analytics:events"


async def publish(event_type: str, props: dict[str, Any] | None, user_id: str | None) -> None:
    redis = get_app_redis()
    payload = json.dumps(
        {"eventType": event_type, "userId": user_id, "props": props or {}}
    )
    try:
        await redis.publish(CHANNEL, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("analytics_publish_failed", error=str(exc))


async def subscribe() -> AsyncIterator[dict[str, Any]]:
    """대시보드 SSE 핸들러가 사용. yield 된 dict 를 그대로 JSON 직렬화하면 됨.

    호출 측에서 unsubscribe 해 줄 필요 없음 — generator 종료(클라이언트 끊김)
    시 PubSub 가 cleanup 됨.
    """
    redis = get_app_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(CHANNEL)
    try:
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=30.0
            )
            if message is None:
                # heartbeat 용 빈 메시지 — SSE 핸들러가 ping 처리.
                yield {"type": "ping"}
                continue
            raw = message.get("data")
            if not raw:
                continue
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="replace")
            try:
                yield json.loads(raw)
            except json.JSONDecodeError:
                # malformed payload — 무시.
                continue
            # 양보 (cooperative)
            await asyncio.sleep(0)
    finally:
        # redis-py 5.x: close() / aclose() 둘 다 coroutine. 5.0+ 권장은 aclose().
        # 어느 메서드가 있든 안전하게 호출.
        try:
            await pubsub.unsubscribe(CHANNEL)
        except Exception:  # noqa: BLE001
            pass
        try:
            closer = getattr(pubsub, "aclose", None) or getattr(pubsub, "close", None)
            if closer is not None:
                result = closer()
                if hasattr(result, "__await__"):
                    await result
        except Exception:  # noqa: BLE001
            pass
