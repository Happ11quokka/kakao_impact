"""kakao_messages provider fields (Drizzle 0001_kakao_messages_provider_fields 흡수)

Revision ID: 0002_kakao_provider_fields
Revises: 0001_initial
Create Date: 2026-04-19
"""

from __future__ import annotations

from alembic import op

revision = "0002_kakao_provider_fields"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


STATEMENTS = [
    'ALTER TABLE "kakao_messages" ADD COLUMN IF NOT EXISTS "provider_message_id" text',
    'ALTER TABLE "kakao_messages" ADD COLUMN IF NOT EXISTS "provider_user_key" text',
    'ALTER TABLE "kakao_messages" ADD COLUMN IF NOT EXISTS "raw" jsonb',
    """
    DO $$ BEGIN
      ALTER TABLE "kakao_messages" ADD CONSTRAINT "kakao_messages_provider_message_id_unique" UNIQUE("provider_message_id");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
    """,
    'CREATE INDEX IF NOT EXISTS "kakao_messages_status_received_at_idx" ON "kakao_messages" USING btree ("status","received_at")',
    'CREATE INDEX IF NOT EXISTS "kakao_messages_provider_user_key_idx" ON "kakao_messages" USING btree ("provider_user_key")',
]


def upgrade() -> None:
    for stmt in STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "kakao_messages_provider_user_key_idx"')
    op.execute('DROP INDEX IF EXISTS "kakao_messages_status_received_at_idx"')
    op.execute(
        'ALTER TABLE "kakao_messages" DROP CONSTRAINT IF EXISTS "kakao_messages_provider_message_id_unique"'
    )
    op.execute('ALTER TABLE "kakao_messages" DROP COLUMN IF EXISTS "raw"')
    op.execute('ALTER TABLE "kakao_messages" DROP COLUMN IF EXISTS "provider_user_key"')
    op.execute('ALTER TABLE "kakao_messages" DROP COLUMN IF EXISTS "provider_message_id"')
