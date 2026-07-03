from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CraftingEvent, Event, Gem, Recipe

MAX_TIER = 4


class CraftingError(Exception):
    def __init__(self, code: str, status: int = 400) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


@dataclass
class CraftingResult:
    gem_id: uuid.UUID
    emotion_code: str
    tier: int
    crafted_from: list[uuid.UUID]
    created_at: datetime
    recipe_slug: str | None
    kind: Literal["homogeneous", "recipe"]


async def combine_gems(
    session: AsyncSession,
    user_id: uuid.UUID,
    ingredient_ids: list[uuid.UUID],
) -> CraftingResult:
    if len(ingredient_ids) != 2:
        raise CraftingError("INGREDIENTS_LENGTH")
    a, b = ingredient_ids
    if a == b:
        raise CraftingError("INGREDIENTS_DUPLICATED")

    rows = (
        await session.execute(
            select(Gem)
            .where(Gem.id.in_(ingredient_ids))
            .where(Gem.user_id == user_id)
            .where(Gem.consumed_at.is_(None))
            .with_for_update()
        )
    ).scalars().all()

    if len(rows) != 2:
        raise CraftingError("INGREDIENTS_NOT_FOUND")

    sorted_rows = sorted(rows, key=lambda g: g.emotion_code)
    p, q = sorted_rows[0], sorted_rows[1]

    recipe_slug: str | None = None
    kind: Literal["homogeneous", "recipe"]
    if p.emotion_code == q.emotion_code:
        if p.tier != q.tier:
            raise CraftingError("TIERS_MISMATCH")
        if p.tier >= MAX_TIER:
            raise CraftingError("TIER_MAX")
        result_tier = p.tier + 1
        result_emotion = p.emotion_code
        kind = "homogeneous"
    else:
        match = (
            await session.execute(
                select(Recipe.slug, Recipe.result_tier)
                .where(Recipe.ingredient_codes.contains([p.emotion_code, q.emotion_code]))
                .where(func.array_length(Recipe.ingredient_codes, 1) == 2)
                .limit(1)
            )
        ).first()
        if match is None:
            raise CraftingError("RECIPE_NOT_FOUND")
        if p.tier != q.tier:
            raise CraftingError("TIERS_MISMATCH")
        recipe_slug = match.slug
        result_tier = int(match.result_tier)
        result_emotion = p.emotion_code
        kind = "recipe"

    await session.execute(
        update(Gem)
        .where(Gem.id.in_(ingredient_ids))
        .values(consumed_at=func.now())
    )

    new_gem = Gem(
        user_id=user_id,
        emotion_code=result_emotion,
        tier=result_tier,
        crafted_from=list(ingredient_ids),
    )
    session.add(new_gem)
    await session.flush()

    session.add(
        CraftingEvent(
            user_id=user_id,
            ingredient_ids=list(ingredient_ids),
            result_id=new_gem.id,
            recipe_slug=recipe_slug,
        )
    )
    session.add(
        Event(
            user_id=user_id,
            event_type="craft",
            props={
                "kind": kind,
                "resultTier": result_tier,
                "resultEmotion": result_emotion,
                "recipeSlug": recipe_slug,
                "ingredientIds": [str(x) for x in ingredient_ids],
            },
        )
    )
    await session.commit()
    await session.refresh(new_gem)

    return CraftingResult(
        gem_id=new_gem.id,
        emotion_code=new_gem.emotion_code,
        tier=new_gem.tier,
        crafted_from=list(ingredient_ids),
        created_at=new_gem.created_at,
        recipe_slug=recipe_slug,
        kind=kind,
    )
