// === 세공 레시피 6종 (PRD 8.2) ===

import type { Recipe } from '../types/recipe';

export const RECIPES: Recipe[] = [
  { slug: 'dinner_star',     nameKo: '저녁 식탁의 별',       ingredientCodes: ['satisfaction', 'solace'],  resultTier: 3, unlocked: true },
  { slug: 'destined_spark',  nameKo: '운명의 조각',          ingredientCodes: ['flutter', 'joy'],          resultTier: 3, unlocked: true },
  { slug: 'flow_crystal',    nameKo: '흐르는 시간의 정수',    ingredientCodes: ['serenity', 'pride'],       resultTier: 4, unlocked: false },
  { slug: 'homecoming_opal', nameKo: '돌아온 저녁의 오팔',    ingredientCodes: ['untroubled', 'serenity'],  resultTier: 3, unlocked: false },
  { slug: 'quiet_ember',     nameKo: '조용한 불씨',          ingredientCodes: ['solace', 'serenity'],      resultTier: 3, unlocked: false },
  { slug: 'tiny_victory',    nameKo: '작은 승리의 섬광',      ingredientCodes: ['pride', 'joy'],            resultTier: 4, unlocked: false },
];

/** 두 감정 코드로 매칭되는 이종 합성 레시피 찾기 */
export function findRecipe(code1: string, code2: string): Recipe | undefined {
  return RECIPES.find(
    r =>
      (r.ingredientCodes[0] === code1 && r.ingredientCodes[1] === code2) ||
      (r.ingredientCodes[0] === code2 && r.ingredientCodes[1] === code1)
  );
}
