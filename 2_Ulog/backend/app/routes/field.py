from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Gem
from app.deps import get_db, require_user

router = APIRouter()


def _hash_to_unit(gem_id: str, salt: int) -> float:
    h = salt
    for ch in gem_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return (h & 0xFFFF) / 0xFFFF


@router.get("/field/today")
async def field_today(
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    rows = (
        await session.execute(
            select(
                Gem.id,
                Gem.emotion_code,
                Gem.tier,
                Gem.source,
                Gem.created_at,
            )
            .where(Gem.user_id == user_id)
            .where(Gem.consumed_at.is_(None))
            .where(
                Gem.created_at
                >= text("(now() AT TIME ZONE 'Asia/Seoul')::date AT TIME ZONE 'Asia/Seoul'")
            )
        )
    ).all()

    drops = []
    for r in rows:
        gem_id = str(r.id)
        drops.append(
            {
                "id": gem_id,
                "emotionCode": r.emotion_code,
                "tier": r.tier,
                "source": r.source,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
                "position": {
                    "x": 0.08 + _hash_to_unit(gem_id, 7) * 0.84,
                    "y": 0.25 + _hash_to_unit(gem_id, 131) * 0.55,
                },
            }
        )
    return {"drops": drops}
