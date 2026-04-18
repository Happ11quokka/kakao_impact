import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { Pool } from 'pg';
import { runWithFallback } from '../llm/fallback-chain';
import { EmotionClassifierResultSchema } from '../schemas';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../../prompts/emotion-classifier.md'),
  'utf-8',
);

function scrubPii(text: string): string {
  return text
    .replace(/\d{3}-\d{3,4}-\d{4}/g, '[전화번호]')
    .replace(/\d{2,3}-\d{3,4}-\d{4}/g, '[전화번호]');
}

export interface EmotionClassifierJobData {
  messageId: string;
  text: string;
}

export async function processEmotionClassifier(
  job: Job<EmotionClassifierJobData>,
): Promise<void> {
  const { messageId, text } = job.data;
  const safeText = scrubPii(text);

  logger.info({ messageId }, 'emotion-classifier 시작');

  let result;
  try {
    result = await runWithFallback(
      EmotionClassifierResultSchema,
      SYSTEM_PROMPT,
      safeText,
      'emotion-classifier',
    );
  } catch (err) {
    logger.error({ err, messageId }, 'emotion-classifier 최종 실패');
    await db.query(
      `UPDATE kakao_messages SET ai_suggestion = ai_suggestion || $1 WHERE id = $2`,
      [JSON.stringify({ emotion: null, needs_human: true }), messageId],
    );
    return;
  }

  await db.query(
    `UPDATE kakao_messages SET ai_suggestion = ai_suggestion || $1 WHERE id = $2`,
    [JSON.stringify({ emotion: result }), messageId],
  );

  logger.info({ messageId, category: result.category }, 'emotion-classifier 완료');
}
