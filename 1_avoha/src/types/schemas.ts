import { z } from "zod";

export const EmotionPolaritySchema = z.enum(["positive", "neutral", "negative"]);

export const EmotionAnalysisDataSchema = z.object({
  emotionTags: z.array(z.string()).min(1),
  emotionPolarity: EmotionPolaritySchema,
  contextKeywords: z.array(z.string()).min(1),
  visionTags: z.array(z.string()),
});

export const VisionResultSchema = z.object({
  visionTags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  rawResponse: z.record(z.unknown()),
});

export const EmotionResultSchema = z.object({
  emotionPolarity: EmotionPolaritySchema,
  emotionTags: z.array(z.string()).min(1),
  contextKeywords: z.array(z.string()).min(1),
});
