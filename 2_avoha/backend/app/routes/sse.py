from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.deps import require_user
from app.services import sse_bus

HEARTBEAT_S = 25

router = APIRouter()


@router.get("/sse/inventory")
async def inventory_stream(
    request: Request,
    user_id: uuid.UUID = Depends(require_user),
) -> EventSourceResponse:
    queue = sse_bus.subscribe(user_id)

    async def event_gen() -> AsyncIterator[dict[str, str]]:
        try:
            # hello event — 연결 직후 확인용
            yield {"data": json.dumps({"type": "ping"})}

            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_S)
                except asyncio.TimeoutError:
                    # sse-starlette 가 콜론 주석으로 heartbeat 보내도록 ping_message 를 yield
                    yield {"event": "ping", "data": ""}
                    continue
                yield {"data": json.dumps(ev)}
        finally:
            sse_bus.unsubscribe(user_id, queue)

    return EventSourceResponse(event_gen(), ping=HEARTBEAT_S)
