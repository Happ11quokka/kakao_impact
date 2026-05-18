// === 세부 감정(도감·GemStone variant) — 5계열 × 5종 ===

export type EmotionFamilyShape = 'pebble' | 'crystal' | 'fragment';

/** 계열별 세부 감정 라벨 (표시 순서) */
export const EMOTION_VARIANTS_BY_CATEGORY = {
  sadness: ['우울', '외로움', '상실', '서러움', '실망'],
  anger: ['짜증', '억울', '화남', '적대', '경멸'],
  anxiety: ['걱정', '긴장', '위축', '초조', '공포'],
  joy: ['즐거움', '감사', '설렘', '뿌듯', '편안'],
  complex: ['무기력', '공허', '후회', '부끄러움', '혼란스러움'],
} as const;

export type EmotionVariantLabel =
  (typeof EMOTION_VARIANTS_BY_CATEGORY)[keyof typeof EMOTION_VARIANTS_BY_CATEGORY][number];

/** 도감 그리드용 — 계열 순서대로 25칸 */
export const ALL_EMOTION_VARIANT_LABELS: EmotionVariantLabel[] = [
  ...EMOTION_VARIANTS_BY_CATEGORY.sadness,
  ...EMOTION_VARIANTS_BY_CATEGORY.anger,
  ...EMOTION_VARIANTS_BY_CATEGORY.anxiety,
  ...EMOTION_VARIANTS_BY_CATEGORY.joy,
  ...EMOTION_VARIANTS_BY_CATEGORY.complex,
];

/** BE emotion code(10종) — variant 미지정 시 기본 라벨 */
export const DEFAULT_VARIANT_BY_EMOTION_CODE: Record<string, EmotionVariantLabel> = {
  sadness: '우울',
  annoyance: '짜증',
  solace: '걱정',
  joy: '즐거움',
  satisfaction: '감사',
  flutter: '설렘',
  pride: '뿌듯',
  serenity: '편안',
  untroubled: '무기력',
  regret: '후회',
};

/** 도감·미리보기용 — 세부 감정 → BE emotion code */
export const VARIANT_TO_EMOTION_CODE: Record<EmotionVariantLabel, string> = {
  우울: 'sadness',
  외로움: 'sadness',
  상실: 'sadness',
  서러움: 'sadness',
  실망: 'sadness',
  짜증: 'annoyance',
  억울: 'annoyance',
  화남: 'annoyance',
  적대: 'annoyance',
  경멸: 'annoyance',
  걱정: 'solace',
  긴장: 'solace',
  위축: 'solace',
  초조: 'solace',
  공포: 'solace',
  즐거움: 'joy',
  감사: 'satisfaction',
  설렘: 'flutter',
  뿌듯: 'pride',
  편안: 'satisfaction',
  무기력: 'untroubled',
  공허: 'regret',
  후회: 'regret',
  부끄러움: 'untroubled',
  혼란스러움: 'regret',
};

const PEBBLE_VARIANTS = new Set<EmotionVariantLabel>([
  '우울', '외로움', '상실', '서러움',
  '걱정', '긴장', '위축', '초조', '공포',
  '감사', '편안',
  '무기력', '공허', '후회', '부끄러움', '혼란스러움',
  '억울',
]);

const CRYSTAL_VARIANTS = new Set<EmotionVariantLabel>(['설렘', '뿌듯']);

const FRAGMENT_VARIANTS = new Set<EmotionVariantLabel>([
  '실망', '짜증', '화남', '적대', '경멸', '즐거움',
]);

export function variantToFamilyShape(variant: string): EmotionFamilyShape {
  if (CRYSTAL_VARIANTS.has(variant as EmotionVariantLabel)) return 'crystal';
  if (FRAGMENT_VARIANTS.has(variant as EmotionVariantLabel)) return 'fragment';
  if (PEBBLE_VARIANTS.has(variant as EmotionVariantLabel)) return 'pebble';
  return 'crystal';
}
