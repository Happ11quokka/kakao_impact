// === Calendar 화면 — Figma 월별 캘린더 + 날짜 기록 패널 ===
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import type { Gem } from '../types/gem';
import type { RecordDto } from '../lib/api';
import { EMOTIONS, getEmotion } from '../data/emotions';
import GemStone from '../components/pixel/GemStone';
import PhotoLightbox from '../components/PhotoLightbox';
import { useRecordsStore } from '../stores/records-store';
import { buildRecordReclassifyAction } from '../lib/reclassify-flow';
import { buildRecordDetailedEmotionBadges, dedupeLogicalRecords } from '../lib/logical-record';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CALENDAR_BG = '#F9F4EA';
const DAY_TILE = '#EDE2CC';
const DETAIL_PANEL = '#A0BCA8';
const TEXT_MAIN = '#1E3328';
const TEXT_SUB = '#3D6050';
const TITLE_TEXT = '#564730';

type CalendarCell = {
  date: Date;
  key: string;
  day: number;
  inCurrentMonth: boolean;
};

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month);
  const prevDays = getDaysInMonth(year, month - 1);

  return Array.from({ length: 42 }, (_, index) => {
    const rawDay = index - firstDay + 1;
    const date =
      rawDay < 1
        ? new Date(year, month - 1, prevDays + rawDay)
        : rawDay > daysInMonth
          ? new Date(year, month + 1, rawDay - daysInMonth)
          : new Date(year, month, rawDay);

    return {
      date,
      key: toDateKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
    };
  });
}

function formatKoreanDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
}

export function calendarRecordEmotionCode(record: RecordDto): string | null {
  if (record.classificationStatus === 'needs_confirmation') return null;
  return record.confirmedEmotionCode ?? record.gemEmotionCode ?? null;
}

export function calendarRecordEmotionCodes(record: RecordDto): string[] {
  if (record.classificationStatus === 'needs_confirmation') return [];
  if (record.confirmedEmotionCodes && record.confirmedEmotionCodes.length > 0) {
    return record.confirmedEmotionCodes;
  }
  const primary = calendarRecordEmotionCode(record);
  return primary ? [primary] : [];
}

export function calendarRecordNeedsReclassification(record: RecordDto): boolean {
  return record.classificationStatus === 'needs_confirmation' || !calendarRecordEmotionCode(record);
}

export type RecordReflection = {
  question: string;
  answer: string | null;
};

export function buildRecordReflection(record: RecordDto): RecordReflection | null {
  const question = record.questionText?.trim();
  if (!question) return null;

  const answer = record.answerText?.trim() || null;
  return { question, answer };
}

export type CalendarReclassifyAccordionState = {
  needsReflection: boolean;
  pickerOpen: boolean;
  pickerToggleLabel: string | null;
  emotionLabel: string;
};

export function buildRecordTextSectionStyle(hasReflection: boolean): CSSProperties {
  return {
    marginTop: 0,
    marginBottom: hasReflection ? 10 : 0,
  };
}

export function buildRecordReflectionSectionStyle(): CSSProperties {
  return {
    marginTop: 8,
    padding: '10px 11px',
    border: '1px solid rgba(61, 96, 80, 0.14)',
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.62)',
    boxShadow: '0 8px 18px rgba(86, 71, 48, 0.05)',
  };
}

export function buildCalendarReclassifyAccordionState(
  record: RecordDto,
  requestedPickerOpen: boolean,
): CalendarReclassifyAccordionState {
  const action = buildRecordReclassifyAction(record);
  const needsReflection = action.interaction === 'reclassify';
  return {
    needsReflection,
    pickerOpen: needsReflection ? requestedPickerOpen : true,
    pickerToggleLabel: needsReflection ? '작성완료' : null,
    emotionLabel: needsReflection ? '이 원석의 감정을 다시 골라주세요' : '이 기록의 감정을 골라주세요',
  };
}

export function buildCalendarTimelineStyle(): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    marginBottom: 8,
  };
}

export function buildReclassifyBottomTabStyle(): CSSProperties {
  return {
    marginTop: 12,
    width: '100%',
    border: '1px solid rgba(255, 255, 255, 0.28)',
    borderRadius: 12,
    background: 'rgba(61, 96, 80, 0.96)',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 900,
    padding: '11px 12px',
    cursor: 'pointer',
    textAlign: 'center',
    boxShadow: '0 8px 18px rgba(30, 51, 40, 0.18)',
  };
}

export function buildReclassifyReflectionSubmitStyle(reflection: string, completed: boolean): CSSProperties {
  const hasText = reflection.trim().length > 0;
  if (completed) {
    return { display: 'none' };
  }
  return {
    marginTop: 2,
    width: '100%',
    border: '1px solid rgba(255, 255, 255, 0.24)',
    borderRadius: 10,
    background: completed
      ? 'rgba(61, 96, 80, 0.62)'
      : hasText
        ? 'rgba(61, 96, 80, 0.96)'
        : 'rgba(225, 237, 226, 0.74)',
    color: hasText || completed ? '#FFFFFF' : 'rgba(61, 96, 80, 0.72)',
    fontSize: 11,
    fontWeight: 900,
    padding: '10px 12px',
    cursor: hasText && !completed ? 'pointer' : 'default',
    textAlign: 'center',
    boxShadow: hasText && !completed ? '0 8px 18px rgba(30, 51, 40, 0.16)' : 'none',
    transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease',
  };
}

