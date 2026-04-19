import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../db/client.js";
import {
  collectionTickets,
  events,
  gems,
  kakaoMessages,
  users,
} from "../db/schema.js";
import { requireOps } from "../lib/ops-guard.js";
import { publish } from "../lib/sse-bus.js";

const KST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
});
const todayKst = () => KST_FORMATTER.format(new Date());

const QueueQuery = z.object({
  status: z
    .enum(["pending", "proposed", "confirmed", "rejected"])
    .default("pending"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const ConfirmBody = z.object({
  userId: z.string().uuid(),         // 메시지 user 매핑 (operator 확정)
  emotionCode: z.string().min(1),
  reactionText: z.string().max(500).optional(),
  source: z.enum(["text", "photo"]).optional(),
});

const RejectBody = z.object({
  reason: z.string().max(500).optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

export async function opsRoutes(app: FastifyInstance) {
  // 대기 큐 — 운영자가 훑어보는 인박스
  app.get("/ops/queue", async (req, reply) => {
    const auth = await requireOps(req, reply);
    if (!auth) return;

    const q = QueueQuery.safeParse(req.query);
    if (!q.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_QUERY", code: "INVALID_QUERY" } });
    }

    const rows = await db
      .select({
        id: kakaoMessages.id,
        userId: kakaoMessages.userId,
        providerUserKey: kakaoMessages.providerUserKey,
        receivedAt: kakaoMessages.receivedAt,
        contentType: kakaoMessages.contentType,
        body: kakaoMessages.body,
        mediaUrl: kakaoMessages.mediaUrl,
        aiSuggestion: kakaoMessages.aiSuggestion,
        status: kakaoMessages.status,
      })
      .from(kakaoMessages)
      .where(eq(kakaoMessages.status, q.data.status))
      .orderBy(desc(kakaoMessages.receivedAt))
      .limit(q.data.limit);

    return { messages: rows };
  });

  // 메시지 확정 → gem 발급 + 채집권 차감 + SSE 브로드캐스트
  app.post("/ops/messages/:id/confirm", async (req, reply) => {
    const auth = await requireOps(req, reply);
    if (!auth) return;

    const p = IdParam.safeParse(req.params);
    if (!p.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_PARAM", code: "INVALID_PARAM" } });
    }
    const b = ConfirmBody.safeParse(req.body);
    if (!b.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_BODY", code: "INVALID_BODY" } });
    }

    try {
      const result = await db.transaction(async (tx) => {
        // 1) 메시지 락 + 상태 검증
        const [msg] = await tx
          .select()
          .from(kakaoMessages)
          .where(eq(kakaoMessages.id, p.data.id))
          .for("update");
        if (!msg) throw Object.assign(new Error("MESSAGE_NOT_FOUND"), { code: "MESSAGE_NOT_FOUND", status: 404 });
        if (msg.status === "confirmed" || msg.status === "rejected") {
          throw Object.assign(new Error("INVALID_STATUS"), { code: "INVALID_STATUS", status: 409 });
        }

        // 2) 대상 user 존재 확인
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, b.data.userId))
          .limit(1);
        if (!user) throw Object.assign(new Error("USER_NOT_FOUND"), { code: "USER_NOT_FOUND", status: 400 });

        // 3) 채집권 upsert + 원자 차감 (remaining > 0 일 때만)
        const today = todayKst();
        await tx
          .insert(collectionTickets)
          .values({ userId: b.data.userId, date: today, remaining: 5 })
          .onConflictDoNothing();

        const decremented = await tx
          .update(collectionTickets)
          .set({ remaining: sql`${collectionTickets.remaining} - 1` })
          .where(
            and(
              eq(collectionTickets.userId, b.data.userId),
              eq(collectionTickets.date, today),
              sql`${collectionTickets.remaining} > 0`,
            ),
          )
          .returning({ remaining: collectionTickets.remaining });

        if (decremented.length === 0) {
          throw Object.assign(new Error("NO_TICKETS"), { code: "NO_TICKETS", status: 409 });
        }
        const remaining = decremented[0]!.remaining;

        // 4) gem 발급 (tier 1)
        const inferredSource =
          b.data.source ??
          (msg.contentType === "image" || msg.contentType === "mixed"
            ? "photo"
            : "text");
        const [gem] = await tx
          .insert(gems)
          .values({
            userId: b.data.userId,
            emotionCode: b.data.emotionCode,
            tier: 1,
            sourceMessageId: msg.id,
            source: inferredSource,
          })
          .returning({
            id: gems.id,
            emotionCode: gems.emotionCode,
            tier: gems.tier,
            source: gems.source,
          });
        if (!gem)
          throw Object.assign(new Error("GEM_INSERT_FAILED"), {
            code: "GEM_INSERT_FAILED",
            status: 500,
          });

        // 5) 메시지 확정
        await tx
          .update(kakaoMessages)
          .set({
            status: "confirmed",
            operatorId: auth.userId,
            userId: b.data.userId,
            finalizedAt: sql`now()`,
            aiSuggestion: sql`coalesce(${kakaoMessages.aiSuggestion}, '{}'::jsonb) || ${JSON.stringify({ final: { emotionCode: b.data.emotionCode, reactionText: b.data.reactionText ?? null } })}::jsonb`,
          })
          .where(eq(kakaoMessages.id, msg.id));

        // 6) 이벤트 로그
        await tx.insert(events).values({
          userId: b.data.userId,
          eventType: "collect",
          props: {
            messageId: msg.id,
            emotionCode: b.data.emotionCode,
            source: inferredSource,
            operatorId: auth.userId,
            tier: 1,
          },
        });

        return { gem, remaining, userId: b.data.userId };
      });

      // SSE 브로드캐스트 (tx 바깥에서)
      publish(result.userId, {
        type: "gem_added",
        gem: {
          id: result.gem.id,
          emotionCode: result.gem.emotionCode,
          tier: result.gem.tier,
          source: result.gem.source,
        },
      });

      return { ok: true, gem: result.gem, remaining: result.remaining };
    } catch (err) {
      const maybe = err as { code?: string; status?: number; message?: string };
      if (maybe.code && maybe.status) {
        return reply
          .status(maybe.status)
          .send({ error: { message: maybe.code, code: maybe.code } });
      }
      throw err;
    }
  });

  // 메시지 거절
  app.post("/ops/messages/:id/reject", async (req, reply) => {
    const auth = await requireOps(req, reply);
    if (!auth) return;

    const p = IdParam.safeParse(req.params);
    if (!p.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_PARAM", code: "INVALID_PARAM" } });
    }
    const b = RejectBody.safeParse(req.body ?? {});
    if (!b.success) {
      return reply
        .status(400)
        .send({ error: { message: "INVALID_BODY", code: "INVALID_BODY" } });
    }

    const updated = await db
      .update(kakaoMessages)
      .set({
        status: "rejected",
        operatorId: auth.userId,
        finalizedAt: sql`now()`,
        aiSuggestion: sql`coalesce(${kakaoMessages.aiSuggestion}, '{}'::jsonb) || ${JSON.stringify({ reject: { reason: b.data.reason ?? null } })}::jsonb`,
      })
      .where(
        and(
          eq(kakaoMessages.id, p.data.id),
          inArray(kakaoMessages.status, ["pending", "proposed"]),
        ),
      )
      .returning({ id: kakaoMessages.id });

    if (updated.length === 0) {
      return reply
        .status(409)
        .send({ error: { message: "INVALID_STATUS", code: "INVALID_STATUS" } });
    }
    return { ok: true };
  });

  // 대시보드 요약 (오늘 KST 기준)
  app.get("/ops/dashboard-metrics", async (req, reply) => {
    const auth = await requireOps(req, reply);
    if (!auth) return;

    const today = todayKst();

    const pendingRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(kakaoMessages)
      .where(eq(kakaoMessages.status, "pending"));
    const confirmedTodayRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(kakaoMessages)
      .where(
        and(
          eq(kakaoMessages.status, "confirmed"),
          sql`${kakaoMessages.finalizedAt} >= (${today}::date AT TIME ZONE 'Asia/Seoul')`,
        ),
      );
    const activeGemsRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gems)
      .where(isNull(gems.consumedAt));
    const activeUsersTodayRow = await db
      .select({
        count: sql<number>`count(distinct ${events.userId})::int`,
      })
      .from(events)
      .where(
        sql`${events.occurredAt} >= (${today}::date AT TIME ZONE 'Asia/Seoul')`,
      );

    return {
      pendingCount: pendingRow[0]?.count ?? 0,
      confirmedTodayCount: confirmedTodayRow[0]?.count ?? 0,
      activeGems: activeGemsRow[0]?.count ?? 0,
      activeUsersToday: activeUsersTodayRow[0]?.count ?? 0,
      dateKst: today,
    };
  });
}
