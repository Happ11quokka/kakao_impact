"""Seed entry — Alembic upgrade 이후 실행. idempotent (on_conflict_do_update)."""

from __future__ import annotations

import asyncio

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.base import SessionLocal
from app.db.models import Emotion, Recipe
from app.logging import configure_logging, logger
from app.seeds.emotions import EMOTIONS_SEED
from app.seeds.recipes import RECIPES_SEED


async def seed_emotions() -> None:
    async with SessionLocal() as session:
        stmt = pg_insert(Emotion).values(EMOTIONS_SEED)
        stmt = stmt.on_conflict_do_update(
            index_elements=["code"],
            set_={
                "name_ko": stmt.excluded.name_ko,
                "category": stmt.excluded.category,
                "gem_name": stmt.excluded.gem_name,
                "hex_color": stmt.excluded.hex_color,
                "trigger_keywords": stmt.excluded.trigger_keywords,
            },
        )
        await session.execute(stmt)
        await session.commit()
    logger.info("emotions seeded", count=len(EMOTIONS_SEED))


async def seed_recipes() -> None:
    if not RECIPES_SEED:
        logger.info("recipes seed skipped", reason="PRD v1.1 재설계 대기")
        return
    async with SessionLocal() as session:
        stmt = pg_insert(Recipe).values(RECIPES_SEED)
        stmt = stmt.on_conflict_do_update(
            index_elements=["slug"],
            set_={
                "name_ko": stmt.excluded.name_ko,
                "ingredient_codes": stmt.excluded.ingredient_codes,
                "result_tier": stmt.excluded.result_tier,
                "unlocked_by": stmt.excluded.unlocked_by,
            },
        )
        await session.execute(stmt)
        await session.commit()
    logger.info("recipes seeded", count=len(RECIPES_SEED))


async def main() -> None:
    configure_logging()
    await seed_emotions()
    await seed_recipes()


if __name__ == "__main__":
    asyncio.run(main())