export function buildReclassifySecondaryActionStyle(): CSSProperties {
  return {
    marginTop: 8,
    width: '100%',
    border: 0,
    borderRadius: 99,
    background: '#F4E8CD',
    color: TEXT_MAIN,
    fontSize: 11,
    fontWeight: 900,
    padding: '10px 12px',
    cursor: 'pointer',
    textAlign: 'center',
  };
}

export function buildReclassifyEmotionPickerStyle(hasReflectionControls: boolean): CSSProperties {
  return {
    marginTop: hasReflectionControls ? 14 : 0,
  };
}

export function buildReclassifyReflectionBlockStyle(completed: boolean): CSSProperties {
  return {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    background: completed ? 'rgba(225, 237, 226, 0.86)' : 'rgba(255, 255, 255, 0.72)',
    border: completed ? '1px solid rgba(61, 96, 80, 0.18)' : '1px solid rgba(86, 71, 48, 0.08)',
    boxShadow: completed ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.2)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    transition: 'background 160ms ease, border 160ms ease, box-shadow 160ms ease',
  };
}

export function buildReclassifyReflectionSummaryStyle(): CSSProperties {
  return {
    margin: 0,
    padding: '8px 10px',
    borderRadius: 8,
    background: 'rgba(61, 96, 80, 0.08)',
    border: '1px solid rgba(61, 96, 80, 0.14)',
    color: TEXT_MAIN,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    lineHeight: 1.5,
    wordBreak: 'keep-all',
  };
}

export function buildCalendarSheetHeaderStyle(): CSSProperties {
  return {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    // grip 까지 헤더 안에 품어서 한 덩어리로 sticky. panel 의 top padding 을 0 으로
    // 두고 헤더를 최상단에 flush 시켜야 스크롤 중 grip/패딩이 헤더 위에서 따로
    // 스크롤되며 생기던 틈을 없앤다. 둥근 모서리도 panel 과 맞춰 이음새 제거.
    margin: '0 -18px 14px',
    padding: '12px 18px 12px',
    background: DETAIL_PANEL,
    borderRadius: '22px 22px 0 0',
    boxShadow: '0 8px 14px rgba(160, 188, 168, 0.74)',
  };
}

export type DayQuestionStatus = 'none' | 'unanswered' | 'answered';

// 하루에 받은 자기인지 질문 중 하나라도 답하면 answered.
export function dayQuestionStatus(records: RecordDto[]): DayQuestionStatus {
  const withQuestion = records.filter((r) => r.questionText?.trim());
  if (withQuestion.length === 0) return 'none';
  if (withQuestion.some((r) => r.answerText?.trim())) return 'answered';
  return 'unanswered';
}

export type CalendarEmotionDot = {
  id: string;
  emotionCode: string;
  color: string;
  label: string;
};

export type RecordGemBadge = {
  gem: Gem;
  label: string;
};

export function buildRecordGemBadges(record: RecordDto): RecordGemBadge[] {
  const detailedBadges = buildRecordDetailedEmotionBadges(record);
  const displayBadges = detailedBadges.length > 0
    ? detailedBadges
    : calendarRecordEmotionCodes(record).map((code) => ({ code, label: getEmotion(code)?.nameKo ?? code, gem: code }));
  const finalBadges = displayBadges.length > 0
    ? displayBadges
    : [{ code: 'unclassified', label: '미분류', gem: 'unclassified' }];

  return finalBadges.map((badge, index) => ({
    gem: {
      id:
        index === 0 && record.gemId && badge.code !== 'unclassified'
          ? record.gemId
          : `record-${record.id}-${badge.code}-${index}`,
      emotionCode: badge.code,
      tier: 1,
      createdAt: record.createdAt,
      consumedAt: null,
    },
    label: badge.label,
  }));
}

export function buildCalendarEmotionDots(gems: Gem[], maxDots = 4): CalendarEmotionDot[] {
  return gems.slice(0, maxDots).map((gem) => {
    const emotion = getEmotion(gem.emotionCode);
    return {
      id: gem.id,
      emotionCode: gem.emotionCode,
      color: emotion?.hexColor ?? getEmotion('unclassified')?.hexColor ?? '#7B95A8',
      label: emotion?.nameKo ?? gem.emotionCode,
    };
  });
}

export function buildCalendarDayDots(gems: Gem[], records: RecordDto[], maxDots = 4): CalendarEmotionDot[] {
  if (records.length === 0) return buildCalendarEmotionDots(gems, maxDots);

  return records
    .flatMap((record) => {
      const detailedBadges = buildRecordDetailedEmotionBadges(record);
      const displayBadges = detailedBadges.length > 0
        ? detailedBadges
        : calendarRecordEmotionCodes(record).map((code) => ({ code, label: getEmotion(code)?.nameKo ?? code, gem: code }));
      const finalBadges = displayBadges.length > 0
        ? displayBadges
        : [{ code: 'unclassified', label: '미분류', gem: 'unclassified' }];
      return finalBadges.map((badge, index) => {
        const emotion = getEmotion(badge.code);
        return {
          id:
            index === 0 && record.gemId && badge.code !== 'unclassified'
              ? record.gemId
              : `record-${record.id}-${badge.code}-${index}`,
          emotionCode: badge.code,
          color: emotion?.hexColor ?? getEmotion('unclassified')?.hexColor ?? '#7B95A8',
          label: badge.label,
        };
      });
    })
    .slice(0, maxDots);
}

