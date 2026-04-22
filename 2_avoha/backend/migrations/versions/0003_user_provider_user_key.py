"""users.provider_user_key — 오픈빌더 챗봇 해시 ↔ 앱 유저 연결

Revision ID: 0003_user_provider_user_key
Revises: 0002_kakao_provider_fields
Create Date: 2026-04-22
"""

from __future__ import annotations

from alembic import op

revision = "0003_user_provider_user_key"
down_revision = "0002_kakao_provider_fields"
branch_labels = None
depends_on = None


STATEMENTS = [
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "provider_user_key" text',
    'CREATE UNIQUE INDEX IF NOT EXISTS "users_provider_user_key_uniq" '
    'ON "users" ("provider_user_key") WHERE "provider_user_key" IS NOT NULL',
]


def upgrade() -> None:
    for stmt in STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "users_provider_user_key_uniq"')
    op.execute('ALTER TABLE "users" DROP COLUMN IF EXISTS "provider_user_key"')
