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

// 챗봇은 "걱정/긴장감/위축감 조각" 같은 gem name 으로 anxiety 류 감정을 잡지만
// emotion_code 단계에서는 모두 solace 로 합쳐져 anxiety 카테고리에 못 들어온다.
// 자기회고 동적 질문에서 anxiety 조건을 동작시키기 위한 가벼운 프론트 보정.
const ANXIETY_GEM_NAME_PATTERNS = ['걱정', '긴장', '위축', '초조', '공포', '불안'];

export function categoryFromGemName(gemName: string | null | undefined): CategoryCode | null {
  if (!gemName) return null;
  return ANXIETY_GEM_NAME_PATTERNS.some((p) => gemName.includes(p)) ? 'anxiety' : null;
}

// emotion code 가 1차 신호이지만, gem name 으로 anxiety 가 잡히면 우선 반영.
export function resolveCategory(code: string, gemName?: string | null): CategoryCode {
  const fromName = categoryFromGemName(gemName);
  if (fromName) return fromName;
  return emotionToCategory(code);
}
