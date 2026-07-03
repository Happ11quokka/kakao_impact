import { describe, expect, it } from 'vitest';
import {
  DYNAMIC_REFLECTION_PROMPTS,
  chooseDynamicCategory,
  getWeekIndex,
  pickDynamicCategories,
  pickDynamicQuestion,
  type CategoryCounts,
} from './reflection-prompts';

const ZERO: CategoryCounts = { sadness: 0, anger: 0, anxiety: 0, joy: 0, complex: 0 };

const counts = (overrides: Partial<CategoryCounts>): CategoryCounts => ({ ...ZERO, ...overrides });

describe('DYNAMIC_REFLECTION_PROMPTS', () => {
  it('has exactly 5 questions per category', () => {
    expect(DYNAMIC_REFLECTION_PROMPTS.sadness).toHaveLength(5);
    expect(DYNAMIC_REFLECTION_PROMPTS.anger).toHaveLength(5);
    expect(DYNAMIC_REFLECTION_PROMPTS.anxiety).toHaveLength(5);
    expect(DYNAMIC_REFLECTION_PROMPTS.joy).toHaveLength(5);
    expect(DYNAMIC_REFLECTION_PROMPTS.complex).toHaveLength(5);
  });

  it('contains non-empty Korean prompts', () => {
    for (const list of Object.values(DYNAMIC_REFLECTION_PROMPTS)) {
      for (const q of list) {
        expect(q.length).toBeGreaterThan(5);
        expect(q.endsWith('?')).toBe(true);
      }
    }
  });
});

describe('getWeekIndex', () => {
  it('advances by 1 each week', () => {
    const sunday = new Date('2026-05-17T00:00:00.000');
    const nextSunday = new Date('2026-05-24T00:00:00.000');
    expect(getWeekIndex(nextSunday) - getWeekIndex(sunday)).toBe(1);
  });

  it('returns the same index for all days within one Sun-Sat week', () => {
    const sun = getWeekIndex(new Date('2026-05-17T03:00:00.000'));
    const wed = getWeekIndex(new Date('2026-05-20T15:00:00.000'));
    const sat = getWeekIndex(new Date('2026-05-23T23:00:00.000'));
    expect(wed).toBe(sun);
    expect(sat).toBe(sun);
  });

  it('rolls to a new index on Sunday boundary', () => {
    const satNight = getWeekIndex(new Date('2026-05-23T23:59:59.999'));
    const sunMorning = getWeekIndex(new Date('2026-05-24T00:00:00.000'));
    expect(sunMorning - satNight).toBe(1);
  });
});

describe('pickDynamicCategories', () => {
  it('returns [] when no condition is met', () => {
    // 분노가 1위지만 전주 대비 증가 < 4, anxiety < 50%, joy < 2, sadness/complex 미상위
    // → 어떤 조건도 트리거되지 않음.
    expect(
      pickDynamicCategories({
        counts: counts({ anger: 3, joy: 1 }),
        prevCounts: counts({ anger: 1 }),
        total: 4,
      }),
    ).toEqual([]);
  });

  it('triggers sadness when sadness is the strict top category', () => {
    const hits = pickDynamicCategories({
      counts: counts({ sadness: 5, joy: 1 }),
      prevCounts: ZERO,
      total: 6,
    });
    expect(hits).toContain('sadness');
  });

  it('triggers anger when anger increased by >= 4 vs prev week', () => {
    const hits = pickDynamicCategories({
      counts: counts({ anger: 5, complex: 1 }),
      prevCounts: counts({ anger: 1 }),
      total: 6,
    });
    expect(hits).toContain('anger');
  });

  it('does NOT trigger anger when increase is only 3', () => {
    const hits = pickDynamicCategories({
      counts: counts({ anger: 4 }),
      prevCounts: counts({ anger: 1 }),
      total: 4,
    });
    expect(hits).not.toContain('anger');
  });

  it('triggers anxiety when anxiety share >= 50%', () => {
    const hits = pickDynamicCategories({
      counts: counts({ anxiety: 6, joy: 4, complex: 2 }),
      prevCounts: ZERO,
      total: 12,
    });
    expect(hits).toContain('anxiety');
  });

  it('does NOT trigger anxiety at < 50%', () => {
    const hits = pickDynamicCategories({
      counts: counts({ anxiety: 5, joy: 4, complex: 2 }),
      prevCounts: ZERO,
      total: 11,
    });
    expect(hits).not.toContain('anxiety');
  });

  it('triggers joy at >= 2', () => {
    const hits = pickDynamicCategories({
      counts: counts({ joy: 2, complex: 1 }),
      prevCounts: ZERO,
      total: 3,
    });
    expect(hits).toContain('joy');
  });

  it('triggers complex when complex is the top category', () => {
    const hits = pickDynamicCategories({
      counts: counts({ complex: 4, sadness: 1 }),
      prevCounts: ZERO,
      total: 5,
    });
    expect(hits).toContain('complex');
  });

  it('triggers both sadness and complex on a tie at top', () => {
    const hits = pickDynamicCategories({
      counts: counts({ sadness: 3, complex: 3, joy: 1 }),
      prevCounts: ZERO,
      total: 7,
    });
    expect(hits).toContain('sadness');
    expect(hits).toContain('complex');
  });

  it('can trigger multiple categories at once', () => {
    const hits = pickDynamicCategories({
      counts: counts({ sadness: 5, joy: 2, anger: 4 }),
      prevCounts: counts({ anger: 0 }),
      total: 11,
    });
    expect(hits).toEqual(expect.arrayContaining(['sadness', 'anger', 'joy']));
  });

  it('ignores anxiety share when total is 0', () => {
    const hits = pickDynamicCategories({
      counts: ZERO,
      prevCounts: ZERO,
      total: 0,
    });
    expect(hits).not.toContain('anxiety');
  });
});

describe('pickDynamicQuestion', () => {
  it('returns deterministic question for a given (category, weekIndex)', () => {
    expect(pickDynamicQuestion('sadness', 0)).toBe(DYNAMIC_REFLECTION_PROMPTS.sadness[0]);
    expect(pickDynamicQuestion('sadness', 5)).toBe(DYNAMIC_REFLECTION_PROMPTS.sadness[0]);
    expect(pickDynamicQuestion('sadness', 6)).toBe(DYNAMIC_REFLECTION_PROMPTS.sadness[1]);
  });

  it('handles negative week index via modulo wrap', () => {
    expect(pickDynamicQuestion('joy', -1)).toBe(DYNAMIC_REFLECTION_PROMPTS.joy[4]);
  });
});

describe('chooseDynamicCategory', () => {
  it('returns null on empty hits', () => {
    expect(chooseDynamicCategory([], 'complex')).toBeNull();
  });

  it('prefers preferred category when it is in hits', () => {
    expect(chooseDynamicCategory(['joy', 'complex'], 'complex')).toBe('complex');
    expect(chooseDynamicCategory(['sadness', 'joy'], 'sadness')).toBe('sadness');
  });

  it('falls back to single hit when preferred is missing or not in hits', () => {
    expect(chooseDynamicCategory(['anger'], 'complex')).toBe('anger');
    expect(chooseDynamicCategory(['joy'], null)).toBe('joy');
    expect(chooseDynamicCategory(['joy'], undefined)).toBe('joy');
  });
});
