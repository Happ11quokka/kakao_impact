from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Query, Request, status
from sse_starlette.sse import EventSourceResponse

from app.services import sse_bus
from app.services.tokens import decode_token

HEARTBEAT_S = 25

router = APIRouter()


@router.get("/sse/inventory")
async def inventory_stream(
    request: Request,
    token: str | None = Query(default=None),
) -> EventSourceResponse:
    if token:
        payload = decode_token(token)
        try:
            user_id = uuid.UUID(str(payload["userId"])) if payload else None
        except (KeyError, ValueError):
            user_id = None
    else:
        raw_user_id = request.session.get("userId")
        try:
            user_id = uuid.UUID(str(raw_user_id)) if raw_user_id else None
        except ValueError:
            user_id = None
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "UNAUTHENTICATED", "code": "UNAUTHENTICATED"}},
        )
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
