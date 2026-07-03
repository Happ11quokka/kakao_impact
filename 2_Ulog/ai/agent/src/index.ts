import { Worker } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { processEmotionClassifier } from './workers/emotion-classifier';
import { processReactionDrafter } from './workers/reaction-drafter';
import { processEdgeGuard } from './workers/edge-guard';
import { processStickerTagger } from './workers/sticker-tagger';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const emotionWorker = new Worker('emotion-queue', processEmotionClassifier, {
  connection,
  concurrency: 5,
});

const reactionWorker = new Worker('reaction-queue', processReactionDrafter, {
  connection,
  concurrency: 5,
});

const edgeWorker = new Worker('edge-queue', processEdgeGuard, {
  connection,
  concurrency: 10,
});

const stickerWorker = new Worker('sticker-queue', processStickerTagger, {
  connection,
  concurrency: 2,
});

const workers = [emotionWorker, reactionWorker, edgeWorker, stickerWorker];

workers.forEach((w) => {
  w.on('completed', (job) => logger.info({ queue: w.name, jobId: job.id }, '완료'));
  w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, '실패'));
});

logger.info('아보하 에이전트 워커 시작됨');

async function shutdown() {
  logger.info('종료 중...');
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
