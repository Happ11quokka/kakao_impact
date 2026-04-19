import type { FastifyInstance } from "fastify";
import { requireSession } from "../lib/auth-guard.js";
import { publish, subscribe, type InventoryEvent } from "../lib/sse-bus.js";

const HEARTBEAT_MS = 25_000;

function write(reply: import("fastify").FastifyReply, ev: InventoryEvent): void {
  reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
}

export async function sseRoutes(app: FastifyInstance) {
  app.get("/sse/inventory", async (req, reply) => {
    const userId = await requireSession(req, reply);
    if (!userId) return;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 5000\n\n");
    reply.hijack();

    const unsubscribe = subscribe(userId, (ev) => write(reply, ev));
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: ping\n\n`);
      } catch {
        /* already closed */
      }
    }, HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);

    // hello event (클라이언트가 연결 확인용으로 활용)
    publish(userId, { type: "ping" });
  });
}