export default function Calendar() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const { gems, fetchInventory } = useInventoryStore();
  const { records, fetchRecords, confirmEmotion, savingId } = useRecordsStore();
  const [recordToast, setRecordToast] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchRecords();
  }, [fetchInventory, fetchRecords]);

  const gemsByDate = useMemo(() => {
    const map: Record<string, Gem[]> = {};
    gems.forEach((gem) => {
      const key = toDateKey(new Date(gem.createdAt));
      if (!map[key]) map[key] = [];
      map[key].push(gem);
    });
    return map;
  }, [gems]);

  const recordsByDate = useMemo(() => {
    const map: Record<string, RecordDto[]> = {};
    records.forEach((record) => {
      const key = toDateKey(new Date(record.createdAt));
      if (!map[key]) map[key] = [];
      map[key].push(record);
    });
    for (const key of Object.keys(map)) {
      map[key] = dedupeLogicalRecords(map[key]);
    }
    return map;
  }, [records]);

  const cells = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewMonth, viewYear]);
  const selectedRecords = selectedDate ? recordsByDate[selectedDate] ?? [] : [];
  const selectedGems = selectedDate ? gemsByDate[selectedDate] ?? [] : [];

  function selectDate(cell: CalendarCell) {
    if (!cell.inCurrentMonth) {
      setViewYear(cell.date.getFullYear());
      setViewMonth(cell.date.getMonth());
    }
    setSelectedDate((prev) => (prev === cell.key ? null : cell.key));
    setMonthPickerOpen(false);
  }

  return (
    <div style={styles.screen}>
      <button
        type="button"
        onClick={() => {
          setSelectedDate(null);
          setMonthPickerOpen(true);
        }}
        aria-label="월 선택"
        style={styles.monthButton}
      >
        {viewYear}년 {viewMonth + 1}월 <span style={styles.caret}>▼</span>
      </button>

      <section aria-label="월별 캘린더" style={styles.calendarArea}>
        <div style={styles.weekHeader}>
          {WEEKDAYS.map((day) => (
            <span key={day} style={styles.weekday}>
              {day}
            </span>
          ))}
        </div>

        <div style={styles.grid}>
          {cells.map((cell) => {
            const dayGems = gemsByDate[cell.key] ?? [];
            const dayRecords = recordsByDate[cell.key] ?? [];
            const qStatus = dayQuestionStatus(dayRecords);
            const isSelected = cell.key === selectedDate;
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => selectDate(cell)}
                aria-pressed={isSelected}
                style={{
                  ...styles.dayButton,
                  opacity: cell.inCurrentMonth ? 1 : 0.58,
                }}
              >
                <GemDayTile gems={dayGems} records={dayRecords} selected={isSelected} questionStatus={qStatus} />
                <span style={styles.dayNumber}>{cell.day}</span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedDate && (
        <div style={styles.modalLayer} onClick={() => setSelectedDate(null)}>
          <DatePanel
            dateKey={selectedDate}
            gems={selectedGems}
            records={selectedRecords}
            savingId={savingId}
            onClose={() => setSelectedDate(null)}
            onConfirmEmotion={async (record, emotionCodes, reflectionAnswer) => {
              const interaction = buildRecordReclassifyAction(record).interaction;
              const trimmedReflection = reflectionAnswer.trim();
              const result = await confirmEmotion(record.id, emotionCodes, {
                interaction,
                reflectionType: trimmedReflection ? 'question' : 'none',
                reflectionAnswer: trimmedReflection || undefined,
              });
              const primary = getEmotion(emotionCodes[0]);
              const multiSuffix = emotionCodes.length > 1 ? ` 외 ${emotionCodes.length - 1}개` : '';
              setRecordToast(
                result.ok
                  ? interaction === 'confirm'
                    ? `${primary?.nameKo ?? '감정'}${multiSuffix} 원석으로 저장했어요`
                    : `${primary?.nameKo ?? '감정'}${multiSuffix} 원석으로 업데이트했어요`
                  : result.error ?? '감정 저장에 실패했어요',
              );
              window.setTimeout(() => setRecordToast(null), 2400);
            }}
          />
        </div>
      )}

      {recordToast && (
        <div role="status" style={styles.toast}>
          {recordToast}
        </div>
      )}

      {monthPickerOpen && (
        <MonthPicker
          year={viewYear}
          month={viewMonth}
          onCancel={() => setMonthPickerOpen(false)}
          onConfirm={(year, month) => {
            setViewYear(year);
            setViewMonth(month);
            setSelectedDate(null);
            setMonthPickerOpen(false);
          }}
        />
      )}

    </div>
  );
}

