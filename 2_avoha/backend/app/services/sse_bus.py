from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from typing import Any

_subscribers: dict[uuid.UUID, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)


def subscribe(user_id: uuid.UUID) -> asyncio.Queue[dict[str, Any]]:
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
    _subscribers[user_id].add(q)
    return q


def unsubscribe(user_id: uuid.UUID, q: asyncio.Queue[dict[str, Any]]) -> None:
    subs = _subscribers.get(user_id)
    if not subs:
        return
    subs.discard(q)
    if not subs:
        _subscribers.pop(user_id, None)


def publish(user_id: uuid.UUID, event: dict[str, Any]) -> None:
    subs = _subscribers.get(user_id)
    if not subs:
        return
    for q in list(subs):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            # 구독자 pick-up 이 느린 경우 이벤트 드롭 (inventory 는 최신 상태 pull 로 복구 가능)
            pass


def subscriber_count(user_id: uuid.UUID) -> int:
    return len(_subscribers.get(user_id, ()))
