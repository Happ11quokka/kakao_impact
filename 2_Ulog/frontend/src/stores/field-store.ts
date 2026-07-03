// === Field Store ===
import { create } from 'zustand';
import type { Gem, GemTier } from '../types/gem';
import { api, ApiError, type FieldDropDto } from '../lib/api';

export interface FieldDrop {
  gem: Gem;
  position: { x: number; y: number };
}

interface FieldState {
  todayDrops: FieldDrop[];
  loading: boolean;
  error: string | null;
  fetchToday: () => Promise<void>;
  addDrop: (drop: FieldDrop) => void;
}

function dtoToDrop(dto: FieldDropDto): FieldDrop {
  const gem: Gem = {
    id: dto.id,
    emotionCode: dto.emotionCode,
    tier: dto.tier as GemTier,
    createdAt: dto.createdAt,
    consumedAt: null,
  };
  // 백엔드는 0..1 사영값. 기존 UI 는 0..100 퍼센트를 기대하므로 변환.
  return {
    gem,
    position: { x: dto.position.x * 100, y: dto.position.y * 100 },
  };
}

export const useFieldStore = create<FieldState>((set) => ({
  todayDrops: [],
  loading: false,
  error: null,

  fetchToday: async () => {
    set({ loading: true, error: null });
    try {
      const { drops } = await api.fieldToday();
      set({ todayDrops: drops.map(dtoToDrop), loading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? `${err.status} ${err.code}` : '필드 드롭을 불러오지 못했어요';
      set({ loading: false, error: message });
    }
  },

  addDrop: (drop) =>
    set((s) => ({
      todayDrops: [...s.todayDrops, drop],
    })),
}));
