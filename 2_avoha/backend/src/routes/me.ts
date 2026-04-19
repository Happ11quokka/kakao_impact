import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireSession } from "../lib/auth-guard.js";
import { getTodayTickets } from "../lib/tickets.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    const [user] = await db
      .select({
        id: users.id,
        kakaoId: users.kakaoId,
        nickname: users.nickname,
        profileUrl: users.profileUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      req.session.delete();
      return reply.status(401).send({
        error: { message: "USER_GONE", code: "USER_GONE" },
      });
    }

    const tickets = await getTodayTickets(userId);
    return { user, tickets };
  });
}
