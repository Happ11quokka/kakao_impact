// === 10종 감정 카탈로그 (Design README v1.1 기준) ===

import type { Emotion } from '../types/emotion';

export const EMOTIONS: Emotion[] = [
  // 미분류 — 투명 유리 원석 (일상 기록·감정 미지정, 25종 중 선택 대기)
  {
    code: 'unclassified',
    nameKo: '미분류',
    gemName: '투명석',
    hexColor: '#7B95A8',
    category: 'calm',
    silhouette: 'pebble',
  },
  // 복잡/모호 계열 — 흑요석(불투명한 검은 돌)
  { code: 'untroubled', nameKo: '무탈',  gemName: '흑요석', hexColor: '#262A30', category: 'calm',     silhouette: 'pebble' },
  { code: 'serenity',   nameKo: '평온',  gemName: '흑요석', hexColor: '#2F343B', category: 'calm',     silhouette: 'pebble' },
  // 기쁨 계열 — 호박(황금빛 덩어리)
  { code: 'pride',        nameKo: '뿌듯', gemName: '호박', hexColor: '#D6A63A', category: 'happy',    silhouette: 'crystal' },
  { code: 'joy',          nameKo: '기쁨', gemName: '호박', hexColor: '#D9B24A', category: 'happy',    silhouette: 'crystal' },
  { code: 'satisfaction', nameKo: '만족', gemName: '호박', hexColor: '#C9922C', category: 'happy',    silhouette: 'crystal' },
  { code: 'flutter',      nameKo: '설렘', gemName: '호박', hexColor: '#BF7D26', category: 'happy',    silhouette: 'crystal' },
  // 슬픔 계열 — 청금석(군청빛)
  { code: 'sadness',   nameKo: '슬픔', gemName: '청금석', hexColor: '#1F3F8C', category: 'negative', silhouette: 'fragment' },
  // 분노 계열 — 홍옥수(거칠고 붉은 돌)
  { code: 'annoyance', nameKo: '짜증', gemName: '홍옥수', hexColor: '#8E2420', category: 'negative', silhouette: 'fragment' },
  // 복잡/모호 계열 — 흑요석
  { code: 'regret',    nameKo: '후회', gemName: '흑요석', hexColor: '#332B29', category: 'negative', silhouette: 'fragment' },
  // 불안 계열 — 오팔(뿌옇고 흐릿한 유색 효과)
  { code: 'solace',    nameKo: '위로', gemName: '오팔',   hexColor: '#B7C6C8', category: 'negative', silhouette: 'fragment' },
];

export const EMOTION_MAP = Object.fromEntries(EMOTIONS.map(e => [e.code, e]));

export function getEmotion(code: string): Emotion | undefined {
  return EMOTION_MAP[code];
}
