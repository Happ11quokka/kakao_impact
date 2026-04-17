// === Inventory Store ===
import { create } from 'zustand';
import type { Gem } from '../types/gem';
import type { Sticker } from '../types/sticker';
import { MOCK_GEMS, MOCK_STICKERS, MOCK_USER } from '../data/mock-data';

interface InventoryState {
  gems: Gem[];
  stickers: Sticker[];
  ticketsRemaining: number;
  fetchInventory: () => void;
  addGem: (gem: Gem) => void;
  removeGem: (gemId: string) => void;
  consumeGem: (gemId: string) => void;
}

export const useInventoryStore = create<InventoryState>((set) => ({
  gems: [],
  stickers: [],
  ticketsRemaining: 5,

  fetchInventory: () => {
    // Mock: 실제로는 API 호출
    set({
      gems: MOCK_GEMS.filter(g => !g.consumedAt),
      stickers: MOCK_STICKERS,
      ticketsRemaining: MOCK_USER.ticketsRemaining,
    });
  },

  addGem: (gem) => set((s) => ({ gems: [...s.gems, gem] })),

  removeGem: (gemId) => set((s) => ({
    gems: s.gems.filter(g => g.id !== gemId),
  })),

  consumeGem: (gemId) => set((s) => ({
    gems: s.gems.map(g =>
      g.id === gemId ? { ...g, consumedAt: new Date().toISOString() } : g
    ),
  })),
}));
