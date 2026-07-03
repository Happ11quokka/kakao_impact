import { z } from 'zod';

export const EmotionCategorySchema = z.enum(['calm', 'happy', 'negative']);

export const EmotionCodeSchema = z.enum([
  'untroubled', 'serenity',
  'pride', 'joy', 'satisfaction', 'flutter',
  'sadness', 'annoyance', 'regret', 'solace',
]);

export const EmotionClassifierResultSchema = z.object({
  category: EmotionCategorySchema,
  top3_emotion_codes: z.array(EmotionCodeSchema).length(3),
  confidence: z.array(z.number().min(0).max(1)).length(3),
  rationale: z.string().max(200),
});

export const ReactionDrafterResultSchema = z.object({
  reactions: z.array(z.string().max(120)).length(2),
});

export const EdgeGuardResultSchema = z.object({
  is_crisis: z.boolean(),
  is_offensive: z.boolean(),
  needs_human: z.boolean(),
  reason: z.string().max(200).nullable(),
});

export const StickerTaggerResultSchema = z.object({
  object: z.string().max(20),
  mood_tag: z.string().max(10),
  suggested_caption: z.string().max(40).nullable(),
});

export type EmotionClassifierResult = z.infer<typeof EmotionClassifierResultSchema>;
export type ReactionDrafterResult = z.infer<typeof ReactionDrafterResultSchema>;
export type EdgeGuardResult = z.infer<typeof EdgeGuardResultSchema>;
export type StickerTaggerResult = z.infer<typeof StickerTaggerResultSchema>;
export type EmotionCode = z.infer<typeof EmotionCodeSchema>;
export type EmotionCategory = z.infer<typeof EmotionCategorySchema>;
