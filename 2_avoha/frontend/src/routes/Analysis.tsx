// === Analysis 화면 — 현업형 감정 대시보드 ===
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, type ChatbotRecordDto } from '../lib/api';
import { getEmotion } from '../data/emotions';
import { emotionToCategory, type CategoryCode } from '../lib/emotion-category';
import { useInventoryStore } from '../stores/inventory-store';
import type { Gem } from '../types/gem';

type Period = 'weekly' | 'monthly' | 'custom';

type Category = {
  code: CategoryCode;
  label: string;
  color: string;
  details: string[];
};

type AnalysisItem = {
  id: string;
  emotionCode: string;
  category: CategoryCode;
  label: string;
  color: string;
  createdAt: string;
  recordText?: string | null;
};

const CATEGORIES: Category[] = [
  { code: 'sadness', label: '슬픔', color: '#58728E', details: ['우울', '외로움', '상실', '서러움'] },
  { code: 'anxiety', label: '불안', color: '#9DB5CE', details: ['실망', '걱정', '긴장', '위축'] },
  { code: 'anger', label: '분노', color: '#914640', details: ['짜증', '억울', '화남', '적대'] },
  { code: 'joy', label: '기쁨', color: '#D4B84E', details: ['즐거움', '감사', '설렘', '뿌듯'] },
  { code: 'complex', label: '복잡', color: '#3D3A34', details: ['편안', '무기력', '공허', '후회'] },
];

const CATEGORY_BY_CODE = Object.fromEntries(
  CATEGORIES.map((category) => [category.code, category]),
) as Record<CategoryCode, Category>;

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function dateInPeriod(date: Date, period: Period, today: Date): boolean {
  if (period === 'weekly') {
    const start = startOfWeek(today).getTime();
    const end = start + 7 * 24 * 60 * 60 * 1000;
    return date.getTime() >= start && date.getTime() < end;
  }
  if (period === 'monthly') {
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  }
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - 13);
  return date.getTime() >= start.getTime() && date.getTime() <= today.getTime();
}

