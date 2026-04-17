// === Field Store ===
import { create } from 'zustand';
import type { Gem } from '../types/gem';
import { MOCK_FIELD_DROPS } from '../data/mock-data';

export interface FieldDrop {
  gem: Gem;
  position: { x: number; y: number };
}

interface FieldState {
  todayDrops: FieldDrop[];
  fetchToday: () => void;
  addDrop: (drop: FieldDrop) => void;
}

export const useFieldStore = create<FieldState>((set) => ({
  todayDrops: [],

  fetchToday: () => {
    // Mock: 실제로는 GET /field/today
    set({ todayDrops: MOCK_FIELD_DROPS });
  },

  addDrop: (drop) => set((s) => ({
    todayDrops: [...s.todayDrops, drop],
  })),
}));
