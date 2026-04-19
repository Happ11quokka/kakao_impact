from __future__ import annotations

from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


async def upsert_kakao_user(session: AsyncSession, kakao_user: dict[str, Any]) -> User:
    kakao_id = int(kakao_user["id"])
    profile = (kakao_user.get("kakao_account") or {}).get("profile") or {}
    nickname = profile.get("nickname") or "아보하 친구"
    is_default_image = bool(profile.get("is_default_image"))
    profile_url = None if is_default_image else profile.get("profile_image_url")

    stmt = (
        pg_insert(User)
        .values(
            kakao_id=kakao_id,
            nickname=nickname,
            profile_url=profile_url,
            consent_version="v2026.04",
        )
        .on_conflict_do_update(
            index_elements=["kakao_id"],
            set_={"nickname": nickname, "profile_url": profile_url},
        )
        .returning(User)
    )
    res = await session.execute(stmt)
    user = res.scalar_one()
    await session.commit()
    return user
