import { describe, expect, it } from 'vitest';
import {
  buildActiveRecordGemBadges,
  buildHomeLakeCircleStyle,
  buildHomeLakeStageStyle,
  buildHomeJoystickStyle,
  buildHomeStoneGemLayout,
  buildTodayCategoryGemSlots,
  clampMascotPositionToLake,
  needsLakeReview,
} from './Home';
import type { RecordDto } from '../lib/api';

const baseRecord: RecordDto = {
  id: 1,
  gem: '일상기록',
  recordText: '오늘 남긴 감정 기록',
  hasPhoto: false,
  imageUrl: null,
  aiGems: null,
  createdAt: '2026-05-19T09:30:00.000Z',
  entryMode: 'plain_record',
  classificationStatus: 'needs_confirmation',
  aiEmotionCode: 'regret',
  confirmedEmotionCode: null,
  confirmedEmotionCodes: [],
  confirmedAt: null,
  webReviewedAt: null,
  updatedAt: '2026-05-19T09:30:00.000Z',
  gemId: null,
  gemEmotionCode: null,
};

const today = new Date('2026-05-19T12:00:00.000Z');

function makeConfirmed(overrides: Partial<RecordDto> & { id: number; codes: string[] }): RecordDto {
  const stamp = overrides.createdAt ?? '2026-05-19T10:00:00.000Z';
  return {
    ...baseRecord,
    id: overrides.id,
    createdAt: stamp,
    updatedAt: stamp,
    classificationStatus: 'user_confirmed',
    confirmedEmotionCode: overrides.codes[0],
    confirmedEmotionCodes: overrides.codes,
    gemEmotionCode: overrides.codes[0],
    gemId: `gem-${overrides.id}`,
    confirmedAt: stamp,
    webReviewedAt: stamp, // 웹에서 수집/재분류 완료 = 오늘의 원석함 진입 자격
  };
}

describe('Home today category gem slots', () => {
  it('always returns one slot per category, defaulting to count 0', () => {
    const slots = buildTodayCategoryGemSlots([], today);
    expect(slots.map((slot) => slot.category).sort()).toEqual(
      ['anger', 'anxiety', 'complex', 'joy', 'sadness'],
    );
    expect(slots.every((slot) => slot.count === 0)).toBe(true);
    expect(slots.every((slot) => slot.records.length === 0)).toBe(true);
  });

  it('excludes unconfirmed records from category counts', () => {
    const slots = buildTodayCategoryGemSlots([baseRecord], today);
    const joy = slots.find((slot) => slot.category === 'joy');
    expect(joy?.count).toBe(0);
  });

  it('keeps chatbot-confirmed records out of the gem box until webReviewedAt is set', () => {
    const fresh: RecordDto = {
      ...baseRecord,
      id: 99,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      gemEmotionCode: 'joy',
      webReviewedAt: null,
    };
    const slots = buildTodayCategoryGemSlots([fresh], today);
    expect(slots.find((slot) => slot.category === 'joy')?.count).toBe(0);
  });

  it('counts records once user confirms them on the web (webReviewedAt set)', () => {
    const collected = makeConfirmed({ id: 100, codes: ['joy'] });
    const slots = buildTodayCategoryGemSlots([collected], today);
    expect(slots.find((slot) => slot.category === 'joy')?.count).toBe(1);
  });

  it('deduplicates within a single record so joy + pride counts as joy ×1', () => {
    const record = makeConfirmed({ id: 2, codes: ['joy', 'pride'] });
    const slots = buildTodayCategoryGemSlots([record], today);
    const joy = slots.find((slot) => slot.category === 'joy');
    expect(joy?.count).toBe(1);
    expect(joy?.records).toEqual([record]);
  });

  it('counts detailed chatbot gem badges separately even when they share one representative category', () => {
    const record = {
      ...makeConfirmed({ id: 22, codes: ['regret'] }),
      detailedEmotionBadges: [
        { code: 'regret', label: '혼란스러움', gem: '혼란스러움 조각' },
        { code: 'regret', label: '후회', gem: '후회 조각' },
      ],
    };
    const slots = buildTodayCategoryGemSlots([record], today);
    const complex = slots.find((slot) => slot.category === 'complex');
    expect(complex?.count).toBe(2);
    expect(complex?.records).toEqual([record, record]);
  });

  it('spreads multi-category emotions across categories', () => {
    const record = makeConfirmed({ id: 3, codes: ['joy', 'sadness'] });
    const slots = buildTodayCategoryGemSlots([record], today);
    expect(slots.find((s) => s.category === 'joy')?.count).toBe(1);
    expect(slots.find((s) => s.category === 'sadness')?.count).toBe(1);
  });

  it('sorts by count desc, breaking ties in joy → sadness → anger → anxiety → complex order', () => {
    const records = [
      makeConfirmed({ id: 10, codes: ['joy'], createdAt: '2026-05-19T09:00:00.000Z' }),
      makeConfirmed({ id: 11, codes: ['sadness'], createdAt: '2026-05-19T09:10:00.000Z' }),
      makeConfirmed({ id: 12, codes: ['annoyance'], createdAt: '2026-05-19T09:20:00.000Z' }),
      makeConfirmed({ id: 13, codes: ['joy'], createdAt: '2026-05-19T09:30:00.000Z' }),
    ];
    const slots = buildTodayCategoryGemSlots(records, today);
    expect(slots.map((slot) => slot.category)).toEqual([
      'joy',
      'sadness',
      'anger',
      'anxiety',
      'complex',
    ]);
    expect(slots.map((slot) => slot.count)).toEqual([2, 1, 1, 0, 0]);
  });

  it('orders records within a category by createdAt ascending', () => {
    const records = [
      makeConfirmed({ id: 20, codes: ['joy'], createdAt: '2026-05-19T11:00:00.000Z' }),
      makeConfirmed({ id: 21, codes: ['joy'], createdAt: '2026-05-19T03:00:00.000Z' }),
    ];
    const slots = buildTodayCategoryGemSlots(records, today);
    const joy = slots.find((slot) => slot.category === 'joy');
    expect(joy?.records.map((r) => r.id)).toEqual([21, 20]);
  });
});

