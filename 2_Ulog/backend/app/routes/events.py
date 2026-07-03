from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics import pubsub as analytics_pubsub
from app.analytics.counters import (
    add_unique_user,
    bump_active_session,
    bump_event_counters_batch,
)
from app.analytics.rate_limit import LIMIT_PER_MINUTE, check_and_increment
from app.db.models import Event
from app.deps import get_db, optional_user

router = APIRouter()


class EventItem(BaseModel):
    eventType: str = Field(min_length=1, max_length=64)
    props: dict[str, Any] | None = None
    occurredAt: datetime | None = None


class BatchBody(BaseModel):
    events: list[EventItem] = Field(min_length=1, max_length=100)
    anonId: str | None = Field(default=None, max_length=64)


@router.post("/events")
async def ingest_events(
    body: BatchBody,
    request: Request,
    user_id: uuid.UUID | None = Depends(optional_user),
    x_anon_id: str | None = Header(default=None, alias="X-Anon-Id"),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    # 익명/유저 어느 쪽이든 받음. user_id 가 있으면 events.user_id 에 채우고,
    # 익명이면 props.anonId 로 식별 키만 남겨 두었다가 나중에 anon_user_links
    # 로 stitching.
    anon_id = (x_anon_id or body.anonId or "").strip() or None
    if not user_id and not anon_id:
        # 식별자가 전혀 없으면 무시 (악성/스팸 차단). 200 으로 응답해서 클라가
        # 재시도/에러 핸들링에 들어가지 않게.
        return {"ok": True, "count": 0, "skipped": "no_identity"}

    identity = str(user_id) if user_id else f"anon:{anon_id}"
    allowed, count = await check_and_increment(identity)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "message": "RATE_LIMITED",
                    "code": "RATE_LIMITED",
                    "limit": LIMIT_PER_MINUTE,
                    "currentMinuteCount": count,
                }
            },
        )

    session_id_for_active: str | None = None
    publish_queue: list[tuple[str, dict[str, Any]]] = []
    event_types: list[str] = []
    for item in body.events:
        merged_props: dict[str, Any] = dict(item.props or {})
        if anon_id and "anonId" not in merged_props:
            merged_props["anonId"] = anon_id
        # 첫 이벤트에서 sessionId 잡아두면 충분.
        sess = merged_props.get("sessionId")
        if isinstance(sess, str) and not session_id_for_active:
            session_id_for_active = sess
        event = Event(
            user_id=user_id,
            event_type=item.eventType,
            props=merged_props or None,
        )
        if item.occurredAt is not None:
            # events.occurred_at 컬럼은 timezone-naive TIMESTAMP.
            # FE 가 ISO Z 로 보낸 aware datetime 을 UTC 기준 naive 로 정규화.
            occurred = item.occurredAt
            if occurred.tzinfo is not None:
                occurred = occurred.astimezone(timezone.utc).replace(tzinfo=None)
            event.occurred_at = occurred
        session.add(event)
        event_types.append(item.eventType)
        publish_queue.append((item.eventType, merged_props))

    # Redis 1 round-trip 으로 배치 카운터.
    await bump_event_counters_batch(event_types)
    await add_unique_user(user_id or anon_id)
    await bump_active_session(session_id_for_active)
    await session.commit()

    # Pub/Sub: 대시보드 실시간 스트림 — commit 성공 후에만 publish.
    user_id_str = str(user_id) if user_id else None
    for ev_type, ev_props in publish_queue:
        await analytics_pubsub.publish(ev_type, ev_props, user_id_str)

    return {"ok": True, "count": len(body.events)}
