// === Inventory Store ===
import { create } from 'zustand';
import type { Gem, GemTier } from '../types/gem';
import type { Sticker } from '../types/sticker';
import { api, ApiError, type GemDto, type StickerDto } from '../lib/api';

interface InventoryState {
  gems: Gem[];
  stickers: Sticker[];
  ticketsRemaining: number;
  loading: boolean;
  error: string | null;
  fetchInventory: () => Promise<void>;
  addGem: (gem: Gem) => void;
  removeGem: (gemId: string) => void;
  consumeGem: (gemId: string) => void;
}

function dtoToGem(dto: GemDto): Gem {
  return {
    id: dto.id,
    emotionCode: dto.emotionCode,
    tier: dto.tier as GemTier,
    sourceMessageId: dto.sourceMessageId ?? undefined,
    sourceChatbotId: dto.sourceChatbotId ?? undefined,
    craftedFrom: dto.craftedFrom.length > 0 ? dto.craftedFrom : undefined,
    createdAt: dto.createdAt,
    consumedAt: null,
  };
}

function dtoToSticker(dto: StickerDto): Sticker {
  return {
    id: dto.id,
    sourceMessageId: dto.sourceMessageId ?? undefined,
    imageUrl: dto.imageUrl,
    polaroidFallback: dto.polaroidFallback,
    placedOnField: dto.placedOnField,
    createdAt: dto.createdAt,
  };
}

export const useInventoryStore = create<InventoryState>((set) => ({
  gems: [],
  stickers: [],
  ticketsRemaining: 0,
  loading: false,
  error: null,

  fetchInventory: async () => {
    set({ loading: true, error: null });
    try {
      const [gemsRes, stickersRes, meRes] = await Promise.all([
        api.gems(),
        api.stickers(),
        api.me().catch(() => null),
      ]);
      set({
        gems: gemsRes.gems.map(dtoToGem),
        stickers: stickersRes.stickers.map(dtoToSticker),
        ticketsRemaining: meRes?.tickets.remaining ?? 0,
        loading: false,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? `${err.status} ${err.code}` : '인벤토리를 불러오지 못했어요';
      set({ loading: false, error: message });
    }
  },

  addGem: (gem) => set((s) => ({ gems: [...s.gems, gem] })),

  removeGem: (gemId) =>
    set((s) => ({
      gems: s.gems.filter((g) => g.id !== gemId),
    })),

  consumeGem: (gemId) =>
    set((s) => ({
      gems: s.gems.map((g) =>
        g.id === gemId ? { ...g, consumedAt: new Date().toISOString() } : g,
      ),
    })),
}));
