// === Crafting Store ===
import { create } from 'zustand';
import type { Gem, GemTier } from '../types/gem';
import type { Recipe } from '../types/recipe';
import { findRecipe, RECIPES } from '../data/recipes';

interface CraftResult {
  success: boolean;
  resultGem?: Gem;
  recipe?: Recipe;
  error?: string;
}

interface CraftingState {
  slot1: Gem | null;
  slot2: Gem | null;
  recipes: Recipe[];
  lastResult: CraftResult | null;
  setSlot: (slot: 1 | 2, gem: Gem | null) => void;
  clearSlots: () => void;
  combine: () => CraftResult;
  clearResult: () => void;
}

export const useCraftingStore = create<CraftingState>((set, get) => ({
  slot1: null,
  slot2: null,
  recipes: RECIPES,
  lastResult: null,

  setSlot: (slot, gem) => set(slot === 1 ? { slot1: gem } : { slot2: gem }),

  clearSlots: () => set({ slot1: null, slot2: null }),

  clearResult: () => set({ lastResult: null }),

  combine: () => {
    const { slot1, slot2 } = get();
    if (!slot1 || !slot2) {
      const result: CraftResult = { success: false, error: '슬롯 2개를 모두 채워주세요' };
      set({ lastResult: result });
      return result;
    }

    // 동종 합성: 같은 감정 + 같은 등급
    if (slot1.emotionCode === slot2.emotionCode && slot1.tier === slot2.tier) {
      if (slot1.tier >= 4) {
        const result: CraftResult = { success: false, error: '이미 최고 등급이에요!' };
        set({ lastResult: result });
        return result;
      }
      const resultGem: Gem = {
        id: `craft-${Date.now()}`,
        emotionCode: slot1.emotionCode,
        tier: (slot1.tier + 1) as GemTier,
        craftedFrom: [slot1.id, slot2.id],
        createdAt: new Date().toISOString(),
        consumedAt: null,
      };
      const result: CraftResult = { success: true, resultGem };
      set({ lastResult: result, slot1: null, slot2: null });
      return result;
    }

    // 이종 합성: 레시피 매칭
    const recipe = findRecipe(slot1.emotionCode, slot2.emotionCode);
    if (recipe) {
      const resultGem: Gem = {
        id: `craft-${Date.now()}`,
        emotionCode: slot1.emotionCode, // 첫 번째 재료 감정 유지
        tier: recipe.resultTier,
        craftedFrom: [slot1.id, slot2.id],
        createdAt: new Date().toISOString(),
        consumedAt: null,
      };
      const result: CraftResult = { success: true, resultGem, recipe };
      set({ lastResult: result, slot1: null, slot2: null });
      return result;
    }

    const result: CraftResult = { success: false, error: '이 조합으로는 세공할 수 없어요' };
    set({ lastResult: result });
    return result;
  },
}));
