import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../db/client.js";
import { kakaoMessages } from "../db/schema.js";
import { env } from "../env.js";
import { getEmotionQueue, type EmotionJobData } from "../lib/queue.js";

/**
 * Kakao Biz(상담톡/채널) 웹훅 수신 라우트.
 *
 * 공식 Kakao Biz webhook 스키마는 채널/상담 제품 계약 시점 확정되므로,
 * 본 구현은 여러 포맷을 정규화로 흡수하도록 `passthrough()` + best-effort 필드 추출.
 *
 * - providerMessageId: 재시도 dedup key (DB unique)
 * - providerUserKey: Kakao 채널 사용자 식별자 (OAuth kakao_id 와는 별개)
 * - raw: 원본 보존 (운영·재처리용)
 */

const WebhookBody = z
  .object({
    // 표준 후보
    event: z.string().optional(),
    messageId: z.string().optional(),
    userKey: z.string().optional(),
    // 중첩 후보 #1 (상담톡 예상)
    userRequest: z
      .object({
        user: z
          .object({
            id: z.union([z.string(), z.number()]).optional(),
            properties: z.record(z.unknown()).optional(),
          })
          .passthrough()
          .optional(),
        utterance: z.string().optional(),
        params: z.record(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    content: z
      .object({
        type: z.string().optional(),
        text: z.string().optional(),
        imageUrl: z.string().optional(),
        mediaUrl: z.string().optional(),
      })
      .passthrough()
      .optional(),
    // 중첩 후보 #2 (카카오톡 알림톡류 콜백)
    data: z.record(z.unknown()).optional(),
  })
  .passthrough();

type NormalizedMessage = {
  providerMessageId: string | null;
  providerUserKey: string | null;
  contentType: "text" | "image" | "mixed";
  body: string | null;
  mediaUrl: string | null;
};

function normalize(raw: z.infer<typeof WebhookBody>): NormalizedMessage {
  const providerMessageId =
    raw.messageId ??
    (typeof raw.data?.messageId === "string" ? raw.data.messageId : null) ??
    null;

  const userKeyRaw =
    raw.userKey ??
    raw.userRequest?.user?.id ??
    (typeof raw.data?.userKey === "string" ? raw.data.userKey : null);
  const providerUserKey =
    userKeyRaw == null ? null : String(userKeyRaw);

  const body =
    raw.content?.text ??
    raw.userRequest?.utterance ??
    (typeof raw.data?.text === "string" ? raw.data.text : null) ??
    null;
  const mediaUrl =
    raw.content?.imageUrl ??
    raw.content?.mediaUrl ??
    (typeof raw.data?.imageUrl === "string" ? raw.data.imageUrl : null) ??
    null;

  let contentType: NormalizedMessage["contentType"];
  if (body && mediaUrl) contentType = "mixed";
  else if (mediaUrl) contentType = "image";
  else contentType = "text"; // body 가 비었어도 기본값

  return { providerMessageId, providerUserKey, contentType, body, mediaUrl };
}

function verifySecret(headerValue: string | string[] | undefined): boolean {
  if (!env.KAKAO_WEBHOOK_SECRET) return true; // 미설정 시 검증 생략
  if (typeof headerValue !== "string") return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(env.KAKAO_WEBHOOK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhook/kakao", async (req, reply) => {
    // 1) 시크릿 검증 (선택)
    if (!verifySecret(req.headers["x-avoha-webhook-secret"])) {
      req.log.warn({ ip: req.ip }, "webhook secret mismatch");
      return reply.status(401).send({ ok: false, error: "secret_mismatch" });
    }

    // 2) 스키마 파싱 (실패해도 raw 는 보존)
    const parsed = WebhookBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, "webhook body invalid");
      return reply.status(400).send({ ok: false, error: "invalid_body" });
    }
    const normalized = normalize(parsed.data);

    // 3) providerMessageId 로 dedup (DB unique 제약으로 race 안전)
    if (normalized.providerMessageId) {
      const existing = await db
        .select({ id: kakaoMessages.id })
        .from(kakaoMessages)
        .where(eq(kakaoMessages.providerMessageId, normalized.providerMessageId))
        .limit(1);
      if (existing.length > 0) {
        req.log.info(
          { providerMessageId: normalized.providerMessageId, dbId: existing[0]!.id },
          "webhook duplicate",
        );
        return reply.send({ ok: true, duplicate: true, id: existing[0]!.id });
      }
    }

    // 4) 저장 (pending). user_id 는 후속 매핑 단계에서 채움.
    const [row] = await db
      .insert(kakaoMessages)
      .values({
        providerMessageId: normalized.providerMessageId,
        providerUserKey: normalized.providerUserKey,
        contentType: normalized.contentType,
        body: normalized.body,
        mediaUrl: normalized.mediaUrl,
        status: "pending",
        raw: req.body as Record<string, unknown>,
      })
      .returning({ id: kakaoMessages.id });

    if (!row) {
      // onConflict 없이 insert 실패 → race 로 중복이 끼어들었을 수도
      req.log.error("kakao_messages insert returned no rows");
      return reply.status(500).send({ ok: false, error: "insert_failed" });
    }

    // 5) 큐에 classify 작업 발행
    const jobData: EmotionJobData = {
      messageId: row.id,
      contentType: normalized.contentType,
      body: normalized.body,
      mediaUrl: normalized.mediaUrl,
    };
    try {
      await getEmotionQueue().add("classify", jobData, {
        jobId: row.id, // BullMQ dedup: 같은 message 가 재시도로 큐잉되는 것 방지
      });
    } catch (err) {
      // 큐 실패해도 메시지는 저장됐으니 200 으로 접수.
      // 운영자가 /ops/queue 에서 status=pending 으로 수동 처리 가능.
      req.log.error({ err, messageId: row.id }, "emotion-queue add failed");
    }

    return reply.send({ ok: true, id: row.id });
  });
}
