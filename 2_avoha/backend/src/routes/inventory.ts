import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../db/client.js";
import { gems, stickers } from "../db/schema.js";
import { requireSession } from "../lib/auth-guard.js";

const GemsQuery = z.object({
  emotion: z.string().optional(),
  tier: z.coerce.number().int().min(1).max(4).optional(),
});

export async function inventoryRoutes(app: FastifyInstance) {
  app.get("/inventory/gems", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    const q = GemsQuery.safeParse(req.query);
    if (!q.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_QUERY", code: "INVALID_QUERY" } });
    }

    const conditions = [eq(gems.userId, userId), isNull(gems.consumedAt)];
    if (q.data.emotion) conditions.push(eq(gems.emotionCode, q.data.emotion));
    if (q.data.tier) conditions.push(eq(gems.tier, q.data.tier));

    const rows = await db
      .select({
        id: gems.id,
        emotionCode: gems.emotionCode,
        tier: gems.tier,
        source: gems.source,
        sourceMessageId: gems.sourceMessageId,
        craftedFrom: gems.craftedFrom,
        createdAt: gems.createdAt,
      })
      .from(gems)
      .where(and(...conditions))
      .orderBy(desc(gems.createdAt));

    return { gems: rows };
  });

  app.get("/inventory/stickers", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    const rows = await db
      .select({
        id: stickers.id,
        imageUrl: stickers.imageUrl,
        polaroidFallback: stickers.polaroidFallback,
        placedOnField: stickers.placedOnField,
        sourceMessageId: stickers.sourceMessageId,
        createdAt: stickers.createdAt,
      })
      .from(stickers)
      .where(eq(stickers.userId, userId))
      .orderBy(desc(stickers.createdAt));

    return { stickers: rows };
  });
}
