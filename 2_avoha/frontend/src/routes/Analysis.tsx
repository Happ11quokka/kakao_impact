// === Analysis 화면 — 상단 2박스 요약 + 패턴 아코디언 + 카테고리별 풀스크린 리캡 ===
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import { useRecordsStore } from '../stores/records-store';
import type { Gem } from '../types/gem';
import { api, type ChatbotRecordDto } from '../lib/api';
import { getEmotion } from '../data/emotions';
import { emotionToCategory, resolveCategory, type CategoryCode } from '../lib/emotion-category';
import { EMOTION_VARIANTS_BY_CATEGORY } from '../data/emotion-variants';
import {
  chooseDynamicCategory,
  getWeekIndex,
  pickDynamicCategories,
  pickDynamicQuestion,
  type CategoryCounts,
} from '../data/reflection-prompts';
import GemStone from '../components/pixel/GemStone';
import PhotoLightbox from '../components/PhotoLightbox';
import { logicalKeyForChatbotRecord } from '../lib/logical-record';

export type Period = 'weekly' | 'monthly' | 'custom';

export type CustomRange = {
  start: string;
  end: string;
};

type Category = {
  code: CategoryCode;
  label: string;
  color: string;
  soft: string;
  details: string[];
};

export type AnalysisItem = {
  id: string;
  emotionCode: string;
  category: CategoryCode;
  label: string;
  color: string;
  createdAt: string;
  recordText?: string | null;
  imageUrl?: string | null;
  hasPhoto?: boolean;
  sourceMessageId?: string;
  sourceChatbotId?: number;
  logicalKey?: string;
  emotionBadges?: Array<{ code: string; label: string }>;
};

export type RecapTheme = {
  id: string;
  category: CategoryCode;
  title: string;
  caption: string;
  tone: string;
  records: AnalysisItem[];
};

export type ReflectionPrompt = {
  source: 'dynamic' | 'unanswered' | 'answered' | 'static';
  question: string;
  answer?: string | null;
};

const CATEGORIES: Category[] = [
  { code: 'sadness', label: '슬픔', color: '#58728E', soft: '#DDE5EC', details: [...EMOTION_VARIANTS_BY_CATEGORY.sadness] },
  { code: 'anger', label: '분노', color: '#914640', soft: '#EBDDD9', details: [...EMOTION_VARIANTS_BY_CATEGORY.anger] },
  { code: 'anxiety', label: '불안', color: '#B8C7D8', soft: '#E7EDF2', details: [...EMOTION_VARIANTS_BY_CATEGORY.anxiety] },
  { code: 'joy', label: '기쁨', color: '#D4B84E', soft: '#F1E8BD', details: [...EMOTION_VARIANTS_BY_CATEGORY.joy] },
  { code: 'complex', label: '복잡', color: '#3D3A34', soft: '#E2DFD8', details: [...EMOTION_VARIANTS_BY_CATEGORY.complex] },
];

const CATEGORY_BY_CODE = Object.fromEntries(CATEGORIES.map((category) => [category.code, category])) as Record<CategoryCode, Category>;

// 5계열 대표 BE emotion code — GemStone 렌더용 단일 진실 원본.
const REPRESENTATIVE_EMOTION_BY_CATEGORY: Record<CategoryCode, string> = {
  sadness: 'sadness',
  anger: 'annoyance',
  anxiety: 'solace',
  joy: 'joy',
  complex: 'regret',
};

// 리캡 슬라이드 정렬: 긍정 → 부정 순.
const RECAP_ORDER: CategoryCode[] = ['joy', 'sadness', 'anger', 'anxiety', 'complex'];

// 리캡 슬라이드 카피.
const RECAP_TITLE: Record<CategoryCode, string> = {
  joy: '웃음이 가장 많았던 순간이에요',
  sadness: '위로가 필요했던 순간이에요',
  anger: '마음이 들끓었던 순간이에요',
  anxiety: '마음이 조였던 순간이에요',
  complex: '마음이 복잡했던 순간이에요',
};

// 자기회고 prompt — 기간 내 질문 데이터가 없을 때 fallback.
const STATIC_REFLECTION_PROMPTS = [
  '이번 기간을 한 줄로 표현한다면 어떤 문장일까요?',
  '다시 만나고 싶은 순간이 있었다면 언제였나요?',
  '내일의 나에게 짧은 메모를 남긴다면?',
];

export function buildAnalysisReflectionSubmitStyle(disabled: boolean): CSSProperties {
  return {
    background: '#2F5F46',
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? 'default' : 'pointer',
  };
}

