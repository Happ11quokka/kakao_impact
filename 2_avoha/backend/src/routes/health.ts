import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { getAppRedis } from "../lib/redis.js";

type CheckResult = { ok: boolean; ms: number; error?: string };

async function timed<T>(fn: () => Promise<T>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - start,
      error: (err as Error).message ?? "unknown",
    };
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_req, reply) => {
    const [dbCheck, redisCheck] = await Promise.all([
      timed(() => db.execute(sql`select 1`)),
      timed(async () => {
        const r = getAppRedis();
        if (r.status === "wait" || r.status === "end") await r.connect();
        await r.ping();
      }),
    ]);

    const ok = dbCheck.ok && redisCheck.ok;
    reply.status(ok ? 200 : 503);
    return {
      status: ok ? "ready" : "degraded",
      checks: { db: dbCheck, redis: redisCheck },
    };
  });
}