function GemDayTile({
  gems,
  records,
  selected,
  questionStatus,
}: {
  gems: Gem[];
  records: RecordDto[];
  selected: boolean;
  questionStatus: DayQuestionStatus;
}) {
  const emotionDots = buildCalendarDayDots(gems, records);

  return (
    <span
      style={{
        ...styles.dayTile,
        outline: selected ? `1px solid ${DETAIL_PANEL}` : 'none',
      }}
    >
      {emotionDots.length > 0 && (
        <span style={styles.tileGemRow} aria-label={`감정 ${emotionDots.length}개`}>
          {emotionDots.slice(0, 3).map((dot) => (
            <GemStone
              key={dot.id}
              gem={{
                id: dot.id,
                emotionCode: dot.emotionCode,
                tier: 1,
                createdAt: new Date().toISOString(),
                consumedAt: null,
              }}
              size={9}
              variant={dot.label}
            />
          ))}
          {emotionDots.length > 3 && (
            <span style={styles.tileGemMore} aria-label={`외 ${emotionDots.length - 3}개`}>
              +{emotionDots.length - 3}
            </span>
          )}
        </span>
      )}
      {questionStatus === 'answered' && (
        <span style={styles.tileMarkDone} aria-label="자기인지 질문 답변 완료">
          ✓
        </span>
      )}
      {questionStatus === 'unanswered' && (
        <span style={styles.tileMarkDot} aria-label="자기인지 질문 미답변" />
      )}
    </span>
  );
}

