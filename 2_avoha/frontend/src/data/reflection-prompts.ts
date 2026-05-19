// 자기회고 동적 질문 — 주간 감정 분석 결과에 따라 카테고리별로 다른 질문을 띄운다.
// 카테고리별 5개 × 5계열 = 25개. 주차(week index) % 5 로 rotation 해서 매주 다른 질문.

import type { CategoryCode } from '../lib/emotion-category';

export const DYNAMIC_REFLECTION_PROMPTS: Record<CategoryCode, readonly string[]> = {
  sadness: [
    '외로움이 자주 느껴진 한 주였어요. 어떤 상황이 공통적이었나요?',
    '슬픈 감정이 올라왔던 순간, 주변에 누가 있었나요?',
    '이번 주 가장 마음이 가라앉았던 때가 언제였는지 떠올려볼 수 있나요?',
    '이 감정이 느껴질 때 가장 하고 싶었던 게 뭐였나요?',
    '슬픔이 가장 덜했던 순간이 있었다면, 그때는 어떤 상황이었나요?',
  ],
  anger: [
    '이번 주 막히거나 답답했던 순간이 많았던 것 같아요. 어떤 상황이 그랬나요?',
    '화가 올라왔을 때, 몸 어디서 먼저 느껴졌나요?',
    '이번 주 가장 억울하거나 무시당한 느낌이 들었던 때가 있었나요?',
    '분노가 느껴졌던 순간, 내가 원했던 게 뭐였는지 떠올려볼 수 있나요?',
    '그 감정이 가장 빨리 가라앉았던 때는 어떤 상황이었나요?',
  ],
  anxiety: [
    '이번 주 긴장했던 순간이 많았어요. 몸이 가장 편했던 때는 언제였나요?',
    '불안이 느껴졌을 때, 몸 어디서 가장 먼저 신호가 왔나요?',
    '이번 주 긴장이 조금 풀렸던 순간이 있었다면, 그때 뭘 하고 있었나요?',
    '불안이 가장 컸던 순간, 주변 환경이 어땠나요?',
    '이번 주 가장 안심이 됐던 순간이 언제였는지 떠올려볼 수 있나요?',
  ],
  joy: [
    '이번 주 좋았던 순간이 있었어요. 그 순간을 만든 게 뭐였나요?',
    '기분이 좋아졌을 때, 그 직전에 뭘 하고 있었나요?',
    '이번 주 가장 마음이 가벼웠던 때가 언제였는지 떠올려볼 수 있나요?',
    '좋은 감정이 느껴졌을 때, 누구랑 함께였나요? 아니면 혼자였나요?',
    '이번 주 나를 웃게 만들었던 게 뭐였나요?',
  ],
  complex: [
    '딱 잘라 말하기 어려운 감정이 많았던 한 주예요. 한 단어로 표현하면?',
    '이번 주 감정이 뒤섞인 느낌이 들었던 순간, 어떤 상황이었나요?',
    '복잡한 감정이 올라왔을 때, 몸은 어떤 상태였나요?',
    '이번 주 한 가지 감정이 아니라 여러 감정이 동시에 느껴졌던 때가 있었나요? 그게 언제였나요?',
    '이번 주 가장 정리가 안 됐던 감정을 색으로 표현하면 어떤 색인가요?',
  ],
};

// Why: Analysis.startOfWeek 가 일요일 기준이라 strict ISO(월요일 시작)와 어긋난다.
// 1970-01-04 일요일을 epoch 로 잡아 일요일마다 1씩 증가하는 stable 정수를 반환.
// 사용처는 rotation 인덱스이므로 절대값보다 "매주 1씩 증가" 가 핵심.
const SUNDAY_EPOCH_MS = new Date(1970, 0, 4).getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getWeekIndex(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - SUNDAY_EPOCH_MS) / WEEK_MS);
}

export type CategoryCounts = Record<CategoryCode, number>;

export interface DynamicMatcherInput {
  counts: CategoryCounts;
  prevCounts: CategoryCounts;
  total: number;
}

// 동시 1위 (tie) 도 인정: 슬픔/복잡이 5개로 동률이면 둘 다 1위로 본다.
function topCategoriesOf(counts: CategoryCounts): Set<CategoryCode> {
  const codes = Object.keys(counts) as CategoryCode[];
  let max = 0;
  for (const code of codes) max = Math.max(max, counts[code]);
  if (max === 0) return new Set();
  return new Set(codes.filter((c) => counts[c] === max));
}

// 카테고리 조건 매처. 5개 카테고리 각자 독립 조건을 가지므로 여러 개가 동시에 만족될 수 있다.
// 호출부에서 hits 중 랜덤 1개를 선택.
export function pickDynamicCategories(input: DynamicMatcherInput): CategoryCode[] {
  const { counts, prevCounts, total } = input;
  const tops = topCategoriesOf(counts);
  const hits: CategoryCode[] = [];

  if (tops.has('sadness')) hits.push('sadness');
  if (counts.anger - prevCounts.anger >= 4) hits.push('anger');
  if (total > 0 && counts.anxiety / total >= 0.5) hits.push('anxiety');
  if (counts.joy >= 2) hits.push('joy');
  if (tops.has('complex')) hits.push('complex');

  return hits;
}

export function pickDynamicQuestion(category: CategoryCode, weekIndex: number): string {
  const list = DYNAMIC_REFLECTION_PROMPTS[category];
  const len = list.length;
  const idx = ((weekIndex % len) + len) % len;
  return list[idx];
}

// 충족된 hits 중 최종 카테고리 선택.
// Why: 화면에 "주 감정 = 복잡" 으로 표시되는데 자기회고가 기쁨 질문이면 인지부조화.
// preferred(주 감정 1위)가 hits 안에 있으면 그걸 우선, 아니면 hits 중 랜덤.
export function chooseDynamicCategory(
  hits: readonly CategoryCode[],
  preferred: CategoryCode | null | undefined,
): CategoryCode | null {
  if (hits.length === 0) return null;
  if (preferred && hits.includes(preferred)) return preferred;
  return hits[Math.floor(Math.random() * hits.length)];
}
