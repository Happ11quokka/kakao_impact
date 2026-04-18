import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { Pool } from 'pg';
import { runVisionWithFallback } from '../llm/fallback-chain';
import { StickerTaggerResultSchema } from '../schemas';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../../prompts/sticker-tagger.md'),
  'utf-8',
);

export interface StickerTaggerJobData {
  messageId: string;
  imageBase64: string;
  mimeType: string;
}

export async function processStickerTagger(job: Job<StickerTaggerJobData>): Promise<void> {
  const { messageId, imageBase64, mimeType } = job.data;

  logger.info({ messageId }, 'sticker-tagger 시작');

  let result;
  try {
    result = await runVisionWithFallback(
      StickerTaggerResultSchema,
      SYSTEM_PROMPT,
      imageBase64,
      mimeType,
      'sticker-tagger',
    );
  } catch (err) {
    logger.error({ err, messageId }, 'sticker-tagger 최종 실패');
    await db.query(
      `UPDATE kakao_messages SET ai_suggestion = ai_suggestion || $1 WHERE id = $2`,
      [JSON.stringify({ sticker_tag: null, needs_human: true }), messageId],
    );
    return;
  }

  await db.query(
    `UPDATE kakao_messages SET ai_suggestion = ai_suggestion || $1 WHERE id = $2`,
    [JSON.stringify({ sticker_tag: result }), messageId],
  );

  logger.info({ messageId, object: result.object }, 'sticker-tagger 완료');
}
