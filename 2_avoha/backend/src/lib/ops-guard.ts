import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

/**
 * 운영 콘솔 세션 가드:
 *   - 로그인 세션 확인 (userId + kakaoId)
 *   - kakaoId 가 OPS_ALLOWED_KAKAO_IDS 화이트리스트에 포함되는지
 */
export async function requireOps(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userId: string; kakaoId: number } | null> {
  const userId = req.session.get("userId");
  const kakaoId = req.session.get("kakaoId");
  if (!userId || !kakaoId) {
    reply
      .status(401)
      .send({ error: { message: "UNAUTHENTICATED", code: "UNAUTHENTICATED" } });
    return null;
  }
  if (!env.OPS_ALLOWED_KAKAO_IDS.includes(kakaoId)) {
    reply.status(403).send({ error: { message: "FORBIDDEN", code: "NOT_OPS" } });
    return null;
  }
  return { userId, kakaoId };
}
