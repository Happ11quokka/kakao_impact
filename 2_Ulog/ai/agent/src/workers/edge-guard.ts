import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { Pool } from 'pg';
import { runWithFallback } from '../llm/fallback-chain';
import { EdgeGuardResultSchema } from '../schemas';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../../prompts/edge-guard.md'),
  'utf-8',
);

function scrubPii(text: string): string {
  return text
    .replace(/\d{3}-\d{3,4}-\d{4}/g, '[전화번호]')
    .replace(/\d{2,3}-\d{3,4}-\d{4}/g, '[전화번호]');
}

export interface EdgeGuardJobData {
  messageId: string;
  text: string;
}

export async function processEdgeGuard(job: Job<EdgeGuardJobData>): Promise<void> {
  const { messageId, text } = job.data;
  const safeText = scrubPii(text);

  logger.info({ messageId }, 'edge-guard 시작');

  let result;
  try {
    result = await runWithFallback(
      EdgeGuardResultSchema,
      SYSTEM_PROMPT,
      safeText,
      'edge-guard',
    );
  } catch (err) {
    logger.error({ err, messageId }, 'edge-guard 최종 실패 → needs_human');
    result = { is_crisis: false, is_offensive: false, needs_human: true, reason: 'AI 판단 실패' };
  }

  await db.query(
    `UPDATE kakao_messages SET ai_suggestion = ai_suggestion || $1 WHERE id = $2`,
    [JSON.stringify({ edge_guard: result }), messageId],
  );

  if (result.needs_human) {
    logger.warn({ messageId, result }, 'edge-guard: 인간 개입 필요');
  }

  logger.info({ messageId, needs_human: result.needs_human }, 'edge-guard 완료');
}
