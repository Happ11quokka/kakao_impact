// === Crafting Store (API 연동) ===
import { create } from 'zustand';
import type { Gem, GemTier } from '../types/gem';
import { api, ApiError } from '../lib/api';
import { useInventoryStore } from './inventory-store';

export interface CraftResultGem {
  id: string;
  emotionCode: string;
  tier: GemTier;
  craftedFrom: string[];
  createdAt: string;
}

export interface CraftResult {
  success: boolean;
  resultGem?: CraftResultGem;
  recipeSlug?: string | null;
  kind?: 'homogeneous' | 'recipe';
  error?: string;
}

interface CraftingState {
  slot1: Gem | null;
  slot2: Gem | null;
  lastResult: CraftResult | null;
  crafting: boolean;
  setSlot: (slot: 1 | 2, gem: Gem | null) => void;
  clearSlots: () => void;
  clearResult: () => void;
  combine: () => Promise<CraftResult>;
}

const ERROR_LABEL: Record<string, string> = {
  INGREDIENTS_LENGTH: '재료 2개가 필요해요',
  INGREDIENTS_DUPLICATED: '같은 보석은 선택할 수 없어요',
  INGREDIENTS_NOT_FOUND: '재료를 찾을 수 없어요',
  TIERS_MISMATCH: '등급이 같아야 합성할 수 있어요',
  TIER_MAX: '이미 최고 등급이에요!',
  RECIPE_NOT_FOUND: '이 조합으로는 세공할 수 없어요',
  INSERT_FAILED: '세공 결과 저장에 실패했어요',
};

export const useCraftingStore = create<CraftingState>((set, get) => ({
  slot1: null,
  slot2: null,
  lastResult: null,
  crafting: false,

  setSlot: (slot, gem) => set(slot === 1 ? { slot1: gem } : { slot2: gem }),
  clearSlots: () => set({ slot1: null, slot2: null }),
  clearResult: () => set({ lastResult: null }),

  combine: async () => {
    const { slot1, slot2 } = get();
    if (!slot1 || !slot2) {
      const result: CraftResult = { success: false, error: '슬롯 2개를 모두 채워주세요' };
      set({ lastResult: result });
      return result;
    }

    set({ crafting: true });
    try {
      const { gem, recipeSlug, kind } = await api.combine([slot1.id, slot2.id]);
      const result: CraftResult = {
        success: true,
        resultGem: {
          id: gem.id,
          emotionCode: gem.emotionCode,
          tier: gem.tier,
          craftedFrom: gem.craftedFrom,
          createdAt: gem.createdAt,
        },
        recipeSlug,
        kind,
      };
      set({ lastResult: result, slot1: null, slot2: null, crafting: false });
      // 재료 소비/신규 gem 서버에 반영됐으니 인벤토리 다시 로드
      void useInventoryStore.getState().fetchInventory();
      return result;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN';
      const result: CraftResult = { success: false, error: ERROR_LABEL[code] ?? '세공에 실패했어요' };
      set({ lastResult: result, crafting: false });
      return result;
    }
  },
}));
