// === Sticker Types ===

export interface Sticker {
  id: string;
  sourceMessageId?: string;
  imageUrl: string;
  polaroidFallback: boolean;
  placedOnField: boolean;
  createdAt: string;
  caption?: string;
}
