// === Mock 데이터: 보석, 스티커, 필드 드롭 ===

import type { Gem } from '../types/gem';
import type { Sticker } from '../types/sticker';

export const MOCK_GEMS: Gem[] = [
  { id: 'g1', emotionCode: 'joy',          tier: 1, sourceText: '버스 타이밍이 딱 맞았어',       createdAt: '2026-04-17T14:32:00Z', consumedAt: null },
  { id: 'g2', emotionCode: 'satisfaction',  tier: 1, sourceText: '점심에 먹은 라면이 맛있었다',   createdAt: '2026-04-17T12:15:00Z', consumedAt: null },
  { id: 'g3', emotionCode: 'serenity',      tier: 1, sourceText: '조용한 카페에서 혼자 커피',     createdAt: '2026-04-17T16:00:00Z', consumedAt: null },
  { id: 'g4', emotionCode: 'flutter',       tier: 1, sourceText: '주말에 친구 만나기로 했다',     createdAt: '2026-04-17T18:20:00Z', consumedAt: null },
  { id: 'g5', emotionCode: 'pride',         tier: 2, sourceText: '미루던 정리를 끝냈다',         createdAt: '2026-04-17T10:00:00Z', consumedAt: null, craftedFrom: ['ga', 'gb'] },
  { id: 'g6', emotionCode: 'untroubled',    tier: 1, sourceText: '오늘도 무탈하게 지나갔다',     createdAt: '2026-04-18T09:00:00Z', consumedAt: null },
  { id: 'g7', emotionCode: 'solace',        tier: 1, sourceText: '친구가 따뜻한 말을 해줬다',    createdAt: '2026-04-18T11:30:00Z', consumedAt: null },
  { id: 'g8', emotionCode: 'sadness',       tier: 1, sourceText: '비 오는 날 우산을 안 가져왔다', createdAt: '2026-04-18T13:00:00Z', consumedAt: null },
];

export const MOCK_STICKERS: Sticker[] = [
  { id: 's1', imageUrl: '',  polaroidFallback: true,  placedOnField: false, createdAt: '2026-04-17T15:00:00Z', caption: '오후 커피' },
  { id: 's2', imageUrl: '',  polaroidFallback: true,  placedOnField: false, createdAt: '2026-04-18T12:00:00Z', caption: '점심 도시락' },
];

export interface FieldDrop {
  gem: Gem;
  position: { x: number; y: number };
}

export const MOCK_FIELD_DROPS: FieldDrop[] = [
  { gem: MOCK_GEMS[0], position: { x: 25, y: 55 } },
  { gem: MOCK_GEMS[1], position: { x: 60, y: 48 } },
  { gem: MOCK_GEMS[5], position: { x: 40, y: 62 } },
  { gem: MOCK_GEMS[6], position: { x: 75, y: 58 } },
];

// 아보하 지수 mock (14일)
export const MOCK_DAILY_INDICES = [32, 45, 28, 55, 60, 42, 38, 65, 72, 50, 48, 70, 80, 55];

// 유저 프로필 mock
export const MOCK_USER = {
  nickname: '보석 채집가',
  profileUrl: '',
  ticketsRemaining: 3,
  streakDays: 4,
  totalCollections: 15,
  totalGems: 8,
};
