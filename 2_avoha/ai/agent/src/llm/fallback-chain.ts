import pino from 'pino';
import { openaiChat, openaiVision } from './openai';
import { geminiChat, geminiVision } from './gemini';
import { ZodSchema } from 'zod';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const PRIMARY = process.env.PRIMARY_MODEL ?? 'gpt-4.1-mini';
const FALLBACK = process.env.FALLBACK_MODEL ?? 'gemini-2.5-flash';

async function parseWithRetry<T>(
  schema: ZodSchema<T>,
  callFn: () => Promise<string>,
  label: string,
): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callFn();
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    logger.warn({ attempt, label, raw }, 'Zod 검증 실패, 재시도');
  }
  throw new Error(`${label}: Zod 검증 2회 실패 → needs_human`);
}

export async function runWithFallback<T>(
  schema: ZodSchema<T>,
  systemPrompt: string,
  userContent: string,
  label: string,
): Promise<T> {
  try {
    return await parseWithRetry(
      schema,
      () => openaiChat(PRIMARY, systemPrompt, userContent),
      label,
    );
  } catch (primaryErr) {
    logger.warn({ primaryErr, label }, '주 모델 실패, 폴백 시도');
    return await parseWithRetry(
      schema,
      () => geminiChat(FALLBACK, systemPrompt, userContent),
      `${label}:fallback`,
    );
  }
}

export async function runVisionWithFallback<T>(
  schema: ZodSchema<T>,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
  label: string,
): Promise<T> {
  try {
    return await parseWithRetry(
      schema,
      () => openaiVision(PRIMARY, systemPrompt, imageBase64, mimeType),
      label,
    );
  } catch (primaryErr) {
    logger.warn({ primaryErr, label }, '주 Vision 모델 실패, 폴백 시도');
    return await parseWithRetry(
      schema,
      () => geminiVision(FALLBACK, systemPrompt, imageBase64, mimeType),
      `${label}:fallback`,
    );
  }
}
