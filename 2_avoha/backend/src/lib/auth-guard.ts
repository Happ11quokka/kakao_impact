import type { FastifyReply, FastifyRequest } from "fastify";

export type SessionUserId = string;

/**
 * 세션에 userId가 있으면 반환, 없으면 401을 응답하고 null 반환.
 * 라우트 핸들러 상단에서:
 *   const userId = await requireSession(req, reply);
 *   if (!userId) return;
 */
export async function requireSession(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionUserId | null> {
  const userId = req.session.get("userId");
  if (!userId) {
    reply.status(401).send({
      error: { message: "UNAUTHENTICATED", code: "UNAUTHENTICATED" },
    });
    return null;
  }
  return userId;
}
