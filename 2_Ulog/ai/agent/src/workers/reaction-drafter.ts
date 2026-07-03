import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { Pool } from 'pg';
import { runWithFallback } from '../llm/fallback-chain';
import { ReactionDrafterResultSchema } from '../schemas';
import type { EmotionClassifierResult } from '../schemas';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../../prompts/reaction-drafter.md'),
  'utf-8',
);

function scrubPii(text: string): string {
  return text
    .replace(/\d{3}-\d{3,4}-\d{4}/g, '[전화번호]')
    .replace(/\d{2,3}-\d{3,4}-\d{4}/g, '[전화번호]');
}

export interface ReactionDrafterJobData {
  messageId: string;
  text: string;
  emotion: EmotionClassifierResult;
}

export async function processReactionDrafter(
  job: Job<ReactionDrafterJobData>,
): Promise<void> {
  const { messageId, text, emotion } = job.data;
  const safeText = scrubPii(text);

  logger.info({ messageId }, 'reaction-drafter 시작');

  const userContent = JSON.stringify({
    message: safeText,
    emotion: {
      category: emotion.category,
      top1_emotion_code: emotion.top3_emotion_codes[0],
      top1_label: emotion.top3_emotion_codes[0],
    },
  });

  let result;
  try {
    result = await runWithFallback(
      ReactionDrafterResultSchema,
      SYSTEM_PROMPT,
      userContent,
      'reaction-drafter',
    );
  } catch (err) {
    logger.error({ err, messageId }, 'reaction-drafter 최종 실패');
    await db.query(
      `UPDATE kakao_messages SET ai_suggestion = ai_suggestion || $1 WHERE id = $2`,
      [JSON.stringify({ reactions: null, needs_human: true }), messageId],
    );
    return;
  }

  await db.query(
    `UPDATE kakao_messages SET ai_suggestion = ai_suggestion || $1 WHERE id = $2`,
    [JSON.stringify({ reactions: result.reactions }), messageId],
  );

  logger.info({ messageId }, 'reaction-drafter 완료');
}
