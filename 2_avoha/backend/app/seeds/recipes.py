from __future__ import annotations

# PRD v1.1 감정 재정의에 따라 기존 6 레시피 재설계 대기 상태.
# 여기에 확정되면 {"slug": ..., "name_ko": ..., "ingredient_codes": [...], "result_tier": N}
# 형태로 채워넣고 app/seed.py 가 자동으로 idempotent upsert 한다.
RECIPES_SEED: list[dict[str, object]] = []
