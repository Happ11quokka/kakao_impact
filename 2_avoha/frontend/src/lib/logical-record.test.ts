import { describe, expect, it } from 'vitest';
import {
  dedupeLogicalRecords,
  logicalKeyForRecord,
  logicalKeyForChatbotRecord,
} from './logical-record';
import type { ChatbotRecordDto, RecordDto } from './api';

function makeRecord(overrides: Partial<RecordDto> & { id: number }): RecordDto {
  return {
    id: overrides.id,
    gem: overrides.gem ?? '기쁨 원석',
    recordText: overrides.recordText ?? '오늘 산책했다.',
    hasPhoto: overrides.hasPhoto ?? false,
    imageUrl: overrides.imageUrl ?? null,
    aiGems: overrides.aiGems ?? null,
    createdAt: overrides.createdAt ?? '2026-05-19T09:00:00.000Z',
    entryMode: overrides.entryMode ?? 'emotion_classification',
    classificationStatus: overrides.classificationStatus ?? 'user_confirmed',
    aiEmotionCode: overrides.aiEmotionCode ?? null,
    confirmedEmotionCode: overrides.confirmedEmotionCode ?? null,
    confirmedEmotionCodes: overrides.confirmedEmotionCodes ?? [],
    confirmedAt: overrides.confirmedAt ?? null,
    webReviewedAt: overrides.webReviewedAt ?? null,
    updatedAt: overrides.updatedAt ?? '2026-05-19T09:00:00.000Z',
    gemId: overrides.gemId ?? null,
    gemEmotionCode: overrides.gemEmotionCode ?? null,
    ...overrides,
  };
}

describe('dedupeLogicalRecords', () => {
  it('keeps records with different text/photo as separate logical records', () => {
    const a = makeRecord({ id: 1, recordText: 'A', gemEmotionCode: 'joy' });
    const b = makeRecord({ id: 2, recordText: 'B', gemEmotionCode: 'sadness' });
    const result = dedupeLogicalRecords([a, b]);
    expect(result).toHaveLength(2);
  });

  it('merges sibling rows that share text + photo + time bucket into one record', () => {
    const sibling1 = makeRecord({
      id: 10,
      recordText: '카페에서 행복',
      gemEmotionCode: 'joy',
      confirmedEmotionCodes: ['joy'],
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const sibling2 = makeRecord({
      id: 11,
      recordText: '카페에서 행복',
      gemEmotionCode: 'satisfaction',
      confirmedEmotionCodes: ['satisfaction'],
      createdAt: '2026-05-19T09:00:02.000Z',
    });
    const sibling3 = makeRecord({
      id: 12,
      recordText: '카페에서 행복',
      gemEmotionCode: 'flutter',
      confirmedEmotionCodes: ['flutter'],
      createdAt: '2026-05-19T09:00:03.000Z',
    });
    const result = dedupeLogicalRecords([sibling2, sibling3, sibling1]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(10);
    expect(result[0].confirmedEmotionCodes).toEqual(['joy', 'satisfaction', 'flutter']);
  });

  it('treats records with empty text and no photo individually even at the same time', () => {
    const a = makeRecord({
      id: 1,
      recordText: '',
      hasPhoto: false,
      imageUrl: null,
      createdAt: '2026-05-19T09:00:00.000Z',
    });
    const b = makeRecord({
      id: 2,
      recordText: '',
      hasPhoto: false,
      imageUrl: null,
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const result = dedupeLogicalRecords([a, b]);
    expect(result).toHaveLength(2);
  });

  it('groups by photo URL when text is empty but a photo is attached', () => {
    const a = makeRecord({
      id: 5,
      recordText: '',
      hasPhoto: true,
      imageUrl: 'https://example.com/p.jpg',
      gemEmotionCode: 'joy',
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const b = makeRecord({
      id: 6,
      recordText: '',
      hasPhoto: true,
      imageUrl: 'https://example.com/p.jpg',
      gemEmotionCode: 'pride',
      createdAt: '2026-05-19T09:00:02.000Z',
    });
    const result = dedupeLogicalRecords([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].confirmedEmotionCodes).toEqual(['joy', 'pride']);
  });
});

describe('logicalKey helpers', () => {
  it('returns equal keys for RecordDto and ChatbotRecordDto siblings with the same content', () => {
    const record: RecordDto = makeRecord({
      id: 1,
      recordText: '같은 메시지',
      hasPhoto: false,
      createdAt: '2026-05-19T09:00:01.000Z',
    });
    const chatbot: ChatbotRecordDto = {
      id: 99,
      gem: '기쁨 원석',
      recordText: '같은 메시지',
      hasPhoto: false,
      imageUrl: null,
      aiGems: null,
      createdAt: '2026-05-19T09:00:05.000Z',
    };
    expect(logicalKeyForRecord(record)).toBe(logicalKeyForChatbotRecord(chatbot));
  });
});
