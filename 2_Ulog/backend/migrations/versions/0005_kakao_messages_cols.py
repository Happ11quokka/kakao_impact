"""kakao_messages 0002 마이그레이션 누락분 보강.

migrate.py 가 Drizzle 흔적 감지 시 'stamp head' 로 처리해서
0002_kakao_provider_fields 가 실제로는 실행되지 않은 DB가 있음.
Drizzle 이 원래 만든 `kakao_messages` 에는 `provider_user_key` 등이 없음 → 챗봇 해시
백필 시 UndefinedColumnError 발생.

이 마이그레이션은 0002 의 ALTER/INDEX 구문을 IF NOT EXISTS 로 다시 실행 —
이미 컬럼이 있으면 no-op, 없으면 추가. 안전하게 멱등.

Note: revision id 는 alembic_version.version_num VARCHAR(32) 제약 때문에 짧게.

Revision ID: 0005_kakao_messages_cols
Revises: 0004_chatbot_table
Create Date: 2026-04-23
"""

from __future__ import annotations

from alembic import op

revision = "0005_kakao_messages_cols"
down_revision = "0004_chatbot_table"
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
    # no-op: 이 마이그레이션은 0002 의 누락분 보강 전용. downgrade 로 지우면
    # 0002 가 실제로 실행됐던 환경에서 오히려 데이터 손실. 건드리지 않음.
    pass
