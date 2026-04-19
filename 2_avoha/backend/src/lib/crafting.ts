import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { craftingEvents, events, gems, recipes } from "../db/schema.js";

export class CraftingError extends Error {
  constructor(public code: string, public status: number = 400) {
    super(code);
  }
}

export type CraftingResult = {
  gem: {
    id: string;
    emotionCode: string;
    tier: number;
    craftedFrom: string[];
    createdAt: Date;
  };
  recipeSlug: string | null;
  kind: "homogeneous" | "recipe";
};

const MAX_TIER = 4;

/**
 * 세공 합성:
 *  - 동종 합성: 같은 emotion_code + 같은 tier 2개 → tier+1 원석 (같은 emotion_code)
 *  - 이종 합성: 2개의 (emotion_code, tier) 조합이 recipes 카탈로그와 매칭되면
 *    recipe.result_tier 에 해당하는 상위 원석 발급 (emotion_code 는 첫 재료 기준, recipeSlug 기록)
 *
 * 트랜잭션:
 *  1) 재료 gem 2개 FOR UPDATE (owner·unconsumed 검증 + 동시 세공 race 방지)
 *  2) 재료 consumed_at 업데이트
 *  3) 결과 gem insert
 *  4) crafting_events insert (+ events 로그)
 */
export async function combineGems(
  userId: string,
  ingredientIds: string[],
): Promise<CraftingResult> {
  if (ingredientIds.length !== 2) {
    throw new CraftingError("INGREDIENTS_LENGTH");
  }
  const [a, b] = ingredientIds;
  if (!a || !b || a === b) {
    throw new CraftingError("INGREDIENTS_DUPLICATED");
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: gems.id,
        emotionCode: gems.emotionCode,
        tier: gems.tier,
        consumedAt: gems.consumedAt,
        userId: gems.userId,
      })
      .from(gems)
      .where(
        and(
          inArray(gems.id, ingredientIds),
          eq(gems.userId, userId),
          isNull(gems.consumedAt),
        ),
      )
      .for("update");

    if (rows.length !== 2) throw new CraftingError("INGREDIENTS_NOT_FOUND");

    // 정렬 순서는 emotion_code 로 결정 (deterministic recipe lookup)
    const sorted = [...rows].sort((x, y) =>
      x.emotionCode.localeCompare(y.emotionCode),
    );
    const [p, q] = sorted as [typeof rows[number], typeof rows[number]];

    let resultTier: number;
    let resultEmotion: string;
    let recipeSlug: string | null = null;
    let kind: CraftingResult["kind"];

    if (p.emotionCode === q.emotionCode) {
      // 동종 합성: tier 일치 필요
      if (p.tier !== q.tier) throw new CraftingError("TIERS_MISMATCH");
      if (p.tier >= MAX_TIER) throw new CraftingError("TIER_MAX");
      resultTier = p.tier + 1;
      resultEmotion = p.emotionCode;
      kind = "homogeneous";
    } else {
      // 이종 합성: recipes 매칭
      const recipeMatch = await tx
        .select({ slug: recipes.slug, resultTier: recipes.resultTier })
        .from(recipes)
        .where(
          sql`${recipes.ingredientCodes} @> ${sql.raw(
            `ARRAY['${p.emotionCode}','${q.emotionCode}']::text[]`,
          )} AND array_length(${recipes.ingredientCodes}, 1) = 2`,
        )
        .limit(1);

      const match = recipeMatch[0];
      if (!match) throw new CraftingError("RECIPE_NOT_FOUND");
      if (p.tier !== q.tier) throw new CraftingError("TIERS_MISMATCH");
      resultTier = match.resultTier;
      resultEmotion = p.emotionCode; // sort 순 첫 재료 기준
      recipeSlug = match.slug;
      kind = "recipe";
    }

    await tx
      .update(gems)
      .set({ consumedAt: sql`now()` })
      .where(inArray(gems.id, ingredientIds));

    const [inserted] = await tx
      .insert(gems)
      .values({
        userId,
        emotionCode: resultEmotion,
        tier: resultTier,
        craftedFrom: ingredientIds,
      })
      .returning({
        id: gems.id,
        emotionCode: gems.emotionCode,
        tier: gems.tier,
        craftedFrom: gems.craftedFrom,
        createdAt: gems.createdAt,
      });
    if (!inserted) throw new CraftingError("INSERT_FAILED", 500);

    await tx.insert(craftingEvents).values({
      userId,
      ingredientIds,
      resultId: inserted.id,
      recipeSlug,
    });

    await tx.insert(events).values({
      userId,
      eventType: "craft",
      props: {
        kind,
        resultTier,
        resultEmotion,
        recipeSlug,
        ingredientIds,
      },
    });

    return {
      gem: {
        id: inserted.id,
        emotionCode: inserted.emotionCode,
        tier: inserted.tier,
        craftedFrom: inserted.craftedFrom ?? [],
        createdAt: inserted.createdAt,
      },
      recipeSlug,
      kind,
    };
  });
}
