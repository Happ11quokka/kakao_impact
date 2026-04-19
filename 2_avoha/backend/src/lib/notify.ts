import { env } from "../env.js";

/**
 * Discord 운영 채널 웹훅. 미설정 시 noop.
 * 네트워크 실패해도 throw 하지 않음 — 운영 사이드 채널용이라 주 플로우 차단 금지.
 */
export async function notifyOps(message: string): Promise<void> {
  if (!env.DISCORD_OPS_WEBHOOK) return;
  try {
    await fetch(env.DISCORD_OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message.slice(0, 1900) }),
    });
  } catch {
    // 조용히 흘려 보냄
  }
}