// 기간 라벨: weekly → "6월 2주차" (달력 일요일 시작 기준 몇째 주), monthly → "2026-06"
// (YYYY-MM), custom → 시작~종료 날짜 범위. 주차는 그 달 1일의 요일을 더해 7로 나눈
// 올림값으로, Calendar 의 일요일 시작 달력 행 번호와 동일하게 계산한다.
export function formatAnalysisPeriodLabel(period: Period, today: Date, customRange?: CustomRange): string {
  if (period === 'monthly') return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (period === 'custom') {
    return customRange ? `${customRange.start} ~ ${customRange.end}` : '';
  }
  const firstWeekday = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const weekOfMonth = Math.ceil((today.getDate() + firstWeekday) / 7);
  return `${today.getMonth() + 1}월 ${weekOfMonth}주차`;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function detailForItem(code: string, index: number): string {
  const category = CATEGORY_BY_CODE[emotionToCategory(code)];
  const known = getEmotion(code)?.nameKo;
  if (known && known !== category.label) return known;
  return category.details[index % category.details.length];
}

function labelFromChatbotGem(gem: string | null | undefined): string | null {
  const normalized = (gem ?? '').trim();
  if (!normalized || normalized === '일상기록' || normalized === '단순기록') return null;
  return normalized.replace(/\s*(조각|원석)$/, '');
}

export function dateInAnalysisPeriod(date: Date, period: Period, today: Date, customRange?: CustomRange): boolean {
  if (period === 'weekly') {
    const start = startOfWeek(today).getTime();
    const end = start + 7 * 24 * 60 * 60 * 1000;
    return date.getTime() >= start && date.getTime() < end;
  }
  if (period === 'monthly') {
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  }
  if (customRange?.start && customRange?.end) {
    const start = new Date(`${customRange.start}T00:00:00.000Z`);
    const end = new Date(`${customRange.end}T23:59:59.999Z`);
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
  }
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - 13);
  return date.getTime() >= start.getTime() && date.getTime() <= today.getTime();
}

function gemToItem(gem: Gem, index: number): AnalysisItem {
  const category = emotionToCategory(gem.emotionCode);
  const emotion = getEmotion(gem.emotionCode);
  return {
    id: gem.id,
    emotionCode: gem.emotionCode,
    category,
    label: detailForItem(gem.emotionCode, index),
    color: emotion?.hexColor ?? CATEGORY_BY_CODE[category].color,
    createdAt: gem.createdAt,
    recordText: gem.sourceText,
    sourceMessageId: gem.sourceMessageId,
    sourceChatbotId: gem.sourceChatbotId,
  };
}

function recordToDataByDate(records: ChatbotRecordDto[]): Record<string, Pick<ChatbotRecordDto, 'recordText' | 'imageUrl' | 'hasPhoto'>> {
  const byDate: Record<string, Pick<ChatbotRecordDto, 'recordText' | 'imageUrl' | 'hasPhoto'>> = {};
  records.forEach((record) => {
    if (!record.recordText && !record.imageUrl) return;
    const key = toDateKey(new Date(record.createdAt));
    if (!byDate[key]) {
      byDate[key] = {
        recordText: record.recordText,
        imageUrl: record.imageUrl,
        hasPhoto: record.hasPhoto,
      };
    }
  });
  return byDate;
}

export function buildAnalysisItems(
  gems: Gem[],
  records: ChatbotRecordDto[],
  period: Period,
  today: Date,
  customRange?: CustomRange,
): AnalysisItem[] {
  const recordDataByDate = recordToDataByDate(records);
  const recordsBySourceMessageId = new Map<string, ChatbotRecordDto>();
  for (const record of records) {
    recordsBySourceMessageId.set(String(record.id), record);
  }
  const filteredItems = gems
    .map(gemToItem)
    .filter((item) => dateInAnalysisPeriod(new Date(item.createdAt), period, today, customRange));

  const itemsWithRecord = filteredItems.map((item) => {
    const sourceRecord = item.sourceChatbotId !== undefined
      ? recordsBySourceMessageId.get(String(item.sourceChatbotId))
      : item.sourceMessageId
        ? recordsBySourceMessageId.get(item.sourceMessageId)
        : undefined;
    const dateRecord = recordDataByDate[toDateKey(new Date(item.createdAt))];
    const recordText = item.recordText ?? sourceRecord?.recordText ?? dateRecord?.recordText ?? null;
    const imageUrl = sourceRecord?.imageUrl ?? dateRecord?.imageUrl ?? null;
    const hasPhoto = sourceRecord?.hasPhoto ?? dateRecord?.hasPhoto ?? false;
    const logicalKey = sourceRecord
      ? logicalKeyForChatbotRecord(sourceRecord)
      : item.sourceChatbotId !== undefined
        ? `chatbot|${item.sourceChatbotId}`
        : item.sourceMessageId
          ? `msg|${item.sourceMessageId}`
        : `solo|${item.id}`;
    return {
      ...item,
      label: item.sourceChatbotId !== undefined ? labelFromChatbotGem(sourceRecord?.gem) ?? item.label : item.label,
      recordText,
      imageUrl,
      hasPhoto,
      logicalKey,
    };
  });

  const badgesByLogicalKey = itemsWithRecord.reduce<Record<string, Array<{ code: string; label: string }>>>((acc, item) => {
    const key = item.logicalKey ?? `solo|${item.id}`;
    if (!acc[key]) acc[key] = [];
    const label = item.sourceChatbotId !== undefined
      ? item.label || getEmotion(item.emotionCode)?.nameKo || item.emotionCode
      : getEmotion(item.emotionCode)?.nameKo ?? item.label;
    if (!acc[key].some((badge) => badge.code === item.emotionCode && badge.label === label)) {
      acc[key].push({ code: item.emotionCode, label });
    }
    return acc;
  }, {});

  return itemsWithRecord.map((item) => {
    const badges = item.logicalKey ? badgesByLogicalKey[item.logicalKey] : undefined;
    return {
      ...item,
      emotionBadges: badges && badges.length > 1 ? badges : undefined,
    };
  });
}

