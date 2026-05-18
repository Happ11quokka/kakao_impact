// === Analysis 화면 — 감정 요약 + 패턴 + 자기인지 질문 ===
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import type { Gem } from '../types/gem';
import { api, type ChatbotRecordDto } from '../lib/api';
import { getEmotion } from '../data/emotions';
import { emotionToCategory, type CategoryCode } from '../lib/emotion-category';
import { EMOTION_VARIANTS_BY_CATEGORY } from '../data/emotion-variants';
import GemStone from '../components/pixel/GemStone';

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
};

export type RecapTheme = {
  id: string;
  title: string;
  caption: string;
  tone: string;
  records: AnalysisItem[];
};

export type RecapDialogState = {
  title: string;
  caption: string;
  records: AnalysisItem[];
  emptyMessage: string;
};

export type PatternPanelState = {
  expanded: true;
  toggleLabel: null;
  layoutRole: 'primary-fill';
  minVisibleRows: number;
};

const CATEGORIES: Category[] = [
  { code: 'sadness', label: '슬픔', color: '#58728E', soft: '#DDE5EC', details: [...EMOTION_VARIANTS_BY_CATEGORY.sadness] },
  { code: 'anger', label: '분노', color: '#914640', soft: '#EBDDD9', details: [...EMOTION_VARIANTS_BY_CATEGORY.anger] },
  { code: 'anxiety', label: '불안', color: '#B8C7D8', soft: '#E7EDF2', details: [...EMOTION_VARIANTS_BY_CATEGORY.anxiety] },
  { code: 'joy', label: '기쁨', color: '#D4B84E', soft: '#F1E8BD', details: [...EMOTION_VARIANTS_BY_CATEGORY.joy] },
  { code: 'complex', label: '복잡', color: '#3D3A34', soft: '#E2DFD8', details: [...EMOTION_VARIANTS_BY_CATEGORY.complex] },
];

const CATEGORY_BY_CODE = Object.fromEntries(CATEGORIES.map((category) => [category.code, category])) as Record<CategoryCode, Category>;

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
  return gems
    .map(gemToItem)
    .filter((item) => dateInAnalysisPeriod(new Date(item.createdAt), period, today, customRange))
    .map((item) => {
      const recordData = recordDataByDate[toDateKey(new Date(item.createdAt))];
      return {
        ...item,
        recordText: item.recordText ?? recordData?.recordText,
        imageUrl: recordData?.imageUrl ?? null,
      };
    });
}

export function buildRecapThemes(items: AnalysisItem[], periodLabel: string): RecapTheme[] {
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const counts = new Map<CategoryCode, number>();
  sorted.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'joy';
  const topCategoryMeta = CATEGORY_BY_CODE[topCategory];
  const topCategoryRecords = sorted.filter((item) => item.category === topCategory).slice(0, 5);
  const photoRecords = sorted.filter((item) => item.imageUrl).slice(0, 5);
  const reflectionRecords = sorted.filter((item) => item.recordText).slice(0, 5);
  const careRecords = sorted.filter((item) => item.category !== 'joy').slice(0, 5);

  const themes: RecapTheme[] = [
    {
      id: 'dominant',
      title: `${periodLabel} 가장 또렷한 감정`,
      caption: topCategoryRecords.length
        ? `${topCategoryMeta.label} 계열 기록 ${topCategoryRecords.length}개를 다시 볼 수 있어요.`
        : '아직 또렷한 감정 흐름이 쌓이지 않았어요.',
      tone: topCategoryMeta.soft,
      records: topCategoryRecords,
    },
    {
      id: 'photos',
      title: '사진이 있는 순간',
      caption: photoRecords.length ? '이미지와 함께 남은 장면만 모았어요.' : '사진으로 남은 기록은 아직 없어요.',
      tone: '#E7EDF2',
      records: photoRecords,
    },
    {
      id: 'reflection',
      title: '돌아볼 기록',
      caption: reflectionRecords.length ? '텍스트가 남아 있어 다시 읽기 좋은 기록이에요.' : '텍스트 기록이 쌓이면 이곳에서 회고할 수 있어요.',
      tone: '#F1E8BD',
      records: reflectionRecords,
    },
  ];

  if (careRecords.length > 0) {
    themes.push({
      id: 'care',
      title: '살펴볼 마음',
      caption: '조금 묵직했던 감정들을 조심스럽게 모았어요.',
      tone: '#EBDDD9',
      records: careRecords,
    });
  }

  return themes;
}