describe('needsLakeReview', () => {
  it('keeps needs_confirmation records in the lake', () => {
    expect(needsLakeReview(baseRecord)).toBe(true);
  });

  it('keeps user_confirmed records without webReviewedAt in the lake (chatbot fresh insert)', () => {
    const fresh: RecordDto = {
      ...baseRecord,
      classificationStatus: 'user_confirmed',
      webReviewedAt: null,
    };
    expect(needsLakeReview(fresh)).toBe(true);
  });

  it('drops records out of the lake once user reviewed them on the web', () => {
    const collected = makeConfirmed({ id: 1, codes: ['joy'] });
    expect(needsLakeReview(collected)).toBe(false);
  });
});

describe('Home stone + active record helpers', () => {
  it('lays out multi-emotion home stones inside one circle without overlap', () => {
    const layout = buildHomeStoneGemLayout(['joy', 'pride', 'flutter']);

    expect(layout).toEqual([
      { code: 'joy', x: -9, y: 4, size: 16 },
      { code: 'pride', x: 9, y: 4, size: 16 },
      { code: 'flutter', x: 0, y: -10, size: 16 },
    ]);
    layout.forEach((item, index) => {
      layout.slice(index + 1).forEach((next) => {
        const centerDistance = Math.hypot(item.x - next.x, item.y - next.y);
        expect(centerDistance).toBeGreaterThanOrEqual(Math.max(item.size, next.size));
      });
    });
  });

  it('keeps the lake clipped but places the joystick outside the circle on a visible stage', () => {
    expect(buildHomeLakeCircleStyle().overflow).toBe('hidden');
    expect(buildHomeLakeStageStyle()).toMatchObject({
      position: 'relative',
      width: 304,
      height: 304,
      overflow: 'visible',
    });
    expect(buildHomeJoystickStyle()).toMatchObject({
      right: -14,
      bottom: -14,
    });
  });

  it('clamps the mascot center far enough inside the circular lake to keep the full avatar visible', () => {
    expect(clampMascotPositionToLake({ x: 98, y: 50 }).x).toBeLessThanOrEqual(91);
    expect(clampMascotPositionToLake({ x: 50, y: 98 }).y).toBeLessThanOrEqual(91);
    const corner = clampMascotPositionToLake({ x: 98, y: 98 });
    expect(Math.hypot(corner.x - 50, corner.y - 50)).toBeLessThanOrEqual(41);
  });

  it('builds all confirmed emotion badges for the active recap sheet', () => {
    const multiEmotionRecord: RecordDto = {
      ...baseRecord,
      id: 4,
      classificationStatus: 'user_confirmed',
      confirmedEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy', 'pride', 'flutter'],
      gemEmotionCode: 'joy',
      gemId: 'gem-joy',
    };

    expect(buildActiveRecordGemBadges(multiEmotionRecord)).toEqual([
      { code: 'joy', label: '기쁨' },
      { code: 'pride', label: '뿌듯' },
      { code: 'flutter', label: '설렘' },
    ]);
  });

  it('uses original chatbot gem labels in the active recap sheet', () => {
    const detailedRecord = {
      ...baseRecord,
      id: 5,
      classificationStatus: 'user_confirmed' as const,
      confirmedEmotionCode: 'regret',
      confirmedEmotionCodes: ['regret'],
      gemEmotionCode: 'regret',
      gemId: 'gem-regret',
      detailedEmotionBadges: [
        { code: 'regret', label: '혼란스러움', gem: '혼란스러움 조각' },
        { code: 'regret', label: '후회', gem: '후회 조각' },
      ],
    };

    expect(buildActiveRecordGemBadges(detailedRecord)).toEqual([
      { code: 'regret', label: '혼란스러움' },
      { code: 'regret', label: '후회' },
    ]);
  });
});