function detailForItem(code: string, index: number): string {
  const category = CATEGORY_BY_CODE[emotionToCategory(code)];
  const known = getEmotion(code)?.nameKo;
  if (known && known !== category.label) return known;
  return category.details[index % category.details.length];
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

function recordToTextByDate(records: ChatbotRecordDto[]): Record<string, string> {
  const byDate: Record<string, string> = {};
  records.forEach((record) => {
    if (!record.recordText) return;
    const key = toDateKey(new Date(record.createdAt));
    if (!byDate[key]) byDate[key] = record.recordText;
  });
  return byDate;
}

export default function Analysis() {
  const today = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<Period>('weekly');
  const [selectedCategory, setSelectedCategory] = useState<CategoryCode>('sadness');
  const [detailCategory, setDetailCategory] = useState<CategoryCode | null>(null);
  const [selectedPromptOption, setSelectedPromptOption] = useState<string | null>(null);
  const { gems, fetchInventory } = useInventoryStore();
  const [records, setRecords] = useState<ChatbotRecordDto[]>([]);

  useEffect(() => {
    fetchInventory();
    api.chatbotRecords(200).then((res) => setRecords(res.records)).catch(() => {});
  }, [fetchInventory]);

  const recordTextByDate = useMemo(() => recordToTextByDate(records), [records]);

  const items = useMemo(() => {
    return gems
      .map(gemToItem)
      .filter((item) => dateInPeriod(new Date(item.createdAt), period, today))
      .map((item) => ({
        ...item,
        recordText: item.recordText ?? recordTextByDate[toDateKey(new Date(item.createdAt))],
      }));
  }, [gems, period, recordTextByDate, today]);

  const categoryStats = useMemo(() => {
    const total = Math.max(items.length, 1);
    return CATEGORIES.map((category) => {
      const count = items.filter((item) => item.category === category.code).length;
      return { ...category, count, pct: Math.round((count / total) * 100) };
    });
  }, [items]);

  const selectedDetails = useMemo(() => {
    const category = CATEGORY_BY_CODE[selectedCategory];
    const selectedItems = items.filter((item) => item.category === selectedCategory);
    const selectedCount = selectedItems.length;
    return category.details.map((label, index) => {
      const actualCount = selectedItems.filter((item) => item.label === label).length;
      const count = actualCount || (selectedCount > 0 && index === 0 ? selectedCount : 0);
      return {
        label,
        count,
        pct: selectedCount ? Math.round((count / selectedCount) * 100) : 0,
      };
    });
  }, [items, selectedCategory]);

  const topCategory = categoryStats.slice().sort((a, b) => b.count - a.count)[0] ?? CATEGORIES[0];
  const positiveCount = items.filter((item) => item.category === 'joy').length;
  const negativeCount = items.filter((item) => item.category === 'sadness' || item.category === 'anger' || item.category === 'anxiety').length;
  const activeDays = new Set(items.map((item) => toDateKey(new Date(item.createdAt)))).size;
  const careNeeded = items.length > 0 && negativeCount / items.length >= 0.7;
  const periodLabel = period === 'weekly' ? '이번 주' : period === 'monthly' ? '이번 달' : '최근 2주';
  const topDetail = selectedDetails.slice().sort((a, b) => b.count - a.count)[0];
  const latestPositive = items
    .filter((item) => item.category === 'joy')
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const focusQuestion = items.length === 0
    ? '오늘 짧게 남길 수 있는 마음은 무엇인가요?'
    : `${topCategory.label}이 올라온 순간, 몸의 반응은 어땠나요?`;
  const overviewCopy = items.length === 0
    ? '기록이 1개만 쌓이면 감정 분포와 다음 질문이 만들어져요.'
    : careNeeded
      ? '부담 감정 비율이 높아요. 오늘은 이유보다 몸 신호부터 확인해요.'
      : `${periodLabel}의 흐름은 안정적이에요. 좋은 순간은 다시 꺼내볼 수 있어요.`;

  return (
    <div style={styles.screen}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>{periodLabel}</p>
          <h1 style={styles.title}>감정 분석</h1>
        </div>
        <div style={styles.totalBadge}>
          <strong>{items.length}</strong>
          <span>원석</span>
        </div>
      </header>

      <div style={styles.periodTabs} aria-label="기간 선택">
        {([
          ['weekly', '주간'],
          ['monthly', '월간'],
          ['custom', '최근 2주'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            style={{
              ...styles.periodButton,
              background: period === value ? '#2459B4' : '#FFFFFF',
              color: period === value ? '#FFFFFF' : '#31506F',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="no-scrollbar" style={styles.content}>
        <section style={styles.overviewCard}>
          <div style={styles.overviewHeader}>
            <div>
              <span style={styles.sectionLabel}>요약</span>
              <h2 style={styles.overviewTitle}>
                {items.length === 0 ? '아직 분석할 기록이 없어요' : `${topCategory.label} 계열이 가장 많이 나타났어요`}
              </h2>
              <p style={styles.overviewCopy}>{overviewCopy}</p>
            </div>
            <span
              style={{
                ...styles.statusPill,
                background: careNeeded ? '#FFF0EA' : '#EEF8F0',
                color: careNeeded ? '#A4472E' : '#31653A',
              }}
            >
              {careNeeded ? '살핌 필요' : '안정'}
            </span>
          </div>

          <div style={styles.metricGrid}>
            <MetricCard label="기록한 날" value={`${activeDays}일`} />
            <MetricCard label="전체 원석" value={`${items.length}개`} />
            <MetricCard label="주요 계열" value={items.length === 0 ? '-' : topCategory.label} />
            <MetricCard label="긍정 원석" value={`${positiveCount}개`} />
          </div>
        </section>

        <section style={styles.card}>
          <SectionHeader title="감정 분포" caption="계열을 누르면 세부 감정을 볼 수 있어요." />
          <div style={styles.barList}>
            {categoryStats.map((category) => (
              <button
                key={category.code}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.code);
                  setDetailCategory(category.code);
                }}
                style={{
                  ...styles.categoryRow,
                  borderColor: selectedCategory === category.code ? category.color : 'transparent',
                  background: selectedCategory === category.code ? '#F7FAFC' : '#FFFFFF',
                }}
              >
                <span style={{ ...styles.categoryDot, background: category.color }} />
                <span style={styles.categoryName}>{category.label}</span>
                <span style={styles.barTrack}>
                  <span
                    style={{
                      ...styles.barFill,
                      width: `${Math.max(category.pct, category.count ? 10 : 2)}%`,
                      background: category.color,
                    }}
                  />
                </span>
                <strong style={styles.categoryValue}>{category.count}</strong>
                <span style={styles.detailCue}>상세</span>
              </button>
            ))}
          </div>
        </section>

        <section style={styles.actionGrid}>
          <article style={styles.actionCard}>
            <span style={styles.sectionLabel}>긍정 순간</span>
            <strong style={styles.actionTitle}>
              {latestPositive ? `${latestPositive.label}을 다시 볼게요` : '작게 괜찮았던 순간도 기록해요'}
            </strong>
            <p style={styles.actionText}>
              {latestPositive?.recordText
                ? latestPositive.recordText
                : latestPositive
                  ? `${latestPositive.label}이 남아 있던 순간이에요. 짧게 다시 떠올려도 충분해요.`
                  : '고마움, 편안함, 뿌듯함처럼 작은 긍정도 마음 회복에 중요한 단서가 돼요.'}
            </p>
          </article>

          <article style={styles.actionCard}>
            <span style={styles.sectionLabel}>감정인지 질문</span>
            <strong style={styles.actionTitle}>{focusQuestion}</strong>
            <div style={styles.promptOptions}>
              {(items.length === 0
                ? ['한 줄 기록', '사진 기록', '나중에']
                : ['무거웠어요', '빨라졌어요', '굳었어요', '편했어요']
              ).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedPromptOption(option)}
                  style={{
                    ...styles.promptOption,
                    background: selectedPromptOption === option ? '#E8F1FF' : '#FFFFFF',
                    borderColor: selectedPromptOption === option ? '#2459B4' : '#E2E8F0',
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </article>
        </section>
      </main>

      {detailCategory && (
        <DetailSheet
          category={CATEGORY_BY_CODE[detailCategory]}
          details={selectedDetails}
          total={categoryStats.find((category) => category.code === detailCategory)?.count ?? 0}
          topDetail={topDetail?.label ?? CATEGORY_BY_CODE[detailCategory].details[0]}
          hasItems={items.length > 0}
          onClose={() => setDetailCategory(null)}
        />
      )}
    </div>
  );
}

function SectionHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div style={styles.sectionHeader}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <p style={styles.sectionCaption}>{caption}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metricCard}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DetailSheet({
  category,
  details,
  total,
  topDetail,
  hasItems,
  onClose,
}: {
  category: Category;
  details: Array<{ label: string; count: number; pct: number }>;
  total: number;
  topDetail: string;
  hasItems: boolean;
  onClose: () => void;
}) {
  return (
    <div style={styles.sheetLayer}>
      <button type="button" aria-label="닫기" onClick={onClose} style={styles.sheetScrim} />
      <section style={styles.sheet} aria-label={`${category.label} 세부 감정`}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetHeader}>
          <div>
            <span style={styles.sectionLabel}>세부 감정</span>
            <h2 style={styles.sheetTitle}>{category.label} 계열</h2>
          </div>
          <div style={{ ...styles.sheetCount, borderColor: category.color }}>
            <strong>{total}</strong>
            <span>개</span>
          </div>
        </div>

        <p style={styles.sheetInsight}>
          {hasItems
            ? `${category.label} 안에서는 ${topDetail}이 가장 선명하게 나타났어요.`
            : '기록이 쌓이면 이 계열 안에서 어떤 감정이 잦았는지 보여줘요.'}
        </p>

        <div style={styles.sheetDetailList}>
          {details.map((detail) => (
            <div key={detail.label} style={styles.sheetDetailRow}>
              <span style={styles.sheetDetailName}>{detail.label}</span>
              <span style={styles.sheetBarTrack}>
                <span
                  style={{
                    ...styles.sheetBarFill,
                    width: `${Math.max(detail.pct, detail.count ? 10 : 3)}%`,
                    background: category.color,
                  }}
                />
              </span>
              <strong style={styles.sheetDetailValue}>{detail.count}</strong>
            </div>
          ))}
        </div>

        <button type="button" onClick={onClose} style={styles.sheetCloseButton}>
          확인
        </button>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#6FB6FF',
    color: '#172033',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '44px 22px 10px',
    flexShrink: 0,
  },
  eyebrow: {
    margin: '0 0 4px',
    color: '#2459B4',
    fontSize: 11,
    fontWeight: 800,
  },
  title: {
    margin: 0,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: 0,
  },
  totalBadge: {
    width: 58,
    height: 58,
    borderRadius: 16,
    background: '#FFFFFF',
    border: '2px solid rgba(36, 89, 180, 0.28)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#2459B4',
    boxShadow: '0 6px 0 rgba(37, 75, 139, 0.16)',
  },
  periodTabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    padding: '0 22px 14px',
    flexShrink: 0,
  },
  periodButton: {
    height: 36,
    border: '1px solid rgba(36, 89, 180, 0.2)',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '0 16px 28px',
  },
  overviewCard: {
    borderRadius: 12,
    background: '#FFFFFF',
    padding: 16,
    border: '1px solid rgba(36, 89, 180, 0.16)',
    boxShadow: '0 8px 0 rgba(37, 75, 139, 0.12)',
  },
  overviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  sectionLabel: {
    display: 'block',
    color: '#64748B',
    fontSize: 11,
    fontWeight: 800,
  },
  overviewTitle: {
    margin: '6px 0 0',
    color: '#172033',
    fontSize: 18,
    fontWeight: 900,
    lineHeight: 1.32,
    wordBreak: 'keep-all',
  },
  overviewCopy: {
    margin: '8px 0 0',
    color: '#475569',
    fontSize: 12,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
  },
  statusPill: {
    flexShrink: 0,
    borderRadius: 999,
    padding: '5px 9px',
    fontSize: 11,
    fontWeight: 900,
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    marginTop: 14,
  },
  metricCard: {
    minHeight: 58,
    borderRadius: 10,
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    textAlign: 'center',
    color: '#172033',
    fontSize: 10,
    fontWeight: 700,
  },
  card: {
    marginTop: 12,
    borderRadius: 12,
    background: '#FFFFFF',
    padding: 14,
    border: '1px solid rgba(36, 89, 180, 0.14)',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    margin: 0,
    color: '#172033',
    fontSize: 15,
    fontWeight: 900,
  },
  sectionCaption: {
    margin: '4px 0 0',
    color: '#64748B',
    fontSize: 11,
    lineHeight: 1.35,
  },
  barList: {
    display: 'grid',
    gap: 7,
  },
  categoryRow: {
    display: 'grid',
    gridTemplateColumns: '12px 42px 1fr 24px 34px',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
    border: '1px solid',
    borderRadius: 9,
    padding: '5px 7px',
    cursor: 'pointer',
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  categoryName: {
    color: '#172033',
    fontSize: 12,
    fontWeight: 900,
  },
  barTrack: {
    height: 9,
    borderRadius: 999,
    background: '#EEF2F7',
    overflow: 'hidden',
  },
  barFill: {
    display: 'block',
    height: '100%',
    borderRadius: 999,
  },
  categoryValue: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'right',
  },
  detailCue: {
    color: '#2459B4',
    fontSize: 10,
    fontWeight: 900,
    textAlign: 'right',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  detailItem: {
    borderRadius: 10,
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    padding: 10,
  },
  detailLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: 800,
  },
  detailValue: {
    display: 'block',
    marginTop: 4,
    color: '#172033',
    fontSize: 18,
    fontWeight: 900,
  },
  detailTrack: {
    display: 'block',
    height: 6,
    marginTop: 8,
    borderRadius: 999,
    background: '#E2E8F0',
    overflow: 'hidden',
  },
  detailFill: {
    display: 'block',
    height: '100%',
    borderRadius: 999,
  },
  actionGrid: {
    display: 'grid',
    gap: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  actionCard: {
    borderRadius: 12,
    background: '#FFFFFF',
    border: '1px solid rgba(36, 89, 180, 0.14)',
    padding: 14,
  },
  actionTitle: {
    display: 'block',
    marginTop: 7,
    color: '#172033',
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1.35,
    wordBreak: 'keep-all',
  },
  actionText: {
    margin: '8px 0 0',
    color: '#475569',
    fontSize: 12,
    lineHeight: 1.48,
    wordBreak: 'keep-all',
  },
  promptOptions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    marginTop: 12,
  },
  promptOption: {
    minHeight: 36,
    border: '1px solid',
    borderRadius: 8,
    color: '#172033',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  sheetLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheetScrim: {
    position: 'absolute',
    inset: 0,
    border: 0,
    background: 'rgba(15, 23, 42, 0.34)',
    cursor: 'pointer',
  },
  sheet: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxHeight: '72%',
    overflowY: 'auto',
    borderRadius: '18px 18px 0 0',
    background: '#FFFFFF',
    border: '1px solid rgba(36, 89, 180, 0.14)',
    padding: '10px 16px 18px',
    boxShadow: '0 -14px 32px rgba(15, 23, 42, 0.16)',
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    background: '#CBD5E1',
    margin: '0 auto 14px',
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitle: {
    margin: '5px 0 0',
    color: '#172033',
    fontSize: 20,
    fontWeight: 900,
  },
  sheetCount: {
    width: 54,
    height: 54,
    borderRadius: 14,
    border: '2px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#172033',
    background: '#F8FAFC',
  },
  sheetInsight: {
    margin: '14px 0',
    padding: '12px',
    borderRadius: 10,
    background: '#F8FAFC',
    color: '#475569',
    fontSize: 12,
    lineHeight: 1.48,
    wordBreak: 'keep-all',
  },
  sheetDetailList: {
    display: 'grid',
    gap: 9,
  },
  sheetDetailRow: {
    display: 'grid',
    gridTemplateColumns: '52px 1fr 28px',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
  },
  sheetDetailName: {
    color: '#172033',
    fontSize: 12,
    fontWeight: 900,
  },
  sheetBarTrack: {
    height: 9,
    borderRadius: 999,
    background: '#EEF2F7',
    overflow: 'hidden',
  },
  sheetBarFill: {
    display: 'block',
    height: '100%',
    borderRadius: 999,
  },
  sheetDetailValue: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'right',
  },
  sheetCloseButton: {
    width: '100%',
    height: 42,
    marginTop: 16,
    border: 0,
    borderRadius: 10,
    background: '#2459B4',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
  },
};