export function buildRecapDialogState(theme: RecapTheme | null | undefined): RecapDialogState | null {
  if (!theme) return null;
  return {
    title: theme.title,
    caption: theme.caption,
    records: theme.records,
    emptyMessage: '이 테마에 해당하는 기록은 아직 없어요.',
  };
}

export function buildPatternPanelState(categoryCount: number): PatternPanelState {
  return {
    expanded: true,
    toggleLabel: null,
    layoutRole: 'primary-fill',
    minVisibleRows: Math.max(categoryCount, CATEGORIES.length),
  };
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
  const [selectedCategory, setSelectedCategory] = useState<CategoryCode>('sadness');
  const [activeRecapThemeId, setActiveRecapThemeId] = useState<string | null>(null);
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

  const topItems = useMemo(() => {
    const counts = new Map<string, { label: string; color: string; count: number; emotionCode: string }>();
    items.forEach((item) => {
      const prev = counts.get(item.label) ?? { label: item.label, color: item.color, count: 0, emotionCode: item.emotionCode };
      counts.set(item.label, { ...prev, count: prev.count + 1 });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  }, [items]);

  const topCategory = categoryStats.slice().sort((a, b) => b.count - a.count)[0] ?? CATEGORIES[0];
  const activeDays = new Set(items.map((item) => toDateKey(new Date(item.createdAt)))).size;
  const periodLabel = period === 'weekly' ? '이번 주' : period === 'monthly' ? '이번 달' : `${customRange.start} ~ ${customRange.end}`;
  const selectedCategoryMeta = CATEGORY_BY_CODE[selectedCategory];
  const patternPanel = buildPatternPanelState(categoryStats.length);
  const recapThemes = useMemo(() => buildRecapThemes(items, periodLabel), [items, periodLabel]);
  const activeRecapTheme = recapThemes.find((theme) => theme.id === activeRecapThemeId) ?? null;
  const recapDialog = buildRecapDialogState(activeRecapTheme);

  return (
    <div style={styles.screen}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>{periodLabel}</p>
          <h1 style={styles.title}>감정 분석</h1>
        </div>
        <div style={styles.totalBadge}>
          <span style={styles.totalNumber}>{items.length}</span>
          <span style={styles.totalLabel}>원석</span>
        </div>
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
        <section style={styles.summaryBand}>
          <div style={styles.summaryText}>
            <span style={styles.sectionLabel}>감정 요약 카드</span>
            {items.length === 0 ? (
              <>
                <strong style={styles.summaryTitle}>아직 이번 기간엔 원석이 없어요</strong>
                <p style={styles.summaryCopy}>
                  카카오톡 챗봇에게 마음을 보내면 원석이 쌓여요.
                </p>
              </>
            ) : (
              <>
                <strong style={styles.summaryTitle}>{topCategory.label}의 결이 가장 또렷했어요</strong>
                <p style={styles.summaryCopy}>
                  {periodLabel} {activeDays}일 동안 {items.length}개의 원석을 만났고, 그중 {topCategory.count}개가 {topCategory.label} 계열이에요.
                </p>
              </>
            )}
          </div>
          {items.length > 0 && (
            <div style={styles.gemCase} aria-label="감정 요약 원석함">
              <span style={styles.gemCaseLid}>요약 원석함</span>
              <div style={styles.topGemCluster}>
                {topItems.map((item, index) => (
                  <GemBubble
                    key={item.label}
                    label={item.label}
                    emotionCode={item.emotionCode}
                    count={item.count}
                    large={index === 0}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <section style={styles.patternSection} aria-label="감정 패턴 시각화">
          <div style={styles.patternHeader}>
            <span>
              <span style={styles.sectionTitle}>감정 패턴 시각화</span>
              <span style={styles.sectionCaption}>
                {items.length === 0
                  ? '계열별 분포를 바로 볼 수 있게 펼쳐두었어요'
                  : `${selectedCategoryMeta.label} 계열 ${categoryStats.find((category) => category.code === selectedCategory)?.count ?? 0}개 · 화면 안에 바로 보기`}
              </span>
            </span>
            <span style={styles.patternBadge}>{patternPanel.minVisibleRows}계열</span>
          </div>
          <div style={styles.barList}>
            {categoryStats.map((category) => (
              <button
                key={category.code}
                type="button"
                onClick={() => setSelectedCategory(category.code)}
                style={{
                  ...styles.categoryRow,
                  background: selectedCategory === category.code ? '#EEF4EE' : 'transparent',
                }}
              >
                <span style={{ ...styles.categoryDot, background: category.color }} />
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
              </button>
            ))}
          </div>
        </section>

        <section style={styles.recapBand}>
          <SectionHeader title="주간·월간 감정 recap" />
          <div className="no-scrollbar" style={styles.recapSlider} aria-label="감정 리캡 테마">
            {recapThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setActiveRecapThemeId(theme.id)}
                style={{
                  ...styles.recapCard,
                  background: theme.tone,
                }}
              >
                <span style={styles.recapCardKicker}>{theme.records.length}개 기록</span>
                <strong style={styles.recapCardTitle}>{theme.title}</strong>
                <span style={styles.recapCardCaption}>{theme.caption}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {recapDialog && (
        <div
          style={styles.modalOverlay}
          role="presentation"
          onClick={() => setActiveRecapThemeId(null)}
        >
          <section
            style={styles.modalSheet}
            role="dialog"
            aria-modal="true"
            aria-label={recapDialog.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.sectionLabel}>recap 기록</span>
                <h2 style={styles.modalTitle}>{recapDialog.title}</h2>
                <p style={styles.modalCaption}>{recapDialog.caption}</p>
              </div>
              <button type="button" onClick={() => setActiveRecapThemeId(null)} style={styles.modalClose}>
                닫기
              </button>
            </div>
            <div style={styles.modalRecords}>
              {recapDialog.records.length === 0 ? (
                <p style={styles.emptyRecord}>{recapDialog.emptyMessage}</p>
              ) : (
                recapDialog.records.map((record) => (
                  <article
                    key={`${activeRecapTheme?.id}-${record.id}`}
                    style={{
                      ...styles.recordCard,
                      gridTemplateColumns: record.imageUrl ? '74px 1fr' : '1fr',
                    }}
                  >
                    {record.imageUrl && <img src={record.imageUrl} alt="기록 사진" style={styles.recordImage} />}
                    <div style={styles.recordBody}>
                      <span style={styles.recordMeta}>{toDateKey(new Date(record.createdAt))} · {record.label}</span>
                      <p style={styles.recordText}>{record.recordText ?? '텍스트 없이 원석만 남은 기록이에요.'}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
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

function GemBubble({
  label,
  emotionCode,
  count,
  large = false,
}: {
  label: string;
  emotionCode: string;
  count: number;
  large?: boolean;
}) {
  const previewGem: Gem = {
    id: `analysis-${emotionCode}-${label}`,
    emotionCode,
    tier: large ? 3 : 2,
    createdAt: new Date().toISOString(),
  };

  return (
    <div style={{ ...styles.gemBubble, transform: large ? 'scale(1.08)' : 'scale(0.92)' }}>
      <GemStone gem={previewGem} size={18} variant={label} />
      <span style={styles.gemLabel}>{label}</span>
      <span style={styles.gemCount}>x{count}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#F9F4EA',
    color: '#5A4A32',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px 6px',
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
  totalBadge: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: '#EDE2CC',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalNumber: {
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1,
  },
  totalLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: 700,
    color: '#8B7355',
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
    overflow: 'hidden',
    padding: '0 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  summaryBand: {
    display: 'grid',
    gridTemplateColumns: '1.35fr 0.65fr',
    gap: 10,
    minHeight: 64,
    background: '#A0BCA8',
    borderRadius: 12,
    padding: '10px 12px',
    flexShrink: 0,
  },
  summaryText: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  sectionLabel: {
    color: '#3D6050',
    fontSize: 10,
    fontWeight: 800,
  },
  summaryTitle: {
    marginTop: 6,
    color: '#1E3328',
    fontSize: 15,
    lineHeight: 1.18,
    wordBreak: 'keep-all',
  },
  summaryCopy: {
    display: 'none',
    margin: 0,
    color: '#3D6050',
    fontSize: 11,
    lineHeight: 1.35,
    wordBreak: 'keep-all',
  },
  topGemCluster: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gemCase: {
    minHeight: 46,
    borderRadius: '14px 14px 10px 10px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(237,226,204,0.78))',
    border: '1px solid rgba(90,74,50,0.14)',
    boxShadow: 'inset 0 -6px 0 rgba(90,74,50,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '7px 4px',
  },
  gemCaseLid: {
    padding: '2px 7px',
    borderRadius: 999,
    background: 'rgba(30,51,40,0.12)',
    color: '#1E3328',
    fontSize: 9,
    fontWeight: 900,
  },
  gemBubble: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    width: 24,
  },
  gemStone: {
    display: 'block',
    width: 34,
    height: 44,
    borderRadius: 11,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.32)',
  },
  gemLabel: {
    display: 'none',
    textAlign: 'center',
    color: '#1E3328',
    fontSize: 9,
    fontWeight: 800,
  },
  gemCount: {
    display: 'none',
    fontSize: 9,
    fontWeight: 700,
  },
  section: {
    marginTop: 10,
    background: '#FFFFFF',
    borderRadius: 8,
    padding: '11px 12px',
    boxShadow: '0 2px 10px rgba(90, 74, 50, 0.03)',
  },
  patternSection: {
    flex: 1,
    minHeight: 0,
    background: '#FFFFFF',
    borderRadius: 12,
    padding: '10px 11px 9px',
    boxShadow: '0 2px 10px rgba(90, 74, 50, 0.03)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sectionHeader: {
    marginBottom: 6,
  },
  accordionHeader: {
    width: '100%',
    border: 0,
    background: 'transparent',
    padding: 0,
    marginBottom: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    textAlign: 'left',
    cursor: 'pointer',
  },
  accordionIcon: {
    flexShrink: 0,
    minWidth: 42,
    borderRadius: 999,
    background: '#EDE2CC',
    color: '#5A4A32',
    fontSize: 10,
    fontWeight: 900,
    textAlign: 'center',
    padding: '5px 8px',
  },
  patternHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 7,
  },
  patternBadge: {
    flexShrink: 0,
    minWidth: 42,
    borderRadius: 999,
    background: '#EDE2CC',
    color: '#5A4A32',
    fontSize: 10,
    fontWeight: 900,
    textAlign: 'center',
    padding: '5px 8px',
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
    lineHeight: 1.18,
  },
  barList: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: 'repeat(5, minmax(19px, 1fr))',
    gap: 2,
  },
  categoryRow: {
    display: 'grid',
    gridTemplateColumns: '10px 38px 1fr 32px',
    alignItems: 'center',
    gap: 6,
    minHeight: 0,
    border: 0,
    borderRadius: 8,
    padding: '3px 6px',
    cursor: 'pointer',
    outline: 'none',
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
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
  timeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    height: 112,
  },
  timeColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  timeBarWrap: {
    width: 28,
    height: 68,
    borderRadius: 999,
    background: '#EFE8D9',
    display: 'flex',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  timeBar: {
    width: '100%',
    borderRadius: 999,
    background: '#A0BCA8',
  },
  timeLabel: {
    color: '#5A4A32',
    fontSize: 11,
    fontWeight: 800,
  },
  timeCount: {
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 700,
  },
  detailBand: {
    marginTop: 14,
    background: '#EDE2CC',
    borderRadius: 8,
    padding: '15px 14px',
  },
  detailList: {
    display: 'grid',
    gap: 9,
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr 24px',
    gap: 8,
    alignItems: 'center',
  },
  detailLabel: {
    color: '#5A4A32',
    fontSize: 12,
    fontWeight: 800,
  },
  detailTrack: {
    height: 9,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.6)',
    overflow: 'hidden',
  },
  detailFill: {
    display: 'block',
    height: '100%',
    borderRadius: 999,
  },
  detailCount: {
    color: '#8B7355',
    fontSize: 11,
    fontWeight: 800,
    textAlign: 'right',
  },
  insightText: {
    margin: '3px 0 0',
    color: '#5A4A32',
    fontSize: 12,
    lineHeight: 1.3,
    wordBreak: 'keep-all',
  },
  recapBand: {
    background: '#EDE2CC',
    borderRadius: 8,
    padding: '7px 10px',
    flexShrink: 0,
  },
  recapSlider: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    paddingBottom: 0,
  },
  recapCard: {
    minWidth: 148,
    minHeight: 44,
    border: 0,
    borderRadius: 12,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    textAlign: 'left',
    color: '#3D3A34',
    scrollSnapAlign: 'start',
    cursor: 'pointer',
  },
  recapCardKicker: {
    fontSize: 10,
    fontWeight: 900,
    color: '#8B7355',
  },
  recapCardTitle: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 1.12,
    wordBreak: 'keep-all',
  },
  recapCardCaption: {
    display: 'none',
    marginTop: 0,
    fontSize: 9,
    lineHeight: 1.18,
    color: '#5A4A32',
    wordBreak: 'keep-all',
  },
  recordList: {
    display: 'grid',
    gap: 9,
    marginTop: 12,
  },
  recordCard: {
    display: 'grid',
    gridTemplateColumns: '74px 1fr',
    gap: 10,
    minHeight: 82,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.62)',
    padding: 10,
  },
  recordImage: {
    width: 74,
    height: 74,
    objectFit: 'cover',
    borderRadius: 10,
    background: '#F9F4EA',
  },
  recordBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  recordMeta: {
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 800,
  },
  recordText: {
    margin: '6px 0 0',
    color: '#5A4A32',
    fontSize: 12,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
  },
  emptyRecord: {
    margin: 0,
    color: '#8B7355',
    fontSize: 12,
    lineHeight: 1.45,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 40,
    background: 'rgba(30, 24, 16, 0.34)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: 14,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '76vh',
    borderRadius: '18px 18px 14px 14px',
    background: '#F9F4EA',
    boxShadow: '0 -10px 28px rgba(30, 24, 16, 0.2)',
    padding: 15,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  modalTitle: {
    margin: '5px 0 0',
    color: '#5A4A32',
    fontSize: 18,
    lineHeight: 1.25,
    wordBreak: 'keep-all',
  },
  modalCaption: {
    margin: '6px 0 0',
    color: '#8B7355',
    fontSize: 12,
    lineHeight: 1.35,
    wordBreak: 'keep-all',
  },
  modalClose: {
    flexShrink: 0,
    border: 0,
    borderRadius: 999,
    background: '#EDE2CC',
    color: '#5A4A32',
    fontSize: 11,
    fontWeight: 900,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  modalRecords: {
    display: 'grid',
    gap: 9,
    overflowY: 'auto',
    paddingRight: 2,
  },
  questionBand: {
    marginTop: 14,
    background: '#A0BCA8',
    borderRadius: 8,
    padding: '16px 15px',
  },
  questionText: {
    margin: '8px 0 0',
    color: '#1E3328',
    fontSize: 17,
    fontWeight: 800,
    lineHeight: 1.38,
    wordBreak: 'keep-all',
  },
  questionHint: {
    margin: '8px 0 0',
    color: '#3D6050',
    fontSize: 12,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
  },
  journeyText: {
    margin: 0,
    color: '#5A4A32',
    fontSize: 12,
    lineHeight: 1.55,
    wordBreak: 'keep-all',
  },
  miniStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginTop: 12,
  },
  miniStat: {
    minHeight: 56,
    borderRadius: 8,
    background: '#F9F4EA',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniValue: {
    color: '#5A4A32',
    fontSize: 14,
    fontWeight: 800,
  },
  miniLabel: {
    marginTop: 4,
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 700,
  },
  careBand: {
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 8,
    padding: '16px 15px',
  },
  careTitle: {
    display: 'block',
    marginTop: 8,
    color: '#1E3328',
    fontSize: 16,
    lineHeight: 1.35,
    wordBreak: 'keep-all',
  },
  careText: {
    margin: '8px 0 0',
    color: '#3D6050',
    fontSize: 12,
    lineHeight: 1.48,
    wordBreak: 'keep-all',
  },
};
