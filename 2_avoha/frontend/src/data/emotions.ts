// === 10종 감정 카탈로그 (Design README v1.1 기준) ===

import type { Emotion } from '../types/emotion';

export const EMOTIONS: Emotion[] = [
  // 평온 카테고리 — 둥근 자갈 실루엣
  { code: 'untroubled', nameKo: '무탈',  gemName: '월장석',     hexColor: '#E8EAF0', category: 'calm',     silhouette: 'pebble' },
  { code: 'serenity',   nameKo: '평온',  gemName: '아쿠아마린', hexColor: '#A0D8EF', category: 'calm',     silhouette: 'pebble' },
  // 행복 카테고리 — 각진 크리스탈 실루엣
  { code: 'pride',        nameKo: '뿌듯', gemName: '황수정',     hexColor: '#F2C14E', category: 'happy',    silhouette: 'crystal' },
  { code: 'joy',          nameKo: '기쁨', gemName: '루비',       hexColor: '#E8614D', category: 'happy',    silhouette: 'crystal' },
  { code: 'satisfaction', nameKo: '만족', gemName: '앰버',       hexColor: '#E8A838', category: 'happy',    silhouette: 'crystal' },
  { code: 'flutter',      nameKo: '설렘', gemName: '로즈쿼츠',   hexColor: '#F6B6C1', category: 'happy',    silhouette: 'crystal' },
  // 부정 카테고리 — 비대칭 조각 실루엣
  { code: 'sadness',   nameKo: '슬픔', gemName: '사파이어', hexColor: '#2E4B8C', category: 'negative', silhouette: 'fragment' },
  { code: 'annoyance', nameKo: '짜증', gemName: '가넷',     hexColor: '#8E2F2F', category: 'negative', silhouette: 'fragment' },
  { code: 'regret',    nameKo: '후회', gemName: '연수정',   hexColor: '#8A7E72', category: 'negative', silhouette: 'fragment' },
  { code: 'solace',    nameKo: '위로', gemName: '오팔',     hexColor: '#E8D8CF', category: 'negative', silhouette: 'fragment' },
];

export const EMOTION_MAP = Object.fromEntries(EMOTIONS.map(e => [e.code, e]));

export function getEmotion(code: string): Emotion | undefined {
  return EMOTION_MAP[code];
}
