// === 미분류(투명) 원석 — 일상 기록·감정 미지정 ===

export const UNCLASSIFIED_EMOTION_CODE = 'unclassified';
export const UNCLASSIFIED_VARIANT = '미분류';

export function isUnclassifiedGem(emotionCode: string, variant?: string): boolean {
  return emotionCode === UNCLASSIFIED_EMOTION_CODE || variant === UNCLASSIFIED_VARIANT;
}
