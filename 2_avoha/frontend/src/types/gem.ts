// === Gem (광물) Types ===

export type GemTier = 1 | 2 | 3 | 4;

export const TIER_NAMES: Record<GemTier, string> = {
  1: '돌멩이',
  2: '반짝이는 원석',
  3: '영롱한 보석',
  4: '마법의 크리스탈',
};

export const TIER_DESCRIPTIONS: Record<GemTier, string> = {
  1: '무광 텍스처, 단색',
  2: '하이라이트, 조각 결',
  3: '투명도 + 내부 빛 반사',
  4: '오로라 발광 + 파티클 오라',
};

export interface Gem {
  id: string;
  emotionCode: string;
  tier: GemTier;
  sourceMessageId?: string;
  sourceChatbotId?: number;
  sourceText?: string;          // mock용: 원본 메시지 텍스트
  craftedFrom?: string[];
  createdAt: string;
  consumedAt?: string | null;
}
