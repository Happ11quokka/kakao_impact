from __future__ import annotations

import re
import sys
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

HEX64 = re.compile(r"^[0-9a-f]{64}$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: Literal["development", "test", "production"] = "development"
    PORT: int = 8000

    DATABASE_URL: str
    REDIS_URL: str

    KAKAO_REST_API_KEY: str
    KAKAO_CLIENT_SECRET: str
    KAKAO_REDIRECT_URI: str

    SESSION_SECRET: str
    FRONTEND_URL: str = "http://localhost:5173"

    KAKAO_WEBHOOK_SECRET: str | None = None
    OPS_ALLOWED_KAKAO_IDS: str = ""
    # 분석 대시보드(/ops/analytics, /ops/check) 전용 Basic Auth 자격증명.
    # production 에서는 반드시 Railway env 로 덮어쓸 것. default admin/admin 은 데모용.
    OPS_BASIC_USERNAME: str = "admin"
    OPS_BASIC_PASSWORD: str = "admin"
    DISCORD_OPS_WEBHOOK: str | None = None
    SENTRY_DSN: str | None = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1
    # 데모 전용: 기록이 없는 계정(신규 가입자 포함)에 6/1~6/13 고정 감정기록을 보여줌.
    # production 데모 기간에만 true 로 켜고, 끝나면 끈다(미설정=꺼짐).
    DEMO_RECORDS_FALLBACK: bool = False

    @field_validator("SESSION_SECRET")
    @classmethod
    def _session_secret_hex64(cls, v: str) -> str:
        if not HEX64.match(v):
            raise ValueError("must be 64 hex chars (32 bytes)")
        return v

    @property
    def is_prod(self) -> bool:
        return self.ENV == "production"

    @property
    def ops_allowed_kakao_ids(self) -> set[int]:
        return {
            int(x)
            for x in (s.strip() for s in self.OPS_ALLOWED_KAKAO_IDS.split(","))
            if x and x.lstrip("-").isdigit()
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    try:
        return Settings()  # type: ignore[call-arg]
    except Exception as exc:
        print(f"환경변수 검증 실패: {exc}", file=sys.stderr)
        raise


settings = get_settings()
