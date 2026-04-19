import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../db/client.js";
import { events } from "../db/schema.js";
import { requireSession } from "../lib/auth-guard.js";

const BatchBody = z.object({
  events: z
    .array(
      z.object({
        eventType: z.string().min(1).max(64),
        props: z.record(z.unknown()).optional(),
        occurredAt: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function eventsRoutes(app: FastifyInstance) {
  app.post("/events", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    const parsed = BatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_BODY", code: "INVALID_BODY" } });
    }

    await db.insert(events).values(
      parsed.data.events.map((ev) => ({
        userId,
        eventType: ev.eventType,
        props: ev.props ?? null,
        ...(ev.occurredAt ? { occurredAt: new Date(ev.occurredAt) } : {}),
      })),
    );

    return { ok: true, count: parsed.data.events.length };
  });
}
