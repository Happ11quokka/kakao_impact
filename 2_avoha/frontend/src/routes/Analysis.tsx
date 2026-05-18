// === Analysis 화면 — 감정 요약 + 패턴 + 자기인지 질문 ===
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import type { Gem } from '../types/gem';
import { api, type ChatbotRecordDto } from '../lib/api';
import { getEmotion } from '../data/emotions';
import { emotionToCategory, type CategoryCode } from '../lib/emotion-category';
import { EMOTION_VARIANTS_BY_CATEGORY } from '../data/emotion-variants';
import GemStone from '../components/pixel/GemStone';

type Period = 'weekly' | 'monthly' | 'custom';

type Category = {
  code: CategoryCode;
  label: string;
  color: string;
  soft: string;
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

  const topItems = useMemo(() => {
    const counts = new Map<string, { label: string; color: string; count: number; emotionCode: string }>();
    items.forEach((item) => {
      const prev = counts.get(item.label) ?? { label: item.label, color: item.color, count: 0, emotionCode: item.emotionCode };
      counts.set(item.label, { ...prev, count: prev.count + 1 });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  }, [items]);

  const selectedDetails = useMemo(() => {
    const category = CATEGORY_BY_CODE[selectedCategory];
    const details = category.details.map((label) => ({
      label,
      count: items.filter((item) => item.category === selectedCategory && item.label === label).length,
    }));
    const selectedCount = items.filter((item) => item.category === selectedCategory).length;
    if (selectedCount > 0 && details.every((detail) => detail.count === 0)) details[0].count = selectedCount;
    return details.map((detail, index) => ({
      ...detail,
      count: detail.count || (index === 0 ? selectedCount : 0),
      pct: selectedCount ? Math.round(((detail.count || (index === 0 ? selectedCount : 0)) / selectedCount) * 100) : 0,
    }));
  }, [items, selectedCategory]);

  const timeStats = useMemo(() => {
    const buckets = [
      { label: '아침', start: 5, end: 11, count: 0 },
      { label: '낮', start: 11, end: 17, count: 0 },
      { label: '저녁', start: 17, end: 22, count: 0 },
      { label: '밤', start: 22, end: 29, count: 0 },
    ];
    items.forEach((item) => {
      const hour = new Date(item.createdAt).getHours();
      const normalized = hour < 5 ? hour + 24 : hour;
      const bucket = buckets.find((entry) => normalized >= entry.start && normalized < entry.end) ?? buckets[0];
      bucket.count += 1;
    });
    const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
    return buckets.map((bucket) => ({ ...bucket, pct: Math.round((bucket.count / max) * 100) }));
  }, [items]);

  const topCategory = categoryStats.slice().sort((a, b) => b.count - a.count)[0] ?? CATEGORIES[0];
  const positiveCount = items.filter((item) => item.category === 'joy').length;
  const negativeCount = items.filter((item) => item.category === 'sadness' || item.category === 'anger' || item.category === 'anxiety').length;
  const careNeeded = items.length > 0 && negativeCount / items.length >= 0.7;
  const activeDays = new Set(items.map((item) => toDateKey(new Date(item.createdAt)))).size;
  const periodLabel = period === 'weekly' ? '이번 주' : period === 'monthly' ? '이번 달' : '최근 2주';
  const selectedCategoryMeta = CATEGORY_BY_CODE[selectedCategory];

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
            <div style={styles.topGemCluster} aria-label="상위 감정 원석">
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
          )}
        </section>

        <section style={styles.section}>
          <SectionHeader title="감정 패턴 시각화" caption="계열별 분포 / 직전 기간 대비" />
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

        <section style={styles.detailBand}>
          <SectionHeader title="계열별 세부 감정 분석" caption={`${selectedCategoryMeta.label} 안에서 더 자세히 보기`} />
          <div style={styles.detailList}>
            {selectedDetails.map((detail) => (
              <div key={detail.label} style={styles.detailRow}>
                <span style={styles.detailLabel}>{detail.label}</span>
                <span style={styles.detailTrack}>
                  <span
                    style={{
                      ...styles.detailFill,
                      width: `${Math.max(detail.pct, detail.count ? 14 : 4)}%`,
                      background: selectedCategoryMeta.color,
                    }}
                  />
                </span>
                <span style={styles.detailCount}>{detail.count}</span>
              </div>
            ))}
          </div>
          <p style={styles.insightText}>
            {items.length === 0
              ? '아직 분석할 원석이 없어요. 기록이 쌓이면 세부 패턴이 보여요.'
              : `${selectedCategoryMeta.label} 중에서도 ${selectedDetails.slice().sort((a, b) => b.count - a.count)[0]?.label ?? selectedCategoryMeta.details[0]}을 가장 자주 마주했어요.`}
          </p>
        </section>

        <section style={styles.section}>
          <SectionHeader title="시간대별 감정원석 분포" caption="기록이 자주 쌓이는 시간" />
          <div style={styles.timeGrid}>
            {timeStats.map((bucket) => (
              <div key={bucket.label} style={styles.timeColumn}>
                <div style={styles.timeBarWrap}>
                  <div style={{ ...styles.timeBar, height: `${Math.max(bucket.pct, 8)}%` }} />
                </div>
                <span style={styles.timeLabel}>{bucket.label}</span>
                <span style={styles.timeCount}>{bucket.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.questionBand}>
          <span style={styles.sectionLabel}>주간 자기인지 질문 recap</span>
          {items.length === 0 ? (
            <>
              <p style={styles.questionText}>이번 기간엔 아직 돌아볼 순간이 쌓이지 않았어요.</p>
              <p style={styles.questionHint}>한 줄 기록이 충분해요. 짧은 마음 한 조각만 남겨도 다음에 꺼내볼 수 있어요.</p>
            </>
          ) : (
            <>
              <p style={styles.questionText}>{topCategory.label}이 올라왔던 순간은 주로 언제였나요?</p>
              <p style={styles.questionHint}>이유를 캐묻기보다, 장소나 상황을 하나만 떠올려도 충분해요.</p>
            </>
          )}
        </section>

        <section style={styles.section}>
          <SectionHeader
            title={period === 'monthly' ? '월간 감정 리포트' : period === 'weekly' ? '주간 감정 리포트' : '최근 2주 Summary'}
            caption="이번 기간의 마음 여정"
          />
          <p style={styles.journeyText}>
            {items.length === 0
              ? `${periodLabel}엔 아직 기록된 원석이 없어요.`
              : `${periodLabel} ${items.length}개의 순간을 기록했어요. ${topCategory.label}을 가장 많이 마주했고, 긍정 원석도 ${positiveCount}번 남아 있어요.`}
          </p>
          <div style={styles.miniStats}>
            <MiniStat label="기록한 날" value={`${activeDays}일`} />
            <MiniStat label="긍정 원석" value={`${positiveCount}개`} />
            <MiniStat label="케어 상태" value={careNeeded ? '살핌 필요' : '안정'} />
          </div>
        </section>

        <section
          style={{
            ...styles.careBand,
            background: items.length === 0 ? '#EDE2CC' : careNeeded ? '#EBCDC6' : '#DCE7D8',
          }}
        >
          <span style={styles.sectionLabel}>
            {items.length === 0 ? '시작 가이드' : careNeeded ? '행동 추천 카드' : 'Recap'}
          </span>
          {items.length === 0 ? (
            <>
              <strong style={styles.careTitle}>마음 한 조각부터 시작해볼까요</strong>
              <p style={styles.careText}>카카오톡 챗봇에 짧은 메시지를 보내면, 그 순간이 원석으로 바뀌어 여기에 쌓여요.</p>
            </>
          ) : (
            <>
              <strong style={styles.careTitle}>{careNeeded ? '묵직한 감정이 조금 쌓였어요' : '빛났던 순간을 다시 볼게요'}</strong>
              <p style={styles.careText}>
                {careNeeded
                  ? '오늘은 완료 여부를 묻지 않을게요. 물 한 잔, 짧은 산책, 편한 사람에게 안부 보내기 중 하나만 골라보세요.'
                  : '좋았던 감정은 작게 다시 보는 것만으로도 마음에 오래 남아요.'}
              </p>
            </>
          )}
        </section>
      </main>
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
      <GemStone gem={previewGem} size={34} variant={label} />
      <span style={styles.gemLabel}>{label}</span>
      <span style={styles.gemCount}>x{count}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.miniStat}>
      <span style={styles.miniValue}>{value}</span>
      <span style={styles.miniLabel}>{label}</span>
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
    padding: '30px 22px 10px',
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
    width: 58,
    height: 58,
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
    padding: '0 22px 14px',
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
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '0 16px 24px',
  },
  summaryBand: {
    display: 'grid',
    gridTemplateColumns: '1.15fr 0.85fr',
    gap: 12,
    minHeight: 148,
    background: '#A0BCA8',
    borderRadius: 0,
    padding: '18px 16px',
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
    marginTop: 8,
    color: '#1E3328',
    fontSize: 19,
    lineHeight: 1.28,
    wordBreak: 'keep-all',
  },
  summaryCopy: {
    margin: '10px 0 0',
    color: '#3D6050',
    fontSize: 12,
    lineHeight: 1.48,
    wordBreak: 'keep-all',
  },
  topGemCluster: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gemBubble: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    width: 48,
  },
  gemStone: {
    display: 'block',
    width: 34,
    height: 44,
    borderRadius: 11,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.32)',
  },
  gemLabel: {
    width: 50,
    textAlign: 'center',
    color: '#1E3328',
    fontSize: 10,
    fontWeight: 800,
  },
  gemCount: {
    color: '#3D6050',
    fontSize: 10,
    fontWeight: 700,
  },
  section: {
    marginTop: 14,
    background: '#FFFFFF',
    borderRadius: 8,
    padding: '15px 14px',
    boxShadow: '0 2px 10px rgba(90, 74, 50, 0.03)',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    margin: 0,
    color: '#5A4A32',
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: 0,
  },
  sectionCaption: {
    margin: '4px 0 0',
    color: '#8B7355',
    fontSize: 11,
    lineHeight: 1.35,
  },
  barList: {
    display: 'grid',
    gap: 7,
  },
  categoryRow: {
    display: 'grid',
    gridTemplateColumns: '12px 42px 1fr 36px',
    alignItems: 'center',
    gap: 8,
    minHeight: 30,
    border: 0,
    borderRadius: 6,
    padding: '3px 5px',
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
    height: 10,
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
    margin: '12px 0 0',
    color: '#5A4A32',
    fontSize: 12,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
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
