import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../db/client.js";
import { recipes } from "../db/schema.js";
import { requireSession } from "../lib/auth-guard.js";
import { CraftingError, combineGems } from "../lib/crafting.js";

const CombineBody = z.object({
  ingredientIds: z.array(z.string().uuid()).length(2),
});

export async function craftingRoutes(app: FastifyInstance) {
  app.get("/crafting/recipes", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    const rows = await db
      .select({
        id: recipes.id,
        slug: recipes.slug,
        nameKo: recipes.nameKo,
        ingredientCodes: recipes.ingredientCodes,
        resultTier: recipes.resultTier,
        unlockedBy: recipes.unlockedBy,
      })
      .from(recipes);

    return { recipes: rows };
  });

  app.post("/crafting/combine", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    const body = CombineBody.safeParse(req.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_BODY", code: "INVALID_BODY" } });
    }

    try {
      const result = await combineGems(userId, body.data.ingredientIds);
      return result;
    } catch (err) {
      if (err instanceof CraftingError) {
        return reply
          .status(err.status)
          .send({ error: { message: err.code, code: err.code } });
      }
      throw err;
    }
  });
}
