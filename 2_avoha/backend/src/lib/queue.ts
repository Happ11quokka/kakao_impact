import { Queue } from "bullmq";
import { getBullRedis } from "./redis.js";

export const EMOTION_QUEUE_NAME = "emotion-queue";

export type EmotionJobData = {
  messageId: string;           // kakao_messages.id
  contentType: "text" | "image" | "mixed";
  body: string | null;
  mediaUrl: string | null;
};

let queue: Queue<EmotionJobData> | null = null;

export function getEmotionQueue(): Queue<EmotionJobData> {
  if (!queue) {
    queue = new Queue<EmotionJobData>(EMOTION_QUEUE_NAME, {
      connection: getBullRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 3_000 },
        removeOnComplete: { count: 1_000, age: 60 * 60 * 24 * 3 },
        removeOnFail: { count: 500, age: 60 * 60 * 24 * 7 },
      },
    });
  }
  return queue;
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
