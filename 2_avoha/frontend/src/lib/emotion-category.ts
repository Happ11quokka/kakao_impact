// 5대 감정 카테고리 — Home/Analysis 공용
// raw emotion code(BE 시드 10종) → UI 카테고리(5종) 매핑의 단일 진실 원본.
// Why: 두 화면이 분기 로직을 각자 들고 있다가 serenity/untroubled가
//      Home에서만 카운팅 누락되던 버그가 있었음.

export type CategoryCode = 'sadness' | 'anxiety' | 'anger' | 'joy' | 'complex';

export function emotionToCategory(code: string): CategoryCode {
  if (code === 'unclassified') return 'complex';
  if (code === 'sadness') return 'sadness';
  if (code === 'annoyance') return 'anger';
  if (code === 'joy' || code === 'pride' || code === 'satisfaction' || code === 'flutter') return 'joy';
  // calm 계열(serenity/untroubled) + 혼합 부정(regret/solace) → complex
  // anxiety 카테고리에 매핑되는 raw code는 현재 시드에 없음 (디자인 슬롯만 존재).
  return 'complex';
}
