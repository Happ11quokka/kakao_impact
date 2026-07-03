from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.deps import get_db, require_user
from app.services.tickets import get_today_tickets
from app.services.users import normalize_provider_user_key, set_provider_user_key

router = APIRouter()


@router.get("/me")
async def me(
    request: Request,
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    row = (
        await session.execute(
            select(
                User.id,
                User.kakao_id,
                User.nickname,
                User.profile_url,
            ).where(User.id == user_id)
        )
    ).first()

    if row is None:
        request.session.clear()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"message": "USER_GONE", "code": "USER_GONE"}},
        )

    tickets = await get_today_tickets(session, user_id)
    return {
        "user": {
            "id": str(row.id),
            "kakaoId": row.kakao_id,
            "nickname": row.nickname,
            "profileUrl": row.profile_url,
        },
        "tickets": tickets,
    }


class ProviderUserKeyBody(BaseModel):
    providerUserKey: str = Field(min_length=32, max_length=128)


@router.post("/me/provider-user-key")
async def attach_provider_user_key(
    body: ProviderUserKeyBody,
    user_id: uuid.UUID = Depends(require_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    normalized = normalize_provider_user_key(body.providerUserKey)
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": {
                    "message": "INVALID_PROVIDER_USER_KEY",
                    "code": "INVALID_PROVIDER_USER_KEY",
                }
            },
        )
    result = await set_provider_user_key(
        session, user_id, normalized, source="post_login_api"
    )
    return {"ok": True, **result}
