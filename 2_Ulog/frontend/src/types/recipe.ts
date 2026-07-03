// === Recipe Types ===

import type { GemTier } from './gem';

export interface Recipe {
  slug: string;
  nameKo: string;
  ingredientCodes: [string, string];
  resultTier: GemTier;
  unlocked: boolean;
}
