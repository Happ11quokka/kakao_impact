from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Gem, Sticker
from app.deps import get_db, require_user

router = APIRouter()


@router.get("/inventory/gems")
async def list_gems(
    user_id: uuid.UUID = Depends(require_user),
    emotion: str | None = Query(default=None),
    tier: int | None = Query(default=None, ge=1, le=4),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    stmt = (
        select(
            Gem.id,
            Gem.emotion_code,
            Gem.tier,
            Gem.source,
            Gem.source_message_id,
            Gem.crafted_from,
            Gem.created_at,
        )
        .where(Gem.user_id == user_id)
        .where(Gem.consumed_at.is_(None))
        .order_by(desc(Gem.created_at))
    )
    if emotion:
        stmt = stmt.where(Gem.emotion_code == emotion)
    if tier is not None:
        stmt = stmt.where(Gem.tier == tier)

    rows = (await session.execute(stmt)).all()
    return {
        "gems": [
            {
                "id": str(r.id),
                "emotionCode": r.emotion_code,
                "tier": r.tier,
                "source": r.source,
                "sourceMessageId": str(r.source_message_id) if r.source_message_id else None,
                "craftedFrom": [str(x) for x in (r.crafted_from or [])],
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.get("/inventory/stickers")
async def list_stickers(
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    rows = (
        await session.execute(
            select(
                Sticker.id,
                Sticker.image_url,
                Sticker.polaroid_fallback,
                Sticker.placed_on_field,
                Sticker.source_message_id,
                Sticker.created_at,
            )
            .where(Sticker.user_id == user_id)
            .order_by(desc(Sticker.created_at))
        )
    ).all()
    return {
        "stickers": [
            {
                "id": str(r.id),
                "imageUrl": r.image_url,
                "polaroidFallback": r.polaroid_fallback,
                "placedOnField": r.placed_on_field,
                "sourceMessageId": str(r.source_message_id) if r.source_message_id else None,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }
