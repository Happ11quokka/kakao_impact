"""analytics: anon_user_links + events(user_id, occurred_at) 인덱스.

행동 분석 시스템(`/ops/analytics`)을 위한 스키마 보강.

- `anon_user_links`: 로그인 전 익명 sessionStorage anon_id ↔ user_id 매핑.
  로그인 콜백 시 `POST /auth/link-anon` 호출로 채워짐. 분석 쿼리에서
  LEFT JOIN 으로 익명 이벤트를 사용자에 묶을 때 사용.
- 신규 인덱스: 사용자별 이벤트 타임라인 쿼리 가속.
"""

from __future__ import annotations

from alembic import op

revision = "0010_analytics"
down_revision = "0009_chatbot_question_columns"
branch_labels = None
depends_on = None


UPGRADE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS "anon_user_links" (
        "anon_id" text PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "linked_at" timestamptz NOT NULL DEFAULT now()
    )
    """,
    'CREATE INDEX IF NOT EXISTS "anon_user_links_user_id_idx" ON "anon_user_links" ("user_id")',
    'CREATE INDEX IF NOT EXISTS "events_user_id_occurred_at_idx" ON "events" ("user_id", "occurred_at")',
]


DOWNGRADE_STATEMENTS = [
    'DROP INDEX IF EXISTS "events_user_id_occurred_at_idx"',
    'DROP INDEX IF EXISTS "anon_user_links_user_id_idx"',
    'DROP TABLE IF EXISTS "anon_user_links"',
]


def upgrade() -> None:
    for stmt in UPGRADE_STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    for stmt in DOWNGRADE_STATEMENTS:
        op.execute(stmt)
