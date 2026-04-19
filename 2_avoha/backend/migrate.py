"""Alembic stamp-or-upgrade 진입점.

Drizzle 이 테이블을 이미 만들어둔 DB 에 alembic_version 을 어긋나지 않게 붙이기 위해:
  1) alembic_version 테이블이 없지만 Drizzle 이 남긴 '__drizzle_migrations__' 스키마/
     users 테이블이 있으면 alembic head 로 stamp (마이그 재실행 금지).
  2) 그 외에는 `alembic upgrade head` 수행.
     - 새 DB: 모든 리비전 실행
     - 이미 head 라면: no-op
"""

from __future__ import annotations

import asyncio
import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.db.base import _normalize_db_url
from app.logging import configure_logging, logger


async def _is_drizzle_managed(dsn: str) -> bool:
    engine = create_async_engine(dsn, pool_pre_ping=False)
    try:
        async with engine.connect() as conn:
            alembic_exists = await conn.scalar(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_name='alembic_version'"
                )
            )
            if alembic_exists:
                return False
            drizzle_schema = await conn.scalar(
                text(
                    "SELECT 1 FROM information_schema.schemata "
                    "WHERE schema_name='drizzle'"
                )
            )
            if drizzle_schema:
                return True
            users_table = await conn.scalar(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_name='users'"
                )
            )
            return bool(users_table)
    finally:
        await engine.dispose()


def _alembic_config() -> Config:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", _normalize_db_url(settings.DATABASE_URL))
    return cfg


def main() -> None:
    configure_logging()
    dsn = _normalize_db_url(settings.DATABASE_URL)

    needs_stamp = asyncio.run(_is_drizzle_managed(dsn))
    cfg = _alembic_config()

    if needs_stamp:
        logger.info("drizzle-managed DB 감지 — alembic head 로 stamp")
        command.stamp(cfg, "head")
    else:
        logger.info("alembic upgrade head 실행")
        command.upgrade(cfg, "head")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"migrate failed: {exc}", file=sys.stderr)
        raise
