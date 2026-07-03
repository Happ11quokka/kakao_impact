from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Recipe
from app.deps import get_db, require_user
from app.services.crafting import CraftingError, combine_gems

router = APIRouter()


class CombineBody(BaseModel):
    ingredientIds: list[uuid.UUID] = Field(min_length=2, max_length=2)


@router.get("/crafting/recipes")
async def list_recipes(
    _: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, list[dict[str, object]]]:
    rows = (
        await session.execute(
            select(
                Recipe.id,
                Recipe.slug,
                Recipe.name_ko,
                Recipe.ingredient_codes,
                Recipe.result_tier,
                Recipe.unlocked_by,
            )
        )
    ).all()
    return {
        "recipes": [
            {
                "id": str(r.id),
                "slug": r.slug,
                "nameKo": r.name_ko,
                "ingredientCodes": list(r.ingredient_codes or []),
                "resultTier": r.result_tier,
                "unlockedBy": r.unlocked_by,
            }
            for r in rows
        ]
    }


@router.post("/crafting/combine")
async def combine(
    body: CombineBody,
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    try:
        result = await combine_gems(session, user_id, list(body.ingredientIds))
    except CraftingError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"error": {"message": exc.code, "code": exc.code}},
        )

    return {
        "gem": {
            "id": str(result.gem_id),
            "emotionCode": result.emotion_code,
            "tier": result.tier,
            "craftedFrom": [str(x) for x in result.crafted_from],
            "createdAt": result.created_at.isoformat(),
        },
        "recipeSlug": result.recipe_slug,
        "kind": result.kind,
    }
