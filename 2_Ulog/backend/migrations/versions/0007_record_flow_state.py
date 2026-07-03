"""record flow state for web confirmation and reclassification.

Revision ID: 0007_record_flow_state
Revises: 0006_chatbot_full_log
Create Date: 2026-05-19
"""

from __future__ import annotations

from alembic import op

revision = "0007_record_flow_state"
down_revision = "0006_chatbot_full_log"
branch_labels = None
depends_on = None


STATEMENTS = [
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "entry_mode" text NOT NULL DEFAULT \'emotion_classification\'',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "classification_status" text NOT NULL DEFAULT \'user_confirmed\'',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "ai_emotion_code" text',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "confirmed_emotion_code" text',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamptz',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "web_reviewed_at" timestamptz',
    'ALTER TABLE "chatbot" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()',
    """
    UPDATE "chatbot"
    SET
      "entry_mode" = CASE WHEN "gem" = '일상기록' THEN 'plain_record' ELSE 'emotion_classification' END,
      "classification_status" = CASE WHEN "gem" = '일상기록' THEN 'needs_confirmation' ELSE 'user_confirmed' END,
      "updated_at" = COALESCE("updated_at", now())
    """,
    'CREATE INDEX IF NOT EXISTS "chatbot_user_status_created_idx" ON "chatbot" ("user_id", "classification_status", "created_at")',
    'ALTER TABLE "gems" ADD COLUMN IF NOT EXISTS "source_chatbot_id" bigint',
    'CREATE INDEX IF NOT EXISTS "gems_source_chatbot_id_idx" ON "gems" ("source_chatbot_id")',
]


def upgrade() -> None:
    for stmt in STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "gems_source_chatbot_id_idx"')
    op.execute('ALTER TABLE "gems" DROP COLUMN IF EXISTS "source_chatbot_id"')
    op.execute('DROP INDEX IF EXISTS "chatbot_user_status_created_idx"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "updated_at"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "web_reviewed_at"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "confirmed_at"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "confirmed_emotion_code"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "ai_emotion_code"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "classification_status"')
    op.execute('ALTER TABLE "chatbot" DROP COLUMN IF EXISTS "entry_mode"')