// 카테고리별 리캡 슬라이드: 긍정(joy) → 부정 순. 데이터 없는 카테고리는 스킵.
// 같은 사용자 메시지에서 비롯된 sibling 행(같은 logicalKey)은 1개의 "순간" 으로 묶고,
// 그 안의 감정 라벨들을 합쳐서(`기쁨·뿌듯`) 보여준다.
// 추가: BE가 source_message_id를 다르게 발급해도 (같은 날 같은 텍스트/사진) 같은
// 순간으로 인지되도록 (날짜+텍스트+사진) 기반 fallback 키를 우선 사용. logicalKey 매칭이
// gem<->record id 스페이스 차이로 실패해서 dateRecord fallback 텍스트가 중복 노출되던 버그를 막음.
function recapGroupKey(item: AnalysisItem): string {
  const text = item.recordText?.trim();
  const day = toDateKey(new Date(item.createdAt));
  if (text) return `txt|${day}|${text}`;
  if (item.imageUrl) return `img|${day}|${item.imageUrl}`;
  return item.logicalKey ?? item.sourceMessageId ?? String(item.id);
}

export function buildRecapThemes(items: AnalysisItem[]): RecapTheme[] {
  const itemsByLogicalKey = new Map<string, AnalysisItem[]>();
  for (const item of items) {
    const key = recapGroupKey(item);
    const bucket = itemsByLogicalKey.get(key);
    if (bucket) bucket.push(item);
    else itemsByLogicalKey.set(key, [item]);
  }

  return RECAP_ORDER.reduce<RecapTheme[]>((acc, code) => {
    const matchingGroups = Array.from(itemsByLogicalKey.values()).filter((group) =>
      group.some((item) => item.category === code),
    );

    matchingGroups.sort((a, b) => {
      const aTime = Math.max(...a.map((it) => new Date(it.createdAt).getTime()));
      const bTime = Math.max(...b.map((it) => new Date(it.createdAt).getTime()));
      return bTime - aTime;
    });

    const records = matchingGroups.map((group) => {
      const canonical = group.find((it) => it.category === code) ?? group[0];
      const badges: Array<{ code: string; label: string }> = [];
      const seenBadges = new Set<string>();
      for (const it of group) {
        const label = it.label || getEmotion(it.emotionCode)?.nameKo || it.emotionCode;
        const badgeKey = `${it.emotionCode}||${label}`;
        if (seenBadges.has(badgeKey)) continue;
        seenBadges.add(badgeKey);
        badges.push({
          code: it.emotionCode,
          label,
        });
      }
      const combinedLabel = badges.map((badge) => badge.label).join('·');
      return {
        ...canonical,
        label: combinedLabel || canonical.label,
        emotionBadges: badges.length > 1 ? badges : undefined,
      };
    });

    if (records.length === 0) return acc;
    acc.push({
      id: `recap-${code}`,
      category: code,
      title: RECAP_TITLE[code],
      caption: `${CATEGORY_BY_CODE[code].label} 계열 ${records.length}개의 순간`,
      tone: CATEGORY_BY_CODE[code].soft,
      records,
    });
    return acc;
  }, []);
}

// 자기회고 prompt 선택: 동적 감정 질문(최우선) → 미답 → 답완 → 정적 fallback 순.
export function pickReflectionPrompt(
  records: ChatbotRecordDto[],
  options?: { dynamicQuestion?: string | null },
): ReflectionPrompt {
  const dynamic = options?.dynamicQuestion?.trim();
  if (dynamic) return { source: 'dynamic', question: dynamic };

  const withQuestion = records.filter((r) => r.questionText?.trim());
  const sortedDesc = withQuestion.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const unanswered = sortedDesc.find((r) => !r.answerText?.trim());
  if (unanswered) return { source: 'unanswered', question: unanswered.questionText!.trim() };
  const answered = sortedDesc.find((r) => r.answerText?.trim());
  if (answered) return { source: 'answered', question: answered.questionText!.trim(), answer: answered.answerText };
  const idx = Math.floor(Math.random() * STATIC_REFLECTION_PROMPTS.length);
  return { source: 'static', question: STATIC_REFLECTION_PROMPTS[idx] };
}

