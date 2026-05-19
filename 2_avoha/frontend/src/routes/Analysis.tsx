// === Analysis 화면 — 상단 2박스 요약 + 패턴 아코디언 + 카테고리별 풀스크린 리캡 ===
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  category: CategoryCode;
  title: string;
  caption: string;
  tone: string;
  records: AnalysisItem[];
};

export type ReflectionPrompt = {
  source: 'unanswered' | 'answered' | 'static';
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

// 카테고리별 리캡 슬라이드: 긍정(joy) → 부정 순. 데이터 없는 카테고리는 스킵.
export function buildRecapThemes(items: AnalysisItem[]): RecapTheme[] {
  return RECAP_ORDER.reduce<RecapTheme[]>((acc, code) => {
    const records = items
      .filter((item) => item.category === code)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

// 자기회고 prompt 선택: 미답 → 답완 → 정적 fallback 순.
export function pickReflectionPrompt(records: ChatbotRecordDto[]): ReflectionPrompt {
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
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapIndex, setRecapIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
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
  const periodLabel = period === 'weekly' ? '이번 주' : period === 'monthly' ? '이번 달' : `${customRange.start} ~ ${customRange.end}`;
  const recapThemes = useMemo(() => buildRecapThemes(items), [items]);

  // 기간 필터된 records로 reflection prompt 산출.
  const recordsInPeriod = useMemo(() => {
    return records.filter((r) =>
      dateInAnalysisPeriod(new Date(r.createdAt), period, today, period === 'custom' ? customRange : undefined),
    );
  }, [records, period, today, customRange]);

  const reflectionPrompt = useMemo(() => pickReflectionPrompt(recordsInPeriod), [recordsInPeriod]);
  const totalSlides = recapThemes.length + 1; // +1: 마지막 자기회고 슬라이드

  // 풀스크린 진입 시 외부 스크롤 잠금 + 트랙 초기화.
  useEffect(() => {
    if (!recapOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // iOS Safari 첫 페인트 보정
    requestAnimationFrame(() => {
      trackRef.current?.scrollTo({ left: 0 });
      setRecapIndex(0);
    });
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [recapOpen]);

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
              const variantCounts = EMOTION_VARIANTS_BY_CATEGORY[category.code]
                .map((label) => ({
                  label,
                  count: categoryItems.filter((i) => i.label === label).length,
                }))
                .filter((v) => v.count > 0);
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

        {/* 영역 3: 리캡 CTA */}
        <section style={styles.recapBand}>
          <SectionHeader title="감정 리캡" />
          {recapThemes.length === 0 ? (
            <p style={styles.recapEmpty}>이번 기간엔 회고할 기록이 부족해요.</p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setRecapIndex(0);
                setRecapOpen(true);
              }}
              style={styles.recapStartButton}
              aria-label="감정 리캡 시작"
            >
              <span style={styles.recapStartTitle}>지금 리캡 보기</span>
              <span style={styles.recapStartMeta}>
                {recapThemes.length + 1}장 · {items.length}개 원석
              </span>
            </button>
          )}
        </section>
      </main>

      {/* 영역 3+4: 풀스크린 리캡 슬라이드 */}
      {recapOpen && (
        <div style={styles.recapFullscreen} role="dialog" aria-modal="true" aria-label="감정 리캡">
          <header style={styles.recapTopBar}>
            <span style={styles.recapPeriod}>{periodLabel} 리캡</span>
            <button
              type="button"
              onClick={() => setRecapOpen(false)}
              style={styles.recapCloseBtn}
              aria-label="리캡 닫기"
            >
              ×
            </button>
          </header>
          <div
            ref={trackRef}
            className="no-scrollbar"
            onScroll={(event) => {
              const next = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth);
              setRecapIndex(next);
            }}
            style={styles.recapTrack}
          >
            {recapThemes.map((theme) => (
              <article key={theme.id} style={{ ...styles.recapSlide, background: theme.tone }}>
                <span style={styles.recapSlideKicker}>{theme.caption}</span>
                <h2 style={styles.recapSlideTitle}>{theme.title}</h2>
                <ul style={styles.recapSlideRecords}>
                  {theme.records.slice(0, 5).map((record) => (
                    <li key={record.id} style={styles.recapSlideRow}>
                      {record.imageUrl ? (
                        <img src={record.imageUrl} alt="" style={styles.recapSlidePhoto} />
                      ) : (
                        <span style={styles.recapSlideGemSlot}>
                          <GemStone
                            gem={{
                              id: `recap-${record.id}`,
                              emotionCode: record.emotionCode,
                              tier: 2,
                              createdAt: record.createdAt,
                            }}
                            size={28}
                            variant={record.label}
                          />
                        </span>
                      )}
                      <div style={styles.recapSlideRowBody}>
                        <span style={styles.recapSlideMeta}>
                          {toDateKey(new Date(record.createdAt))} · {record.label}
                        </span>
                        <p style={styles.recapSlideText}>
                          {record.recordText ?? '텍스트 없이 원석만 남은 순간이에요.'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            <article style={{ ...styles.recapSlide, background: '#EDE2CC' }}>
              <span style={styles.recapSlideKicker}>마지막으로 한 가지만 더</span>
              <h2 style={styles.recapSlideTitle}>{reflectionPrompt.question}</h2>
              {reflectionPrompt.source === 'answered' && reflectionPrompt.answer && (
                <div style={styles.recapWrapAnswerBox}>
                  <span style={styles.recapWrapAnswerLabel}>지난번 내 답</span>
                  <p style={styles.recapWrapAnswerText}>{reflectionPrompt.answer}</p>
                </div>
              )}
              {reflectionPrompt.source === 'unanswered' && (
                <p style={styles.recapWrapHint}>아직 답하지 못한 질문이에요. 캘린더에서 마저 답해볼 수 있어요.</p>
              )}
              {reflectionPrompt.source === 'static' && (
                <p style={styles.recapWrapHint}>{periodLabel}을(를) 천천히 돌아봐요.</p>
              )}
            </article>
          </div>
          <div style={styles.recapDots} aria-hidden>
            {Array.from({ length: totalSlides }).map((_, i) => (
              <span
                key={i}
                style={{
                  ...styles.recapDot,
                  ...(i === recapIndex ? styles.recapDotActive : null),
                }}
              />
            ))}
          </div>
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
  recapStartButton: {
    marginTop: 6,
    width: '100%',
    border: 0,
    borderRadius: 12,
    background: '#A0BCA8',
    color: '#FFFFFF',
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(61, 96, 80, 0.18)',
  },
  recapStartTitle: {
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0.2,
  },
  recapStartMeta: {
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.85,
  },
  recapFullscreen: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    background: '#F9F4EA',
    display: 'flex',
    flexDirection: 'column',
  },
  recapTopBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'calc(14px + env(safe-area-inset-top)) 18px 10px',
    flexShrink: 0,
  },
  recapPeriod: {
    color: '#8B7355',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  recapCloseBtn: {
    width: 34,
    height: 34,
    border: 0,
    borderRadius: 999,
    background: '#EDE2CC',
    color: '#5A4A32',
    fontSize: 20,
    fontWeight: 800,
    cursor: 'pointer',
    outline: 'none',
  },
  recapTrack: {
    flex: 1,
    display: 'flex',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollSnapType: 'x mandatory',
  },
  recapSlide: {
    flex: '0 0 100%',
    scrollSnapAlign: 'start',
    padding: '24px 22px 84px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    overflow: 'hidden',
  },
  recapSlideKicker: {
    color: '#5A4A32',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  recapSlideTitle: {
    margin: 0,
    color: '#1E3328',
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1.25,
    wordBreak: 'keep-all',
  },
  recapSlideRecords: {
    margin: '6px 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
  },
  recapSlideRow: {
    display: 'grid',
    gridTemplateColumns: '64px 1fr',
    gap: 10,
    background: 'rgba(255,255,255,0.62)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'flex-start',
  },
  recapSlidePhoto: {
    width: 64,
    height: 64,
    objectFit: 'cover',
    borderRadius: 10,
    background: '#F9F4EA',
  },
  recapSlideGemSlot: {
    width: 64,
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.55)',
    borderRadius: 10,
  },
  recapSlideRowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  recapSlideMeta: {
    color: '#8B7355',
    fontSize: 11,
    fontWeight: 800,
  },
  recapSlideText: {
    margin: '4px 0 0',
    color: '#5A4A32',
    fontSize: 13,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  recapWrapAnswerBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.62)',
  },
  recapWrapAnswerLabel: {
    color: '#8B7355',
    fontSize: 10,
    fontWeight: 800,
  },
  recapWrapAnswerText: {
    margin: '4px 0 0',
    color: '#5A4A32',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'keep-all',
  },
  recapWrapHint: {
    margin: 0,
    color: '#5A4A32',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'keep-all',
  },
  recapDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 'calc(24px + env(safe-area-inset-bottom))',
    display: 'flex',
    justifyContent: 'center',
    gap: 6,
  },
  recapDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: 99,
    background: 'rgba(90,74,50,0.25)',
    transition: 'width 200ms ease, background 200ms ease',
  },
  recapDotActive: {
    width: 18,
    background: '#5A4A32',
  },
};
