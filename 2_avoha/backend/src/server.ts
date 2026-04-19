import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifySecureSession from "@fastify/secure-session";

import { env, isProd } from "./env.js";
import { pgClient } from "./db/client.js";
import { closeQueue } from "./lib/queue.js";
import { closeRedis } from "./lib/redis.js";
import { loggerOptions } from "./logger.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { craftingRoutes } from "./routes/crafting.js";
import { eventsRoutes } from "./routes/events.js";
import { fieldRoutes } from "./routes/field.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { meRoutes } from "./routes/me.js";
import { opsRoutes } from "./routes/ops.js";
import { sseRoutes } from "./routes/sse.js";
import { webhookRoutes } from "./routes/webhook.js";

import "./types/session.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: isProd,
  });

  await app.register(fastifyCors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });
  await app.register(fastifyCookie);
  await app.register(fastifySecureSession, {
    key: Buffer.from(env.SESSION_SECRET, "hex"),
    cookieName: "avoha_sid",
    expiry: 60 * 60 * 24 * 7,
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
    },
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    req.log.error({ err }, "unhandled route error");
    reply.status(status).send({
      error: {
        message: status >= 500 ? "Internal Server Error" : err.message,
        code: err.code,
      },
    });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(webhookRoutes);
  await app.register(inventoryRoutes);
  await app.register(craftingRoutes);
  await app.register(opsRoutes);
  await app.register(sseRoutes);
  await app.register(eventsRoutes);
  await app.register(fieldRoutes);

  app.addHook("onClose", async () => {
    await closeQueue();
    await closeRedis();
    await pgClient.end({ timeout: 5 });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}
