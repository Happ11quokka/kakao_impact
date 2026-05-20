from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Event, Gem, KakaoMessage, User
from app.deps import get_db, require_admin_basic, require_ops
from app.services import sse_bus
from app.services.tickets import today_kst

router = APIRouter()


class ConfirmBody(BaseModel):
    userId: uuid.UUID
    emotionCode: str = Field(min_length=1)
    reactionText: str | None = Field(default=None, max_length=500)
    source: Literal["text", "photo"] | None = None


class RejectBody(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


@router.get("/ops/check")
async def ops_check(admin: dict[str, Any] = Depends(require_admin_basic)) -> dict[str, object]:
    # 프론트 RequireOpsUser 가드용 — Basic Auth 통과 시 OK.
    return {"ok": True, "username": admin["username"]}


@router.get("/ops/queue")
async def ops_queue(
    _: dict[str, Any] = Depends(require_ops),
    status_filter: Literal["pending", "proposed", "confirmed", "rejected"] = Query(
        default="pending", alias="status"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, Any]]]:
    rows = (
        await session.execute(
            select(
                KakaoMessage.id,
                KakaoMessage.user_id,
                KakaoMessage.provider_user_key,
                KakaoMessage.received_at,
                KakaoMessage.content_type,
                KakaoMessage.body,
                KakaoMessage.media_url,
                KakaoMessage.ai_suggestion,
                KakaoMessage.status,
            )
            .where(KakaoMessage.status == status_filter)
            .order_by(desc(KakaoMessage.received_at))
            .limit(limit)
        )
    ).all()
    return {
        "messages": [
            {
                "id": str(r.id),
                "userId": str(r.user_id) if r.user_id else None,
                "providerUserKey": r.provider_user_key,
                "receivedAt": r.received_at.isoformat() if r.received_at else None,
                "contentType": r.content_type,
                "body": r.body,
                "mediaUrl": r.media_url,
                "aiSuggestion": r.ai_suggestion,
                "status": r.status,
            }
            for r in rows
        ]
    }


@router.post("/ops/messages/{message_id}/confirm")
async def ops_confirm(
    message_id: uuid.UUID,
    body: ConfirmBody,
    auth: dict[str, Any] = Depends(require_ops),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    operator_id: uuid.UUID = auth["userId"]

    msg = (
        await session.execute(
            select(KakaoMessage)
            .where(KakaoMessage.id == message_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if msg is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"message": "MESSAGE_NOT_FOUND", "code": "MESSAGE_NOT_FOUND"}},
        )
    if msg.status in ("confirmed", "rejected"):
        raise HTTPException(
            status_code=409,
            detail={"error": {"message": "INVALID_STATUS", "code": "INVALID_STATUS"}},
        )

    user_exists = (
        await session.execute(select(User.id).where(User.id == body.userId).limit(1))
    ).scalar_one_or_none()
    if user_exists is None:
        raise HTTPException(
            status_code=400,
            detail={"error": {"message": "USER_NOT_FOUND", "code": "USER_NOT_FOUND"}},
        )

    inferred_source = body.source or (
        "photo" if msg.content_type in ("image", "mixed") else "text"
    )

    new_gem = Gem(
        user_id=body.userId,
        emotion_code=body.emotionCode,
        tier=1,
        source_message_id=msg.id,
        source=inferred_source,
    )
    session.add(new_gem)
    await session.flush()

    msg.status = "confirmed"
    msg.operator_id = operator_id
    msg.user_id = body.userId
    msg.finalized_at = datetime.utcnow()
    prev = msg.ai_suggestion or {}
    prev["final"] = {
        "emotionCode": body.emotionCode,
        "reactionText": body.reactionText,
    }
    msg.ai_suggestion = prev

    session.add(
        Event(
            user_id=body.userId,
            event_type="collect",
            props={
                "messageId": str(msg.id),
                "emotionCode": body.emotionCode,
                "source": inferred_source,
                "operatorId": str(operator_id),
                "tier": 1,
            },
        )
    )

    await session.commit()
    await session.refresh(new_gem)

    sse_bus.publish(
        body.userId,
        {
            "type": "gem_added",
            "gem": {
                "id": str(new_gem.id),
                "emotionCode": new_gem.emotion_code,
                "tier": new_gem.tier,
                "source": new_gem.source,
            },
        },
    )

    return {
        "ok": True,
        "gem": {
            "id": str(new_gem.id),
            "emotionCode": new_gem.emotion_code,
            "tier": new_gem.tier,
            "source": new_gem.source,
        },
    }


@router.post("/ops/messages/{message_id}/reject")
async def ops_reject(
    message_id: uuid.UUID,
    body: RejectBody,
    auth: dict[str, Any] = Depends(require_ops),
    session: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    operator_id: uuid.UUID = auth["userId"]
    msg = (
        await session.execute(
            select(KakaoMessage)
            .where(KakaoMessage.id == message_id)
            .where(KakaoMessage.status.in_(["pending", "proposed"]))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if msg is None:
        raise HTTPException(
            status_code=409,
            detail={"error": {"message": "INVALID_STATUS", "code": "INVALID_STATUS"}},
        )

    msg.status = "rejected"
    msg.operator_id = operator_id
    msg.finalized_at = datetime.utcnow()
    prev = msg.ai_suggestion or {}
    prev["reject"] = {"reason": body.reason}
    msg.ai_suggestion = prev

    await session.commit()
    return {"ok": True}


@router.get("/ops/dashboard-metrics")
async def ops_dashboard(
    _: dict[str, Any] = Depends(require_ops),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    today = today_kst()

    pending = (
        await session.execute(
            select(func.count())
            .select_from(KakaoMessage)
            .where(KakaoMessage.status == "pending")
        )
    ).scalar_one()

    confirmed_today = (
        await session.execute(
            select(func.count())
            .select_from(KakaoMessage)
            .where(KakaoMessage.status == "confirmed")
            .where(
                KakaoMessage.finalized_at
                >= func.timezone("Asia/Seoul", func.cast(today, KakaoMessage.finalized_at.type))
            )
        )
    ).scalar_one()

    active_gems = (
        await session.execute(
            select(func.count()).select_from(Gem).where(Gem.consumed_at.is_(None))
        )
    ).scalar_one()

    active_users_today = (
        await session.execute(
            select(func.count(func.distinct(Event.user_id)))
            .where(
                Event.occurred_at
                >= func.timezone("Asia/Seoul", func.cast(today, Event.occurred_at.type))
            )
        )
    ).scalar_one()

    return {
        "pendingCount": int(pending or 0),
        "confirmedTodayCount": int(confirmed_today or 0),
        "activeGems": int(active_gems or 0),
        "activeUsersToday": int(active_users_today or 0),
        "dateKst": today.isoformat(),
    }
