import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { db } from "../db/client.js";
import { gems } from "../db/schema.js";
import { requireSession } from "../lib/auth-guard.js";

/**
 * 홈 필드에 뿌려질 오늘자 드롭 목록.
 * gem.id 해시를 0..1 로 사영해 결정적 (x, y) 좌표 부여 → 새로고침해도 위치 유지.
 */
function hashToUnit(id: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (h & 0xffff) / 0xffff;
}

export async function fieldRoutes(app: FastifyInstance) {
  app.get("/field/today", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    const rows = await db
      .select({
        id: gems.id,
        emotionCode: gems.emotionCode,
        tier: gems.tier,
        source: gems.source,
        createdAt: gems.createdAt,
      })
      .from(gems)
      .where(
        and(
          eq(gems.userId, userId),
          isNull(gems.consumedAt),
          sql`${gems.createdAt} >= (now() AT TIME ZONE 'Asia/Seoul')::date AT TIME ZONE 'Asia/Seoul'`,
        ),
      );

    const drops = rows.map((g) => ({
      ...g,
      position: {
        x: 0.08 + hashToUnit(g.id, 7) * 0.84,
        y: 0.25 + hashToUnit(g.id, 131) * 0.55,
      },
    }));

    return { drops };
  });
}
