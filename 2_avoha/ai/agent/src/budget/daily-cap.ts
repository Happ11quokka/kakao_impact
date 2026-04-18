import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD ?? '10');
const DISCORD_WEBHOOK = process.env.DISCORD_OPS_WEBHOOK ?? '';

function redisKey(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `avoha:budget:${today}`;
}

class DailyCap {
  private redis: Redis | null = null;

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    }
    return this.redis;
  }

  async spentToday(): Promise<number> {
    const val = await this.getRedis().get(redisKey());
    return val ? parseFloat(val) : 0;
  }

  async recordSpend(usd: number): Promise<void> {
    const key = redisKey();
    const r = this.getRedis();
    const newVal = await r.incrbyfloat(key, usd);
    await r.expire(key, 86400 * 2);

    if (newVal >= BUDGET_USD) {
      logger.warn({ spent: newVal, budget: BUDGET_USD }, 'Daily budget exceeded');
      await this.notifyDiscord(newVal);
    }
  }

  async checkOrThrow(): Promise<void> {
    const spent = await this.spentToday();
    if (spent >= BUDGET_USD) {
      throw new Error(`Daily budget $${BUDGET_USD} exceeded (spent: $${spent.toFixed(4)})`);
    }
  }

  private async notifyDiscord(spent: number): Promise<void> {
    if (!DISCORD_WEBHOOK) return;
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🚨 **아보하 AI 예산 초과**\n오늘 지출: $${spent.toFixed(4)} / $${BUDGET_USD}\n에이전트 중단됨.`,
        }),
      });
    } catch (err) {
      logger.error({ err }, 'Discord webhook 알림 실패');
    }
  }
}

export const dailyCap = new DailyCap();
