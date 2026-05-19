import { describe, expect, it } from 'vitest';
import { categoryFromGemName, emotionToCategory, resolveCategory } from './emotion-category';

describe('emotionToCategory', () => {
  it('maps single-emotion codes to their UI category', () => {
    expect(emotionToCategory('sadness')).toBe('sadness');
    expect(emotionToCategory('annoyance')).toBe('anger');
    expect(emotionToCategory('joy')).toBe('joy');
    expect(emotionToCategory('pride')).toBe('joy');
    expect(emotionToCategory('flutter')).toBe('joy');
  });

  it('falls back to complex for calm + 혼합 부정 + unknown codes', () => {
    expect(emotionToCategory('serenity')).toBe('complex');
    expect(emotionToCategory('untroubled')).toBe('complex');
    expect(emotionToCategory('regret')).toBe('complex');
    expect(emotionToCategory('solace')).toBe('complex');
    expect(emotionToCategory('unclassified')).toBe('complex');
    expect(emotionToCategory('unknown')).toBe('complex');
  });
});

describe('categoryFromGemName', () => {
  it('matches anxiety-leaning Korean gem names', () => {
    expect(categoryFromGemName('걱정 조각')).toBe('anxiety');
    expect(categoryFromGemName('긴장감 조각')).toBe('anxiety');
    expect(categoryFromGemName('위축감 조각')).toBe('anxiety');
    expect(categoryFromGemName('초조함 조각')).toBe('anxiety');
    expect(categoryFromGemName('공포 조각')).toBe('anxiety');
    expect(categoryFromGemName('불안 조각')).toBe('anxiety');
  });

  it('returns null for non-anxiety names', () => {
    expect(categoryFromGemName('기쁨 원석')).toBeNull();
    expect(categoryFromGemName('우울함 조각')).toBeNull();
    expect(categoryFromGemName('짜증 조각')).toBeNull();
    expect(categoryFromGemName(null)).toBeNull();
    expect(categoryFromGemName(undefined)).toBeNull();
    expect(categoryFromGemName('')).toBeNull();
  });
});

describe('resolveCategory', () => {
  it('uses gem name to override emotion code when anxiety pattern matches', () => {
    // solace 는 평소 complex 로 떨어지지만 gem name 이 anxiety 류면 anxiety 로 보정.
    expect(resolveCategory('solace', '걱정 조각')).toBe('anxiety');
    expect(resolveCategory('solace', '긴장감 조각')).toBe('anxiety');
  });

  it('falls through to emotionToCategory when gem name is non-anxiety or missing', () => {
    expect(resolveCategory('solace', '공허함 조각')).toBe('complex');
    expect(resolveCategory('joy', '기쁨 원석')).toBe('joy');
    expect(resolveCategory('sadness', null)).toBe('sadness');
    expect(resolveCategory('annoyance', undefined)).toBe('anger');
  });
});