export default function Analysis() {
  const today = useMemo(() => new Date(), []);
  const defaultCustomRange = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - 13);
    return { start: toDateKey(start), end: toDateKey(today) };
  }, [today]);
  const [period, setPeriod] = useState<Period>('weekly');
  const [customRange, setCustomRange] = useState<CustomRange>(defaultCustomRange);
  const [selectedCategory, setSelectedCategory] = useState<CategoryCode | null>(null);
  const [activeRecapId, setActiveRecapId] = useState<string | null>(null);
  const { gems, fetchInventory } = useInventoryStore();
  const [records, setRecords] = useState<ChatbotRecordDto[]>([]);

  useEffect(() => {
    fetchInventory();
    api.chatbotRecords(200).then((res) => setRecords(res.records)).catch(() => {});
  }, [fetchInventory]);

  const items = useMemo(() => {
    return buildAnalysisItems(gems, records, period, today, period === 'custom' ? customRange : undefined);
  }, [customRange, gems, period, records, today]);

  const categoryStats = useMemo(() => {
    const total = Math.max(items.length, 1);
    return CATEGORIES.map((category) => {
      const count = items.filter((item) => item.category === category.code).length;
      return { ...category, count, pct: Math.round((count / total) * 100) };
    });
  }, [items]);

  const topCategory = useMemo(
    () => categoryStats.slice().sort((a, b) => b.count - a.count)[0] ?? CATEGORIES[0],
    [categoryStats],
  );
  const periodLabel = formatAnalysisPeriodLabel(period, today, period === 'custom' ? customRange : undefined);
  const recapThemes = useMemo(() => buildRecapThemes(items), [items]);

  // 기간 필터된 records로 reflection prompt 산출.
  const recordsInPeriod = useMemo(() => {
    return records.filter((r) =>
      dateInAnalysisPeriod(new Date(r.createdAt), period, today, period === 'custom' ? customRange : undefined),
    );
  }, [records, period, today, customRange]);

  // 주간 모드 한정 — 주 감정 분석 결과로 자기회고 질문을 동적 선택.
  // monthly/custom 은 기존 priority(미답 → 답완 → static) 유지.
  const dynamicQuestion = useMemo(() => {
    if (period !== 'weekly') return null;
    if (items.length === 0) return null;

    const startThisWeek = startOfWeek(today);
    const prevWeekToday = new Date(startThisWeek.getTime() - 1);

    const recordsBySourceId = new Map<string, ChatbotRecordDto>();
    for (const r of records) recordsBySourceId.set(String(r.id), r);

    const countWith = (arr: AnalysisItem[]): CategoryCounts => {
      const c: CategoryCounts = { sadness: 0, anger: 0, anxiety: 0, joy: 0, complex: 0 };
      for (const it of arr) {
        const gemName = it.sourceMessageId
          ? recordsBySourceId.get(it.sourceMessageId)?.gem
          : null;
        const cat = resolveCategory(it.emotionCode, gemName);
        c[cat] += 1;
      }
      return c;
    };

    const counts = countWith(items);
    const itemsPrevWeek = buildAnalysisItems(gems, records, 'weekly', prevWeekToday);
    const prevCounts = countWith(itemsPrevWeek);

    const hits = pickDynamicCategories({
      counts,
      prevCounts,
      total: items.length,
    });
    const chosen = chooseDynamicCategory(hits, topCategory.code);
    if (!chosen) return null;
    const weekIndex = getWeekIndex(today);
    return pickDynamicQuestion(chosen, weekIndex);
  }, [gems, items, period, records, today, topCategory.code]);

  const reflectionPrompt = useMemo(
    () => pickReflectionPrompt(recordsInPeriod, { dynamicQuestion }),
    [recordsInPeriod, dynamicQuestion],
  );
  const activeRecapTheme = recapThemes.find((t) => t.id === activeRecapId) ?? null;
  const [reflectionDraft, setReflectionDraft] = useState('');
  const [savingReflection, setSavingReflection] = useState(false);
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const createSelfReflection = useRecordsStore((s) => s.createSelfReflection);

  return (
    <div style={styles.screen}>
      <header style={styles.header}>
        <p style={styles.eyebrow}>{periodLabel}</p>
        <h1 style={styles.title}>감정 분석</h1>
      </header>

      <div style={styles.periodTabs} aria-label="기간 선택">
        {([
          ['weekly', '주간'],
          ['monthly', '월간'],
          ['custom', '직접'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            style={{
              ...styles.periodButton,
              background: period === value ? '#A0BCA8' : '#EDE2CC',
              color: period === value ? '#FFFFFF' : '#5A4A32',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div style={styles.customRange} aria-label="직접 기간 선택">
          <label style={styles.dateLabel}>
            시작
            <input
              type="date"
              value={customRange.start}
              max={customRange.end}
              onChange={(event) => setCustomRange((range) => ({ ...range, start: event.target.value }))}
              style={styles.dateInput}
            />
          </label>
          <label style={styles.dateLabel}>
            종료
            <input
              type="date"
              value={customRange.end}
              min={customRange.start}
              onChange={(event) => setCustomRange((range) => ({ ...range, end: event.target.value }))}
              style={styles.dateInput}
            />
          </label>
        </div>
      )}

      <main className="no-scrollbar" style={styles.content}>
        {/* 영역 1: 상단 2박스 — 원석 수 / 주 감정 */}
        <section style={styles.summaryBand} aria-label="기간 요약">
          <div style={styles.summaryStatBox}>
            <span style={styles.summaryStatLabel}>수집된 원석</span>
            <div style={styles.summaryStatRow}>
              <strong style={styles.summaryStatValue}>{items.length}</strong>
              <span style={styles.summaryStatUnit}>개</span>
            </div>
          </div>
          <div style={styles.summaryStatBox}>
            <span style={styles.summaryStatLabel}>주 감정</span>
            {items.length > 0 ? (
              <div style={styles.summaryStatRow}>
                <GemStone
                  gem={{
                    id: `summary-${topCategory.code}`,
                    emotionCode: REPRESENTATIVE_EMOTION_BY_CATEGORY[topCategory.code],
                    tier: 2,
                    createdAt: new Date().toISOString(),
                  }}
                  size={22}
                  variant={EMOTION_VARIANTS_BY_CATEGORY[topCategory.code][0]}
                />
                <strong style={styles.summaryStatValue}>{topCategory.label}</strong>
              </div>
            ) : (
              <span style={styles.summaryStatMuted}>아직 없음</span>
            )}
          </div>
        </section>

        {/* 영역 2: 감정 패턴 아코디언 */}
        <section style={styles.patternSection} aria-label="감정 패턴 시각화">
          <div style={styles.patternHeader}>
            <span>
              <span style={styles.sectionTitle}>감정 패턴 시각화</span>
              <span style={styles.sectionCaption}>
                {items.length === 0
                  ? '계열별 분포를 펼쳐두었어요'
                  : selectedCategory
                    ? `${CATEGORY_BY_CODE[selectedCategory].label} 계열 ${categoryStats.find((c) => c.code === selectedCategory)?.count ?? 0}개 펼침`
                    : '막대를 눌러 계열 안쪽을 펼쳐봐요'}
              </span>
            </span>
          </div>
          <div style={styles.barList}>
            {categoryStats.map((category) => {
              const isOpen = selectedCategory === category.code;
              const categoryItems = items.filter((i) => i.category === category.code);
              // 카테고리 카운트(53%)와 chip 합계가 어긋나지 않도록, 미리 정해둔 variant
              // 라벨 목록이 아니라 실제 items에 등장하는 label로 그루핑한다.
              // (예: solace="위로", untroubled="무탈" 등은 complex variant 라벨 목록과
              // 글자가 달라서 매칭 0이 되던 회귀를 막음)
              const variantCountsMap = new Map<string, number>();
              for (const item of categoryItems) {
                variantCountsMap.set(item.label, (variantCountsMap.get(item.label) ?? 0) + 1);
              }
              const variantCounts = Array.from(variantCountsMap, ([label, count]) => ({
                label,
                count,
              })).sort((a, b) => b.count - a.count);
              const sampleRecords = categoryItems
                .filter((i) => i.recordText)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 2);

              return (
                <div key={category.code} style={styles.accordionRow}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory((prev) => (prev === category.code ? null : category.code))}
                    aria-expanded={isOpen}
                    style={{
                      ...styles.categoryRow,
                      background: isOpen ? '#EEF4EE' : 'transparent',
                    }}
                  >
                    <span style={styles.categoryGemSlot}>
                      <GemStone
                        gem={{
                          id: `cat-${category.code}`,
                          emotionCode: REPRESENTATIVE_EMOTION_BY_CATEGORY[category.code],
                          tier: 2,
                          createdAt: new Date().toISOString(),
                        }}
                        size={18}
                        variant={EMOTION_VARIANTS_BY_CATEGORY[category.code][0]}
                      />
                    </span>
                    <span style={styles.categoryName}>{category.label}</span>
                    <span style={styles.barTrack}>
                      <span
                        style={{
                          ...styles.barFill,
                          width: `${Math.max(category.pct, category.count ? 12 : 3)}%`,
                          background: category.color,
                        }}
                      />
                    </span>
                    <span style={styles.categoryPct}>{category.pct}%</span>
                    <span
                      style={{
                        ...styles.accordionCaret,
                        transform: `rotate(${isOpen ? 90 : 0}deg)`,
                      }}
                      aria-hidden
                    >
                      ▸
                    </span>
                  </button>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: isOpen ? '1fr' : '0fr',
                      transition: 'grid-template-rows 220ms ease',
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={styles.accordionBody}>
                        {variantCounts.length === 0 ? (
                          <span style={styles.accordionEmpty}>
                            이 기간엔 {category.label} 계열 기록이 없어요.
                          </span>
                        ) : (
                          <>
                            <div style={styles.variantChips}>
                              {variantCounts.map((v) => (
                                <span key={v.label} style={styles.variantChip}>
                                  {v.label}
                                  <span style={styles.variantChipCount}>×{v.count}</span>
                                </span>
                              ))}
                            </div>
                            {sampleRecords.length > 0 && (
                              <ul style={styles.sampleList}>
                                {sampleRecords.map((r) => (
                                  <li key={r.id} style={styles.sampleItem}>
                                    <span style={styles.sampleDate}>{toDateKey(new Date(r.createdAt))}</span>
                                    <span style={styles.sampleText}>{r.recordText}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 영역 3: 감정 리캡 — 유튜브 뮤직 스타일 가로 스크롤 타일 */}
        <section style={styles.recapBand} aria-label="감정 리캡">
          <SectionHeader title="감정 리캡" caption="이 기간을 채워준 감정들을 다시 만나보세요" />
          {recapThemes.length === 0 ? (
            <p style={styles.recapEmpty}>이번 기간엔 회고할 기록이 부족해요.</p>
          ) : (
            <div className="no-scrollbar" style={styles.recapTileTrack}>
              {recapThemes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setActiveRecapId(theme.id)}
                  style={{
                    ...styles.recapTile,
                    background: `linear-gradient(160deg, ${theme.tone} 0%, ${CATEGORY_BY_CODE[theme.category].color}55 100%)`,
                  }}
                  aria-label={`${theme.title} 리캡 보기`}
                >
                  <div style={styles.recapTileArt}>
                    <GemStone
                      gem={{
                        id: `tile-${theme.id}`,
                        emotionCode: REPRESENTATIVE_EMOTION_BY_CATEGORY[theme.category],
                        tier: 3,
                        createdAt: new Date().toISOString(),
                      }}
                      size={56}
                      variant={EMOTION_VARIANTS_BY_CATEGORY[theme.category][0]}
                    />
                  </div>
                  <div style={styles.recapTileBody}>
                    <strong style={styles.recapTileTitle}>{theme.title}</strong>
                    <span style={styles.recapTileMeta}>{theme.records.length}개의 순간</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 영역 4: 자기회고 — 동적 프롬프트 + textarea + 저장 (캘린더의 자기인지와 동일 포맷으로 적재) */}
        <section style={styles.reflectionSection} aria-label="자기회고">
          <SectionHeader title="자기회고" caption="마지막으로 한 가지만 더" />
          <p style={styles.reflectionQuestion}>Q. {reflectionPrompt.question}</p>
          {reflectionPrompt.source === 'answered' && reflectionPrompt.answer && (
            <div style={styles.reflectionPrevious}>
              <span style={styles.reflectionPreviousLabel}>지난번 내 답</span>
              <p style={styles.reflectionPreviousText}>{reflectionPrompt.answer}</p>
            </div>
          )}
          <textarea
            value={reflectionDraft}
            onChange={(e) => setReflectionDraft(e.target.value)}
            placeholder="짧게 한 문장으로 적어도 괜찮아요."
            disabled={savingReflection}
            style={styles.reflectionTextarea}
          />
          {reflectionError && <p style={styles.reflectionError}>{reflectionError}</p>}
          <button
            type="button"
            disabled={savingReflection || reflectionDraft.trim().length === 0}
            onClick={async () => {
              const answer = reflectionDraft.trim();
              if (!answer) return;
              setSavingReflection(true);
              setReflectionError(null);
              const result = await createSelfReflection(reflectionPrompt.question, answer);
              setSavingReflection(false);
              if (result.ok) {
                setReflectionDraft('');
                api.chatbotRecords(200).then((res) => setRecords(res.records)).catch(() => {});
              } else {
                setReflectionError(result.error ?? '저장에 실패했어요');
              }
            }}
            style={{
              ...styles.reflectionSubmit,
              ...buildAnalysisReflectionSubmitStyle(savingReflection || reflectionDraft.trim().length === 0),
            }}
          >
            {savingReflection ? '저장 중…' : '자기회고 남기기'}
          </button>
        </section>
      </main>

      {/* 영역 3 바텀시트: 카테고리 기록 모달 */}
      {activeRecapTheme && (
        <div
          style={styles.recapSheetOverlay}
          onClick={() => setActiveRecapId(null)}
          role="presentation"
        >
          <section
            style={styles.recapSheet}
            role="dialog"
            aria-modal="true"
            aria-label={activeRecapTheme.title}
            onClick={(event) => event.stopPropagation()}
          >
            <span style={styles.recapSheetGrip} aria-hidden />
            <header style={styles.recapSheetHeader}>
              <div style={styles.recapSheetTitleBlock}>
                <span style={styles.recapSheetKicker}>{activeRecapTheme.caption}</span>
                <h2 style={styles.recapSheetTitle}>{activeRecapTheme.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveRecapId(null)}
                style={styles.recapSheetClose}
                aria-label="닫기"
              >
                ×
              </button>
            </header>

            {activeRecapTheme && (
              <ul style={styles.recapSheetList}>
                {activeRecapTheme.records.map((record) => {
                  const slotCodes = record.emotionBadges?.length
                    ? record.emotionBadges.map((b) => b.code)
                    : [record.emotionCode];
                  const stackSize = slotCodes.length >= 3 ? 18 : slotCodes.length === 2 ? 22 : 28;
                  return (
                    <li key={record.id} style={styles.recapSheetRow}>
                      {record.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(record.imageUrl!)}
                          aria-label="사진 크게 보기"
                          style={styles.recapSheetPhotoButton}
                        >
                          <img src={record.imageUrl} alt="" style={styles.recapSheetPhoto} />
                        </button>
                      ) : (
                        <span style={styles.recapSheetGemSlot}>
                          <span style={styles.recapSheetGemStack}>
                            {slotCodes.slice(0, 4).map((code, idx) => (
                              <GemStone
                                key={`${record.id}-slot-${code}-${idx}`}
                                gem={{
                                  id: `recap-${record.id}-${code}`,
                                  emotionCode: code,
                                  tier: 2,
                                  createdAt: record.createdAt,
                                }}
                                size={stackSize}
                              />
                            ))}
                          </span>
                        </span>
                      )}
                      <div style={styles.recapSheetRowBody}>
                        <span style={styles.recapSheetMeta}>
                          {toDateKey(new Date(record.createdAt))} · {record.label}
                        </span>
                        {record.emotionBadges && (
                          <div style={styles.recapSheetBadgeRow}>
                            {record.emotionBadges.map((badge) => (
                              <span key={`${record.id}-${badge.code}`} style={styles.recapSheetBadge}>
                                <GemStone
                                  gem={{
                                    id: `recap-badge-${record.id}-${badge.code}`,
                                    emotionCode: badge.code,
                                    tier: 1,
                                    createdAt: record.createdAt,
                                  }}
                                  size={16}
                                />
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        )}
                        <p style={styles.recapSheetText}>
                          {record.recordText ?? '텍스트 없이 원석만 남은 순간이에요.'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <div style={styles.sectionHeader}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {caption && <p style={styles.sectionCaption}>{caption}</p>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#F9F4EA',
    color: '#5A4A32',
    overflow: 'hidden',
  },
  header: {
    // 데스크탑 미리보기 가짜 노치(콘텐츠 상단 ~36px)를 피하도록 상단 패딩 확보.
    // Calendar 와 동일한 방식. 직접 모드의 긴 날짜 범위 eyebrow 가 노치에 가려지던
    // 현상을 막는다. (모바일은 safe-area-inset-top 추가 반영)
    padding: 'calc(40px + env(safe-area-inset-top)) 20px 6px',
    flexShrink: 0,
  },
  eyebrow: {
    margin: '0 0 4px',
    color: '#8B7355',
    fontSize: 11,
    fontWeight: 600,
  },
  title: {
    margin: 0,
    color: '#5A4A32',
    fontSize: 23,
    fontWeight: 800,
    letterSpacing: 0,
  },
  periodTabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
    padding: '0 20px 10px',
    flexShrink: 0,
  },
  periodButton: {
    height: 34,
    border: 0,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    outline: 'none',
  },
  customRange: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    padding: '0 22px 12px',
    flexShrink: 0,
  },
  dateLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 800,
  },
  dateInput: {
    minHeight: 34,
    border: '1px solid #E0D3BA',
    borderRadius: 10,
    background: '#FFFFFF',
    color: '#5A4A32',
    padding: '0 8px',
    fontSize: 12,
    fontWeight: 700,
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: '0 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  summaryBand: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    background: '#A0BCA8',
    borderRadius: 14,
    padding: 6,
    flexShrink: 0,
  },
  summaryStatBox: {
    background: '#FFFFFF',
    borderRadius: 10,
    padding: '10px 12px',
    minHeight: 68,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
  },
  summaryStatLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: '#3D6050',
    letterSpacing: 0.2,
  },
  summaryStatRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: 900,
    color: '#1E3328',
    lineHeight: 1,
  },
  summaryStatUnit: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8B7355',
    alignSelf: 'flex-end',
    marginBottom: 1,
  },
  summaryStatMuted: {
    fontSize: 14,
    fontWeight: 700,
    color: '#8B7355',
  },
  patternSection: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: '11px 12px 9px',
    boxShadow: '0 2px 10px rgba(90, 74, 50, 0.03)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  sectionHeader: {
    marginBottom: 6,
  },
  patternHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 7,
  },
  sectionTitle: {
    margin: 0,
    color: '#5A4A32',
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: 0,
  },
  sectionCaption: {
    display: 'block',
    margin: '2px 0 0',
    color: '#8B7355',
    fontSize: 10,
    lineHeight: 1.25,
  },
  barList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  accordionRow: {
    display: 'flex',
    flexDirection: 'column',
  },
  categoryRow: {
    display: 'grid',
    gridTemplateColumns: '20px 36px 1fr 32px 14px',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    border: 0,
    borderRadius: 8,
    padding: '6px 8px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'background 160ms ease',
  },
  categoryGemSlot: {
    width: 20,
    height: 20,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    color: '#5A4A32',
    fontSize: 12,
    fontWeight: 800,
    textAlign: 'left',
  },
  barTrack: {
    height: 14,
    borderRadius: 999,
    background: '#EFE8D9',
    overflow: 'hidden',
  },
  barFill: {
    display: 'block',
    height: '100%',
    borderRadius: 999,
  },
  categoryPct: {
    color: '#8B7355',
    fontSize: 11,
    fontWeight: 800,
    textAlign: 'right',
  },
  accordionCaret: {
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 900,
    transition: 'transform 220ms ease',
    textAlign: 'center',
  },
  accordionBody: {
    padding: '8px 10px 12px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  accordionEmpty: {
    color: '#8B7355',
    fontSize: 11,
    fontWeight: 700,
  },
  variantChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  variantChip: {
    background: '#EFE8D9',
    borderRadius: 999,
    padding: '4px 9px',
    fontSize: 11,
    fontWeight: 800,
    color: '#5A4A32',
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 2,
  },
  variantChipCount: {
    marginLeft: 2,
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 800,
  },
  sampleList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  sampleItem: {
    display: 'grid',
    gridTemplateColumns: '64px 1fr',
    gap: 8,
    fontSize: 11,
    alignItems: 'flex-start',
  },
  sampleDate: {
    color: '#8B7355',
    fontWeight: 800,
    fontSize: 10,
    paddingTop: 1,
  },
  sampleText: {
    color: '#5A4A32',
    fontWeight: 600,
    lineHeight: 1.4,
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  recapBand: {
    background: '#EDE2CC',
    borderRadius: 12,
    padding: '10px 12px 12px',
    flexShrink: 0,
  },
  recapEmpty: {
    margin: '6px 0 2px',
    color: '#8B7355',
    fontSize: 12,
    fontWeight: 700,
  },
  recapTileTrack: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '8px 2px 4px',
    scrollSnapType: 'x mandatory',
  },
  recapTile: {
    flex: '0 0 132px',
    minHeight: 184,
    border: 0,
    borderRadius: 16,
    padding: '14px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    cursor: 'pointer',
    scrollSnapAlign: 'start',
    boxShadow: '0 4px 12px rgba(90, 74, 50, 0.1)',
    color: '#1E3328',
    textAlign: 'left',
  },
  recapTileArt: {
    width: 64,
    height: 64,
    borderRadius: 14,
    background: 'rgba(255,255,255,0.42)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapTileBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
  },
  recapTileTitle: {
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1.25,
    wordBreak: 'keep-all',
  },
  recapTileMeta: {
    fontSize: 10,
    fontWeight: 700,
    color: 'rgba(30, 51, 40, 0.62)',
  },
  recapSheetOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'stretch',
    padding: 0,
    background: 'rgba(30, 51, 40, 0.18)',
  },
  recapSheet: {
    position: 'relative',
    width: '100%',
    maxHeight: '62vh',
    zIndex: 31,
    overflow: 'auto',
    background: '#F9F4EA',
    borderRadius: '22px 22px 0 0',
    padding: '14px 18px calc(96px + env(safe-area-inset-bottom))',
    boxShadow: '0 -10px 28px rgba(30, 51, 40, 0.18)',
  },
  recapSheetGrip: {
    display: 'block',
    width: 40,
    height: 4,
    margin: '0 auto 12px',
    borderRadius: 99,
    background: 'rgba(90, 74, 50, 0.22)',
  },
  recapSheetHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  recapSheetTitleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  recapSheetKicker: {
    color: '#8B7355',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  recapSheetTitle: {
    margin: 0,
    color: '#1E3328',
    fontSize: 18,
    fontWeight: 900,
    lineHeight: 1.3,
    wordBreak: 'keep-all',
  },
  recapSheetClose: {
    flexShrink: 0,
    width: 28,
    height: 28,
    border: 0,
    borderRadius: 999,
    background: '#EDE2CC',
    color: '#5A4A32',
    fontSize: 18,
    fontWeight: 800,
    cursor: 'pointer',
    outline: 'none',
  },
  recapSheetList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  recapSheetRow: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr',
    gap: 10,
    background: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    alignItems: 'flex-start',
    boxShadow: '0 1px 3px rgba(90, 74, 50, 0.06)',
  },
  recapSheetPhoto: {
    width: 56,
    height: 56,
    objectFit: 'cover',
    borderRadius: 10,
    background: '#F9F4EA',
    display: 'block',
  },
  recapSheetPhotoButton: {
    padding: 0,
    margin: 0,
    border: 0,
    background: 'transparent',
    cursor: 'zoom-in',
    borderRadius: 10,
    WebkitTapHighlightColor: 'transparent',
  },
  recapSheetGemSlot: {
    width: 56,
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#EFE8D9',
    borderRadius: 10,
  },
  recapSheetGemStack: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    maxWidth: 50,
    maxHeight: 50,
  },
  recapSheetRowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  recapSheetMeta: {
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 800,
  },
  recapSheetBadgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  recapSheetBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '3px 6px',
    borderRadius: 999,
    background: '#FFFFFF',
    border: '1px solid rgba(90, 74, 50, 0.08)',
    color: '#5A4A32',
    fontSize: 10,
    fontWeight: 800,
  },
  recapSheetText: {
    margin: '3px 0 0',
    color: '#5A4A32',
    fontSize: 12,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  reflectionSection: {
    background: '#EDE2CC',
    borderRadius: 12,
    padding: '12px 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
  },
  reflectionQuestion: {
    margin: '4px 0 2px',
    color: '#5A4A32',
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
  },
  reflectionPrevious: {
    padding: 12,
    borderRadius: 12,
    background: '#FFFFFF',
    boxShadow: '0 1px 3px rgba(90, 74, 50, 0.06)',
  },
  reflectionPreviousLabel: {
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 800,
  },
  reflectionPreviousText: {
    margin: '4px 0 0',
    color: '#5A4A32',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'keep-all',
  },
  reflectionTextarea: {
    minHeight: 110,
    padding: '12px 14px',
    border: '1px solid #E0D3BA',
    borderRadius: 10,
    background: '#FFFFFF',
    color: '#5A4A32',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
  },
  reflectionSubmit: {
    alignSelf: 'flex-end',
    border: 0,
    borderRadius: 10,
    padding: '10px 18px',
    background: '#2F5F46',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 700,
  },
  reflectionError: {
    margin: 0,
    color: '#B23A3A',
    fontSize: 12,
    fontWeight: 700,
  },
};
