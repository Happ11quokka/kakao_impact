from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Event
from app.deps import get_db, require_user

router = APIRouter()


class EventItem(BaseModel):
    eventType: str = Field(min_length=1, max_length=64)
    props: dict[str, Any] | None = None
    occurredAt: datetime | None = None


class BatchBody(BaseModel):
    events: list[EventItem] = Field(min_length=1, max_length=100)


@router.post("/events")
async def ingest_events(
    body: BatchBody,
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    for item in body.events:
        event = Event(
            user_id=user_id,
            event_type=item.eventType,
            props=item.props,
        )
        if item.occurredAt is not None:
            event.occurred_at = item.occurredAt
        session.add(event)
    await session.commit()
    return {"ok": True, "count": len(body.events)}
