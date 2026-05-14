// === Calendar 화면 — Figma 월별 캘린더 + 날짜 기록 패널 ===
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import type { Gem } from '../types/gem';
import { api, type ChatbotRecordDto } from '../lib/api';
import { getEmotion } from '../data/emotions';
import GemStone from '../components/pixel/GemStone';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CALENDAR_BG = '#6FB6FF';
const DAY_TILE = '#EDE2CC';
const DETAIL_PANEL = '#A0BCA8';
const TEXT_MAIN = '#1E3328';
const TEXT_SUB = '#3D6050';
const TITLE_TEXT = '#FFFFFF';

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

export default function Calendar() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const { gems, fetchInventory } = useInventoryStore();
  const [chatbotRecords, setChatbotRecords] = useState<ChatbotRecordDto[]>([]);

  useEffect(() => {
    fetchInventory();
    api.chatbotRecords(200).then((r) => setChatbotRecords(r.records)).catch(() => {});
  }, [fetchInventory]);

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
    const map: Record<string, ChatbotRecordDto[]> = {};
    chatbotRecords.forEach((record) => {
      const key = toDateKey(new Date(record.createdAt));
      if (!map[key]) map[key] = [];
      map[key].push(record);
    });
    return map;
  }, [chatbotRecords]);

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
                <GemDayTile gems={dayGems} selected={isSelected} />
                <span style={styles.dayNumber}>{cell.day}</span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedDate && (
        <DatePanel
          dateKey={selectedDate}
          gems={selectedGems}
          records={selectedRecords}
          onClose={() => setSelectedDate(null)}
        />
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

function GemDayTile({ gems, selected }: { gems: Gem[]; selected: boolean }) {
  const visibleGems = gems.slice(0, 4);

  return (
    <span
      style={{
        ...styles.dayTile,
        outline: selected ? `1px solid ${DETAIL_PANEL}` : 'none',
      }}
    >
      {visibleGems.length === 0 ? null : (
        <span style={styles.tileGemRow}>
          {visibleGems.map((gem) => (
            <span key={gem.id} style={styles.tileGemStone}>
              <GemStone gem={gem} size={8} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function DatePanel({
  dateKey,
  gems,
  records,
  onClose,
}: {
  dateKey: string;
  gems: Gem[];
  records: ChatbotRecordDto[];
  onClose: () => void;
}) {
  const [openedRecordId, setOpenedRecordId] = useState<number | null>(records[0]?.id ?? null);
  const primaryRecord = records.find((record) => record.id === openedRecordId) ?? records[0];
  const hasContent = gems.length > 0 || records.length > 0;

  useEffect(() => {
    setOpenedRecordId(records[0]?.id ?? null);
  }, [dateKey, records]);

  return (
    <section aria-label={`${formatKoreanDate(dateKey)} 기록`} style={styles.panel}>
      <button type="button" onClick={onClose} aria-label="캘린더 메인 화면으로 돌아가기" style={styles.panelHandle} />

      <div style={styles.panelTitle}>{formatKoreanDate(dateKey)}</div>

      {!hasContent ? (
        <p style={styles.emptyText}>이 날은 기록된 원석이 없어요.</p>
      ) : (
        <>
          <div style={styles.gemSummary}>
            {gems.slice(0, 4).map((gem) => {
              const emotion = getEmotion(gem.emotionCode);
              return (
                <button
                  key={gem.id}
                  type="button"
                  onClick={() => setOpenedRecordId(records[0]?.id ?? null)}
                  style={styles.summaryGemButton}
                >
                  <span style={styles.summaryGemStone}>
                    <GemStone gem={gem} size={24} variant={emotion?.nameKo} />
                  </span>
                  <span style={styles.summaryGemLabel}>{emotion?.nameKo ?? gem.emotionCode}</span>
                </button>
              );
            })}
          </div>

          <div style={styles.panelDivider} />

          {records.length > 1 && (
            <div style={styles.recordTabs}>
              {records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setOpenedRecordId(record.id)}
                  style={{
                    ...styles.recordTab,
                    background: record.id === openedRecordId ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
                  }}
                >
                  {new Date(record.createdAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </button>
              ))}
            </div>
          )}

          {primaryRecord ? (
            <RecordDetail record={primaryRecord} />
          ) : (
            <p style={styles.recordText}>채집한 원석을 캘린더에 담아두었어요.</p>
          )}
        </>
      )}
    </section>
  );
}

function RecordDetail({ record }: { record: ChatbotRecordDto }) {
  return (
    <div>
      {record.hasPhoto && (
        <div style={styles.photoBox}>
          {record.imageUrl ? (
            <img src={record.imageUrl} alt="" style={styles.photoImage} />
          ) : (
            <span>사용자가 올린 사진</span>
          )}
        </div>
      )}

      {record.recordText && (
        <>
          <div style={styles.recordLabel}>기록 내용</div>
          <p style={styles.recordText}>{record.recordText}</p>
        </>
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

  const yearOptions = [draftYear - 1, draftYear, draftYear + 1];
  const monthOptions = [
    (draftMonth + 11) % 12,
    draftMonth,
    (draftMonth + 1) % 12,
  ];

  return (
    <div style={styles.pickerLayer}>
      <div style={styles.pickerCard}>
        <div style={styles.pickerColumns}>
          <div style={styles.pickerColumn}>
            {yearOptions.map((option) => (
              <button
                key={option}
                type="button"
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

          <div style={styles.pickerColumn}>
            {monthOptions.map((option) => (
              <button
                key={`${draftYear}-${option}`}
                type="button"
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
    padding: '52px 20px 0',
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
    background: '#FFFDF5',
    border: '2px solid rgba(47, 95, 184, 0.28)',
    borderRadius: 12,
    padding: '14px 10px 16px',
    boxShadow: '0 8px 0 rgba(37, 75, 139, 0.14)',
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
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    rowGap: 8,
    columnGap: 5,
  },
  dayButton: {
    height: 34,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
    border: 0,
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
    outline: 'none',
  },
  dayTile: {
    width: 22,
    height: 22,
    borderRadius: 7,
    background: DAY_TILE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGemRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 8px)',
    gap: 1,
  },
  tileGemStone: {
    width: 8,
    height: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dayNumber: {
    color: 'rgba(86, 71, 48, 0.62)',
    fontSize: 9,
    lineHeight: 1,
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 78,
    minHeight: 132,
    maxHeight: 238,
    zIndex: 5,
    overflow: 'auto',
    background: DETAIL_PANEL,
    borderRadius: 12,
    padding: '9px 16px 16px',
    color: TEXT_MAIN,
    boxShadow: '0 10px 22px rgba(86, 71, 48, 0.08)',
  },
  panelHandle: {
    display: 'block',
    width: 42,
    height: 8,
    margin: '0 auto 7px',
    border: 0,
    borderRadius: 99,
    background: 'rgba(255, 255, 255, 0.24)',
    cursor: 'pointer',
    outline: 'none',
  },
  panelTitle: {
    color: TEXT_MAIN,
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
  },
  emptyText: {
    color: TEXT_SUB,
    fontSize: 11,
    margin: '18px 0 4px',
    textAlign: 'center',
  },
  gemSummary: {
    display: 'flex',
    gap: 11,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  summaryGemButton: {
    border: 0,
    background: 'transparent',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    outline: 'none',
  },
  summaryGemStone: {
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGemLabel: {
    color: TEXT_SUB,
    fontSize: 9,
    fontWeight: 600,
  },
  panelDivider: {
    height: 1,
    background: 'rgba(61, 96, 80, 0.34)',
    margin: '8px 0 10px',
  },
  recordTabs: {
    display: 'flex',
    gap: 6,
    marginBottom: 8,
  },
  recordTab: {
    border: '1px solid rgba(61, 96, 80, 0.18)',
    borderRadius: 99,
    color: TEXT_SUB,
    fontSize: 9,
    padding: '4px 8px',
    cursor: 'pointer',
    outline: 'none',
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
    margin: 0,
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
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
    display: 'grid',
    gap: 6,
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
