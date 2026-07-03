from __future__ import annotations

import httpx

from app.config import settings


async def notify_ops(message: str) -> None:
    """Discord 운영 웹훅. 미설정이면 noop. 실패해도 조용히 흘림."""
    if not settings.DISCORD_OPS_WEBHOOK:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                settings.DISCORD_OPS_WEBHOOK,
                json={"content": message[:1900]},
            )
    except Exception:
        pass