function DatePanel({
  dateKey,
  gems,
  records,
  savingId,
  onClose,
  onConfirmEmotion,
}: {
  dateKey: string;
  gems: Gem[];
  records: RecordDto[];
  savingId: number | null;
  onClose: () => void;
  onConfirmEmotion: (
    record: RecordDto,
    emotionCodes: string[],
    reflectionAnswer: string,
  ) => Promise<void>;
}) {
  const [detailRecordId, setDetailRecordId] = useState<number | null>(null);
  const [pickerRecordId, setPickerRecordId] = useState<number | null>(null);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [pickerReflection, setPickerReflection] = useState<string>('');
  const [pickerReflectionCompleted, setPickerReflectionCompleted] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const pickerRecord = records.find((record) => record.id === pickerRecordId) ?? null;
  const hasContent = gems.length > 0 || records.length > 0;
  const pickerIsReclassify = pickerRecord
    ? buildRecordReclassifyAction(pickerRecord).interaction === 'reclassify'
    : false;

  const questionRecords = records.filter((r) => r.questionText?.trim());
  const sortedRecords = [...records].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  // 기록과 원석이 같은 이벤트의 다른 표현이므로 기록이 있으면 기록만, 없으면 원석만 노출.
  const sortedGems = records.length === 0
    ? [...gems].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  useEffect(() => {
    setDetailRecordId(null);
    setPickerRecordId(null);
    setPickerSelection([]);
    setPickerReflection('');
    setPickerReflectionCompleted(false);
  }, [dateKey, records]);

  useEffect(() => {
    setPickerReflection('');
    setPickerReflectionCompleted(false);
  }, [detailRecordId]);

  useEffect(() => {
    if (pickerRecord) {
      setPickerSelection(
        pickerIsReclassify ? calendarRecordEmotionCodes(pickerRecord) : [],
      );
    } else {
      setPickerSelection([]);
    }
  }, [pickerRecord, pickerIsReclassify]);

  return (
    <section
      aria-label={`${formatKoreanDate(dateKey)} 기록`}
      style={styles.panel}
      onClick={(event) => event.stopPropagation()}
    >
      <header style={styles.sheetHeader}>
        <span style={styles.panelGrip} aria-hidden />
        <div style={styles.sheetHeaderRow}>
          <span style={styles.sheetDate}>{formatKoreanDate(dateKey)}</span>
          <button type="button" onClick={onClose} aria-label="팝업 닫기" style={styles.sheetClose}>
            ×
          </button>
        </div>
      </header>

      {!hasContent && (
        <p style={styles.emptyText}>이 날은 기록된 원석이 없어요.</p>
      )}

      {(sortedRecords.length > 0 || sortedGems.length > 0) && (
        <section style={styles.timeline} aria-label="시간순 기록">
          {sortedRecords.map((record) => {
            const needsReclassification = calendarRecordNeedsReclassification(record);
            return (
              <article key={`row-${record.id}`} style={styles.timelineRow}>
                <span style={styles.timelineTime}>
                  {new Date(record.createdAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div
                  style={{
                    ...styles.timelineCard,
                    ...(needsReclassification ? styles.timelineCardCandidate : null),
                  }}
                >
                  <RecordDetail
                    record={record}
                    detailOpen={detailRecordId === record.id}
                    onToggleDetail={() => {
                      if (detailRecordId === record.id) {
                        setDetailRecordId(null);
                        setPickerRecordId(null);
                      } else {
                        setDetailRecordId(record.id);
                        setPickerRecordId(null);
                      }
                    }}
                    onPhotoClick={setLightboxUrl}
                  />
                  {detailRecordId === record.id && (
                    <ReclassifyAccordion
                      record={record}
                      selection={pickerSelection}
                      saving={savingId === record.id}
                      reflection={pickerReflection}
                      reflectionCompleted={pickerReflectionCompleted}
                      pickerOpen={pickerRecordId === record.id}
                      onToggleEmotion={(emotionCode) => {
                        setPickerSelection((prev) =>
                          prev.includes(emotionCode)
                            ? prev.filter((code) => code !== emotionCode)
                            : [...prev, emotionCode],
                        );
                      }}
                      onReflectionChange={(value) => {
                        setPickerReflection(value);
                        setPickerReflectionCompleted(false);
                      }}
                      onCompleteReflection={() => setPickerReflectionCompleted(true)}
                      onOpenPicker={() => setPickerRecordId(record.id)}
                      onSave={() =>
                        void onConfirmEmotion(record, pickerSelection, pickerReflection).then(
                          () => {
                            setDetailRecordId(null);
                            setPickerRecordId(null);
                            setPickerSelection([]);
                            setPickerReflection('');
                            setPickerReflectionCompleted(false);
                          },
                        )
                      }
                    />
                  )}
                </div>
              </article>
            );
          })}
          {sortedGems.map((gem) => {
            const emotion = getEmotion(gem.emotionCode);
            return (
              <article key={`gem-${gem.id}`} style={styles.timelineRow}>
                <span style={styles.timelineTime}>
                  {new Date(gem.createdAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div style={styles.timelineCard}>
                  <div style={styles.gemOnlyRow}>
                    <GemStone gem={gem} size={28} variant={emotion?.nameKo} />
                    <span style={styles.gemOnlyLabel}>
                      {emotion?.nameKo ?? gem.emotionCode} 원석
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {questionRecords.length > 0 && (
        <section style={styles.questionBlock} aria-label="이 날의 성찰">
          <div style={styles.questionBlockHeader}>
            <span style={styles.questionLabel}>이 날의 성찰</span>
          </div>
          {questionRecords.map((qr) => (
            <div key={`q-${qr.id}`} style={styles.questionItem}>
              <p style={styles.questionPrompt}>Q. {qr.questionText}</p>
              {qr.answerText ? (
                <p style={styles.questionAnswer}>{qr.answerText}</p>
              ) : (
                <span style={styles.questionMissing}>아직 답하지 못했어요</span>
              )}
            </div>
          ))}
        </section>
      )}

      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </section>
  );
}

function RecordDetail({
  record,
  detailOpen,
  onToggleDetail,
  onPhotoClick,
}: {
  record: RecordDto;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onPhotoClick?: (url: string) => void;
}) {
  const reflection = buildRecordReflection(record);
  const gemBadges = buildRecordGemBadges(record);
  const action = buildRecordReclassifyAction(record);
  const topButtonLabel = detailOpen ? '닫기' : action.label;
  const topButtonAria = detailOpen ? '감정 자세히보기 닫기' : action.ariaLabel;

  return (
    <div>
      {record.hasPhoto && (
        <div style={styles.photoBox}>
          {record.imageUrl ? (
            <button
              type="button"
              onClick={() => onPhotoClick?.(record.imageUrl!)}
              aria-label="사진 크게 보기"
              style={styles.photoButton}
            >
              <img src={record.imageUrl} alt="" style={styles.photoImage} />
            </button>
          ) : (
            <span>사용자가 올린 사진</span>
          )}
        </div>
      )}

      <div style={styles.recordMetaRow}>
        <div style={styles.recordGemBadgeRow}>
          {gemBadges.length > 0 ? (
            gemBadges.map((badge) => (
              <span key={badge.gem.id} style={styles.recordGemBadge}>
                <GemStone gem={badge.gem} size={22} variant={badge.label} />
                <span style={styles.recordGemBadgeLabel}>{badge.label}</span>
              </span>
            ))
          ) : (
            <span style={styles.recordMetaPill}>미분류 원석</span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleDetail}
          aria-label={topButtonAria}
          aria-expanded={detailOpen}
          style={styles.reclassifyOpenButton}
        >
          {topButtonLabel}
        </button>
      </div>

      {record.recordText && (
        <div style={buildRecordTextSectionStyle(Boolean(reflection))}>
          <div style={styles.recordLabel}>기록 내용</div>
          <p style={styles.recordText}>{record.recordText}</p>
        </div>
      )}

      {reflection && (
        <div style={styles.reflectionBox}>
          <div style={styles.recordLabel}>자기인지 질문</div>
          <p style={styles.reflectionQuestion}>{reflection.question}</p>
          {reflection.answer && (
            <>
              <div style={styles.reflectionAnswerLabel}>답변</div>
              <p style={styles.reflectionAnswer}>{reflection.answer}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReclassifyAccordion({
  record,
  selection,
  saving,
  reflection,
  reflectionCompleted,
  pickerOpen,
  onToggleEmotion,
  onReflectionChange,
  onCompleteReflection,
  onOpenPicker,
  onSave,
}: {
  record: RecordDto;
  selection: string[];
  saving: boolean;
  reflection: string;
  reflectionCompleted: boolean;
  pickerOpen: boolean;
  onToggleEmotion: (emotionCode: string) => void;
  onReflectionChange: (value: string) => void;
  onCompleteReflection: () => void;
  onOpenPicker: () => void;
  onSave: () => void;
}) {
  const action = buildRecordReclassifyAction(record);
  const state = buildCalendarReclassifyAccordionState(record, pickerOpen);
  const canSave = selection.length > 0 && !saving;

  return (
    <div style={styles.reclassifyBox} aria-label={`${action.label} 아코디언`}>
      {state.needsReflection && (
        <div style={buildReclassifyReflectionBlockStyle(reflectionCompleted)}>
          <div style={styles.recordLabel}>이 한 줄 회고</div>
          <p style={styles.reclassifyReflectionQuestion}>
            Q. 이 기록에 대해서 한줄로 표현한다면 어떤 문장일까요?
          </p>
          {reflectionCompleted ? (
            <p style={styles.reclassifyReflectionSummary}>
              {reflection.trim() || '한 줄 회고 없이 감정을 다시 골라볼게요.'}
            </p>
          ) : (
            <textarea
              value={reflection}
              maxLength={200}
              placeholder="짧게 한 문장으로 적어도 괜찮아요."
              disabled={saving}
              onChange={(event) => onReflectionChange(event.target.value)}
              style={styles.reclassifyReflectionTextarea}
            />
          )}
          {!reflectionCompleted && (
            <button
              type="button"
              disabled={!reflection.trim() || saving}
              onClick={onCompleteReflection}
              aria-label="한 줄 회고 작성완료"
              style={buildReclassifyReflectionSubmitStyle(reflection, reflectionCompleted)}
            >
              작성완료
            </button>
          )}
        </div>
      )}

      {state.needsReflection && !state.pickerOpen && (
        <button
          type="button"
          onClick={onOpenPicker}
          aria-label="감정 재분류하기"
          style={styles.reclassifySecondaryAction}
        >
          감정 재분류하기
        </button>
      )}

      {state.pickerOpen && (
        <div style={buildReclassifyEmotionPickerStyle(state.needsReflection)}>
          <div style={styles.recordLabel}>{state.emotionLabel}</div>
          <p style={styles.reclassifyHint}>여러 감정이 함께 떠오르면 모두 골라주세요.</p>
          <div style={styles.emotionGrid}>
            {EMOTIONS.map((emotion) => {
              const selected = selection.includes(emotion.code);
              return (
                <button
                  key={emotion.code}
                  type="button"
                  disabled={saving}
                  onClick={() => onToggleEmotion(emotion.code)}
                  style={{
                    ...styles.emotionButton,
                    border: selected
                      ? `2px solid ${emotion.hexColor}`
                      : `1px solid ${emotion.hexColor}66`,
                    background: selected ? `${emotion.hexColor}55` : `${emotion.hexColor}18`,
                    cursor: saving ? 'wait' : 'pointer',
                    position: 'relative',
                  }}
                >
                  {emotion.nameKo}
                  {selected && (
                    <span aria-hidden="true" style={styles.emotionCheckMark}>✓</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!canSave}
            onClick={onSave}
            style={{
              ...styles.reclassifySaveButton,
              background: canSave ? 'rgba(61, 107, 80, 0.94)' : '#C9C3B7',
              cursor: canSave ? 'pointer' : 'wait',
            }}
          >
            {selection.length === 0 ? '감정을 골라주세요' : `감정 ${selection.length}개 저장`}
          </button>
        </div>
      )}
    </div>
  );
}

function MonthPicker({
  year,
  month,
  onCancel,
  onConfirm,
}: {
  year: number;
  month: number;
  onCancel: () => void;
  onConfirm: (year: number, month: number) => void;
}) {
  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);
  const yearColRef = useRef<HTMLDivElement>(null);
  const monthColRef = useRef<HTMLDivElement>(null);

  const yearOptions = Array.from({ length: 15 }, (_, index) => year - 7 + index);
  const monthOptions = Array.from({ length: 12 }, (_, index) => index);

  useEffect(() => {
    yearColRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-value="${draftYear}"]`)
      ?.scrollIntoView({ block: 'center' });
    monthColRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-value="${draftMonth}"]`)
      ?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={styles.pickerLayer}>
      <div style={styles.pickerCard}>
        <div style={styles.pickerColumns}>
          <div ref={yearColRef} style={styles.pickerColumn}>
            {yearOptions.map((option) => (
              <button
                key={option}
                type="button"
                data-value={option}
                onClick={() => setDraftYear(option)}
                style={{
                  ...styles.pickerOption,
                  fontWeight: option === draftYear ? 700 : 400,
                  color: option === draftYear ? TEXT_MAIN : 'rgba(86, 71, 48, 0.45)',
                }}
              >
                {option}년
              </button>
            ))}
          </div>

          <div ref={monthColRef} style={styles.pickerColumn}>
            {monthOptions.map((option) => (
              <button
                key={`${draftYear}-${option}`}
                type="button"
                data-value={option}
                onClick={() => setDraftMonth(option)}
                style={{
                  ...styles.pickerOption,
                  fontWeight: option === draftMonth ? 700 : 400,
                  color: option === draftMonth ? TEXT_MAIN : 'rgba(86, 71, 48, 0.45)',
                }}
              >
                {option + 1}월
              </button>
            ))}
          </div>
        </div>

        <div style={styles.pickerActions}>
          <button type="button" onClick={onCancel} style={{ ...styles.pickerAction, background: '#C9C3B7' }}>
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(draftYear, draftMonth)}
            style={{ ...styles.pickerAction, background: DETAIL_PANEL, color: '#FFFFFF' }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: CALENDAR_BG,
    color: TEXT_MAIN,
    fontFamily: 'var(--font-sans)',
    padding: 'calc(42px + env(safe-area-inset-top)) 18px calc(90px + env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
  },
  monthButton: {
    display: 'block',
    margin: '0 auto 18px',
    border: 0,
    background: 'transparent',
    color: TITLE_TEXT,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '6px 10px',
    outline: 'none',
  },
  caret: {
    color: '#3D6050',
    fontSize: 9,
    verticalAlign: '1px',
  },
  calendarArea: {
    position: 'relative',
    zIndex: 1,
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    marginBottom: 8,
  },
  weekday: {
    textAlign: 'center',
    color: 'rgba(86, 71, 48, 0.48)',
    fontSize: 9,
    fontWeight: 600,
  },
  grid: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gridTemplateRows: 'repeat(6, 1fr)',
    rowGap: 8,
    columnGap: 6,
  },
  dayButton: {
    minHeight: 0,
    height: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    border: 0,
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
    outline: 'none',
  },
  dayTile: {
    position: 'relative',
    width: 'min(42px, 10.5vw)',
    height: 'min(42px, 10.5vw)',
    borderRadius: 12,
    background: DAY_TILE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMarkDone: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 13,
    height: 13,
    borderRadius: '50%',
    background: '#FFFFFF',
    color: '#3D6050',
    fontSize: 9,
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
  },
  tileMarkDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#D08A48',
    boxShadow: '0 0 0 2px #F9F4EA',
  },
  tileGemRow: {
    position: 'absolute',
    top: 4,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    maxWidth: 36,
    pointerEvents: 'none',
  },
  tileGemMore: {
    marginLeft: 1,
    color: 'rgba(86, 71, 48, 0.7)',
    fontSize: 7,
    fontWeight: 800,
    lineHeight: 1,
  },
  dayNumber: {
    color: 'rgba(86, 71, 48, 0.62)',
    fontSize: 9,
    lineHeight: 1,
  },
  modalLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'stretch',
    padding: 0,
    background: 'rgba(30, 51, 40, 0.16)',
  },
  panel: {
    position: 'relative',
    width: '100%',
    maxHeight: '55vh',
    zIndex: 31,
    overflow: 'auto',
    background: DETAIL_PANEL,
    borderRadius: '22px 22px 0 0',
    padding: '0 18px calc(96px + env(safe-area-inset-bottom))',
    color: TEXT_MAIN,
    boxShadow: '0 -10px 28px rgba(30, 51, 40, 0.18)',
  },
  panelGrip: {
    display: 'block',
    width: 40,
    height: 4,
    margin: '0 auto',
    borderRadius: 99,
    background: 'rgba(30, 51, 40, 0.22)',
  },
  sheetHeader: {
    ...buildCalendarSheetHeaderStyle(),
  },
  sheetHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sheetDate: {
    color: TEXT_MAIN,
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0.2,
  },
  sheetClose: {
    flexShrink: 0,
    width: 28,
    height: 28,
    border: 0,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.32)',
    color: TEXT_MAIN,
    fontSize: 18,
    fontWeight: 800,
    cursor: 'pointer',
    outline: 'none',
  },
  questionBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: '1px solid rgba(255,255,255,0.22)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  questionBlockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  questionLabel: {
    color: TEXT_SUB,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  questionItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  questionPrompt: {
    margin: 0,
    color: TEXT_MAIN,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.4,
    wordBreak: 'keep-all',
  },
  questionAnswer: {
    margin: 0,
    color: TEXT_MAIN,
    fontSize: 11,
    lineHeight: 1.5,
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  questionMissing: {
    color: '#A65E1B',
    fontSize: 11,
    fontWeight: 800,
  },
  timeline: {
    ...buildCalendarTimelineStyle(),
  },
  timelineRow: {
    display: 'grid',
    gridTemplateColumns: '46px 1fr',
    gap: 8,
    alignItems: 'flex-start',
  },
  timelineTime: {
    color: TEXT_SUB,
    fontSize: 10,
    fontWeight: 800,
    paddingTop: 8,
  },
  timelineCard: {
    background: 'rgba(255,255,255,0.22)',
    borderRadius: 12,
    padding: 10,
  },
  timelineCardCandidate: {
    background: 'rgba(244, 232, 205, 0.55)',
    border: '1px solid rgba(208, 138, 72, 0.45)',
  },
  gemOnlyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  gemOnlyLabel: {
    color: TEXT_MAIN,
    fontSize: 12,
    fontWeight: 800,
  },
  emptyText: {
    color: TEXT_SUB,
    fontSize: 12,
    margin: '22px 0 4px',
    textAlign: 'center',
  },
  photoBox: {
    width: '100%',
    height: 92,
    borderRadius: 9,
    background: '#EDE2CC',
    color: 'rgba(30, 51, 40, 0.64)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    margin: '4px 0 12px',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  photoButton: {
    display: 'block',
    width: '100%',
    height: '100%',
    padding: 0,
    margin: 0,
    border: 0,
    background: 'transparent',
    cursor: 'zoom-in',
    WebkitTapHighlightColor: 'transparent',
  },
  recordLabel: {
    color: TEXT_SUB,
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 4,
  },
  recordText: {
    color: TEXT_MAIN,
    fontSize: 11,
    lineHeight: 1.55,
    margin: '0 0 10px',
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  reflectionBox: {
    ...buildRecordReflectionSectionStyle(),
  },
  reflectionQuestion: {
    margin: '0 0 8px',
    color: TEXT_MAIN,
    fontSize: 11,
    lineHeight: 1.45,
    fontWeight: 700,
    wordBreak: 'keep-all',
  },
  reflectionAnswerLabel: {
    margin: '8px 0 4px',
    color: TEXT_SUB,
    fontSize: 9,
    fontWeight: 800,
  },
  reflectionAnswer: {
    margin: 0,
    color: TEXT_MAIN,
    fontSize: 11,
    lineHeight: 1.5,
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  recordMetaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  recordGemBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    minWidth: 0,
  },
  recordGemBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    padding: '3px 9px 3px 5px',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.24)',
    color: TEXT_SUB,
    fontSize: 10,
    fontWeight: 800,
  },
  recordGemBadgeLabel: {
    lineHeight: 1,
  },
  recordMetaPill: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
    padding: '0 9px',
    borderRadius: 99,
    background: 'rgba(255, 255, 255, 0.2)',
    color: TEXT_SUB,
    fontSize: 10,
    fontWeight: 800,
  },
  reclassifyOpenButton: {
    border: 0,
    borderRadius: 99,
    background: '#F4E8CD',
    color: TEXT_MAIN,
    fontSize: 10,
    fontWeight: 800,
    padding: '6px 10px',
    cursor: 'pointer',
  },
  reclassifyBottomTab: {
    ...buildReclassifyBottomTabStyle(),
  },
  reclassifySecondaryAction: {
    ...buildReclassifySecondaryActionStyle(),
  },
  reclassifyBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
  },
  reclassifyHint: {
    color: TEXT_SUB,
    fontSize: 10,
    lineHeight: 1.45,
    margin: '0 0 10px',
  },
  reclassifyTextarea: {
    width: '100%',
    minHeight: 64,
    marginBottom: 10,
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid rgba(86, 71, 48, 0.16)',
    background: 'rgba(255, 255, 255, 0.78)',
    color: TEXT_MAIN,
    fontSize: 11,
    lineHeight: 1.45,
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  reclassifyAnswerCard: {
    margin: '0 0 12px',
    padding: '9px 10px',
    borderRadius: 10,
    background: 'rgba(255, 255, 255, 0.34)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: TEXT_MAIN,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.5,
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  emotionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
  },
  emotionButton: {
    minHeight: 36,
    borderRadius: 10,
    color: TEXT_MAIN,
    fontSize: 10,
    fontWeight: 800,
    padding: '0 4px',
  },
  emotionCheckMark: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 9,
    fontWeight: 800,
    color: TEXT_SUB,
  },
  reclassifySaveButton: {
    width: '100%',
    minHeight: 38,
    marginTop: 10,
    border: 'none',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 800,
  },
  reclassifyReflectionBlock: {
    ...buildReclassifyReflectionBlockStyle(false),
  },
  reclassifyReflectionQuestion: {
    margin: 0,
    color: TEXT_MAIN,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.45,
    wordBreak: 'keep-all',
  },
  reclassifyReflectionTextarea: {
    width: '100%',
    minHeight: 60,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid rgba(86, 71, 48, 0.14)',
    background: '#FFFFFF',
    color: TEXT_MAIN,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    lineHeight: 1.5,
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
  },
  reclassifyReflectionSummary: {
    ...buildReclassifyReflectionSummaryStyle(),
  },
  toast: {
    position: 'absolute',
    left: '50%',
    bottom: 104,
    transform: 'translateX(-50%)',
    zIndex: 60,
    padding: '9px 14px',
    borderRadius: 999,
    background: 'rgba(61, 107, 80, 0.94)',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 800,
    boxShadow: '0 10px 24px rgba(30, 51, 40, 0.18)',
  },
  pickerLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    background: 'rgba(249, 244, 234, 0.72)',
    paddingTop: 138,
  },
  pickerCard: {
    width: 268,
    margin: '0 auto',
    borderRadius: 8,
    background: '#F4E8CD',
    padding: '26px 28px 22px',
    boxShadow: '0 10px 22px rgba(86, 71, 48, 0.08)',
  },
  pickerColumns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 28,
  },
  pickerColumn: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 168,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    paddingRight: 2,
  },
  pickerOption: {
    height: 25,
    border: 0,
    borderTop: '1px solid rgba(86, 71, 48, 0.18)',
    borderBottom: '1px solid rgba(86, 71, 48, 0.18)',
    background: 'transparent',
    fontSize: 12,
    cursor: 'pointer',
    outline: 'none',
  },
  pickerActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 11,
  },
  pickerAction: {
    height: 31,
    border: 0,
    borderRadius: 6,
    color: TEXT_MAIN,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
  },
};
