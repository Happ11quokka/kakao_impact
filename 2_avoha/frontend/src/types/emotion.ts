// === Emotion Types ===

export type EmotionCategory = 'calm' | 'happy' | 'negative';
export type SilhouetteShape = 'pebble' | 'crystal' | 'fragment';

export interface Emotion {
  code: string;
  nameKo: string;
  gemName: string;
  hexColor: string;
  category: EmotionCategory;
  silhouette: SilhouetteShape;
}
