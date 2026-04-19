import { Redis } from "ioredis";
import { env } from "../env.js";

// BullMQ 는 `maxRetriesPerRequest: null` 을 요구.
// 앱 레벨 redis (dedup/SETNX 등) 는 재시도 허용 기본값.
let bullConn: Redis | null = null;
let appConn: Redis | null = null;

export function getBullRedis(): Redis {
  if (bullConn) return bullConn;
  const conn = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  bullConn = conn;
  return conn;
}

export function getAppRedis(): Redis {
  if (appConn) return appConn;
  const conn = new Redis(env.REDIS_URL, { lazyConnect: true });
  appConn = conn;
  return conn;
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([bullConn?.quit(), appConn?.quit()]);
  bullConn = null;
  appConn = null;
}
