// === Home 화면 — 오늘의 감정 호수 ===
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import { useRecordsStore } from '../stores/records-store';
import { EMOTIONS, getEmotion } from '../data/emotions';
import CollectionBook from './CollectionBook';
import ChibiAvatar from '../components/field/ChibiAvatar';
import GemStone from '../components/pixel/GemStone';
import type { RecordDto } from '../lib/api';
import { buildReclassifyFlowState } from '../lib/reclassify-flow';

const CANDIDATE_SLOTS = [
  { x: 30, y: 48 },
  { x: 70, y: 42 },
  { x: 50, y: 24 },
];

const CONFIRMED_SLOTS = [
  { x: 73, y: 62 },
  { x: 26, y: 66 },
  { x: 50, y: 32 },
  { x: 76, y: 36 },
  { x: 25, y: 34 },
  { x: 62, y: 78 },
];

const MASCOT_START = { x: 50, y: 66 };
const LAKE_MOVE_RADIUS = 48;
const PROXIMITY_PROMPT_RADIUS = 18;
const JOYSTICK_KNOB_LIMIT = 24;
const JOYSTICK_SPEED = 0.036;
const MASCOT_SIZE = 58;
const GEM_BOX_SLOT_COUNT = 5;

type FieldPosition = { x: number; y: number };
type ReflectionType = 'question' | 'none';
type ReflectionMode = 'idle' | 'choice' | 'picker';
type ReclassifyReflectionOption = {
  type: Exclude<ReflectionType, 'none'>;
  label: string;
};
type LakeStone = {
  record: RecordDto;
  position: FieldPosition;
  emotionCodes: string[];
  status: 'candidate' | 'confirmed';
};

function clampToLake(position: FieldPosition): FieldPosition {
  const dx = position.x - 50;
  const dy = position.y - 50;
  const d = Math.hypot(dx, dy);
  if (d <= LAKE_MOVE_RADIUS) {
    return {
      x: Math.max(2, Math.min(98, position.x)),
      y: Math.max(2, Math.min(98, position.y)),
    };
  }
  const scale = LAKE_MOVE_RADIUS / d;
  return {
    x: 50 + dx * scale,
    y: 50 + dy * scale,
  };
}

function distance(a: FieldPosition, b: FieldPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isSameLocalDate(iso: string, base = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === base.getFullYear() &&
    d.getMonth() === base.getMonth() &&
    d.getDate() === base.getDate()
  );
}

function recordEmotionCode(record: RecordDto): string | null {
  return (
    record.confirmedEmotionCode ??
    record.gemEmotionCode ??
    record.aiEmotionCode ??
    null
  );
}

function confirmedEmotionCodes(record: RecordDto): string[] {
  if (record.classificationStatus === 'needs_confirmation') return [];
  if (record.confirmedEmotionCodes && record.confirmedEmotionCodes.length > 0) {
    return record.confirmedEmotionCodes;
  }
  const fallback = recordEmotionCode(record);
  return fallback ? [fallback] : [];
}

type HomeStoneGemLayoutItem = {
  code: string;
  x: number;
  y: number;
  size: number;
};

export function buildHomeStoneGemLayout(codes: string[], singleSize = 38): HomeStoneGemLayoutItem[] {
  const visibleCodes = codes.slice(0, 5);
  if (visibleCodes.length <= 1) {
    return visibleCodes.map((code) => ({ code, x: 0, y: 0, size: singleSize }));
  }

  const layouts: Array<Array<Omit<HomeStoneGemLayoutItem, 'code'>>> = [
    [],
    [{ x: 0, y: 0, size: singleSize }],
    [
      { x: -10, y: 0, size: 18 },
      { x: 10, y: 0, size: 18 },
    ],
    [
      { x: -9, y: 4, size: 16 },
      { x: 9, y: 4, size: 16 },
      { x: 0, y: -10, size: 16 },
    ],
    [
      { x: -9, y: -8, size: 15 },
      { x: 9, y: -8, size: 15 },
      { x: -9, y: 9, size: 15 },
      { x: 9, y: 9, size: 15 },
    ],
    [
      { x: 0, y: -12, size: 13 },
      { x: -11, y: -4, size: 13 },
      { x: 11, y: -4, size: 13 },
      { x: -7, y: 10, size: 13 },
      { x: 7, y: 10, size: 13 },
    ],
  ];

  return visibleCodes.map((code, index) => ({ code, ...layouts[visibleCodes.length][index] }));
}

type ActiveRecordGemBadge = {
  code: string;
  label: string;
};

export function buildActiveRecordGemBadges(record: RecordDto | null): ActiveRecordGemBadge[] {
  if (!record) return [];
  return confirmedEmotionCodes(record).map((code) => ({
    code,
    label: getEmotion(code)?.nameKo ?? code,
  }));
}

export function buildReclassifyReflectionOptions(): ReclassifyReflectionOption[] {
  return [{ type: 'question', label: '자기인지 질문' }];
}

type TodayGemBoxItem = {
  record: RecordDto;
  emotionCode: string;
  label: string;
  status: 'candidate' | 'confirmed';
};

export function buildTodayGemBoxItems(records: RecordDto[], base = new Date()): TodayGemBoxItem[] {
  return records
    .filter((record) => isSameLocalDate(record.createdAt, base))
    .map<TodayGemBoxItem | null>((record) => {
      if (record.classificationStatus === 'needs_confirmation') {
        return null;
      }

      const emotionCode = recordEmotionCode(record);
      if (!emotionCode) return null;
      return {
        record,
        emotionCode,
        label: getEmotion(emotionCode)?.nameKo ?? emotionCode,
        status: 'confirmed',
      };
    })
    .filter((item): item is TodayGemBoxItem => Boolean(item))
    .sort((a, b) => new Date(a.record.createdAt).getTime() - new Date(b.record.createdAt).getTime());
}

function formatRecordTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function stonePromptText(stone: LakeStone, emotionName?: string): string {
  if (stone.status === 'candidate' && stone.record.entryMode === 'plain_record') {
    return '기록의 원석을 알아볼까요?';
  }
  if (stone.status === 'candidate') {
    return '감정 원석을 확인할까요?';
  }
  if (stone.record.entryMode === 'emotion_classification') {
    return '저장한 감정을 살펴볼까요?';
  }
  return `${emotionName ?? '감정'} 기록을 열어볼까요?`;
}

function stonePromptLabel(stone: LakeStone, emotionName?: string): string {
  if (stone.status === 'candidate' && stone.record.entryMode === 'plain_record') {
    return '기록의 원석 열어보기';
  }
  if (stone.status === 'candidate') {
    return '감정 원석 열어보기';
  }
  return `${emotionName ?? '감정'} 원석 기록 열어보기`;
}

export default function Home() {
  const { fetchInventory } = useInventoryStore();
  const { records, fetchRecords, confirmEmotion, savingId } = useRecordsStore();
  const [showBook, setShowBook] = useState(false);
  const [recordToast, setRecordToast] = useState<string | null>(null);
  const [emotionPickerOpen, setEmotionPickerOpen] = useState(false);
  const [reflectionMode, setReflectionMode] = useState<ReflectionMode>('idle');
  const [selectedReflectionType, setSelectedReflectionType] = useState<ReflectionType>('none');
  const [reclassifyAnswer, setReclassifyAnswer] = useState('');
  const [reclassifyAnswerSubmitted, setReclassifyAnswerSubmitted] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [mascotPosition, setMascotPosition] = useState<FieldPosition>(MASCOT_START);
  const [joystick, setJoystick] = useState({ active: false, x: 0, y: 0 });
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchRecords();
  }, [fetchInventory, fetchRecords]);

  useEffect(() => {
    if (!activeRecordId) return;
    if (!records.some((record) => record.id === activeRecordId)) {
      setActiveRecordId(null);
    }
  }, [activeRecordId, records]);

  useEffect(() => {
    if (reflectionMode === 'picker' && activeRecordId) {
      const target = records.find((r) => r.id === activeRecordId);
      const existing = target?.confirmedEmotionCodes ?? [];
      setPickerSelection(existing);
    }
  }, [reflectionMode, activeRecordId, records]);


  useEffect(() => {
    if (!joystick.active) {
      lastFrameRef.current = null;
      return undefined;
    }

    let raf = 0;
    const tick = (now: number) => {
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(now - last, 32);
      lastFrameRef.current = now;
      const vector = joystickVectorRef.current;
      setMascotPosition((position) =>
        clampToLake({
          x: position.x + vector.x * dt * JOYSTICK_SPEED,
          y: position.y + vector.y * dt * JOYSTICK_SPEED,
        }),
      );
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [joystick.active]);

  const todayRecords = useMemo(
    () => records.filter((record) => isSameLocalDate(record.createdAt)),
    [records],
  );

  const lakeStones = useMemo<LakeStone[]>(() => {
    let candidateIndex = 0;
    let confirmedIndex = 0;

    return todayRecords
      .slice(0, CANDIDATE_SLOTS.length + CONFIRMED_SLOTS.length)
      .map<LakeStone>((record) => {
        const isCandidate = record.classificationStatus === 'needs_confirmation';
        const slot = isCandidate
          ? CANDIDATE_SLOTS[candidateIndex++ % CANDIDATE_SLOTS.length]
          : CONFIRMED_SLOTS[confirmedIndex++ % CONFIRMED_SLOTS.length];
        const recordCodes = confirmedEmotionCodes(record);
        const codes: string[] = isCandidate
          ? [record.aiEmotionCode ?? record.gemEmotionCode ?? 'regret']
          : recordCodes.length > 0
            ? recordCodes
            : [recordEmotionCode(record) ?? 'untroubled'];
        return {
          record,
          position: slot,
          emotionCodes: codes,
          status: isCandidate ? 'candidate' : 'confirmed',
        };
      });
  }, [todayRecords]);

  const todayGemBoxItems = useMemo(
    () => buildTodayGemBoxItems(todayRecords),
    [todayRecords],
  );

  const activeRecord = activeRecordId
    ? todayRecords.find((record) => record.id === activeRecordId) ?? null
    : null;
  const activeStatus =
    activeRecord?.classificationStatus === 'needs_confirmation' ? 'candidate' : 'confirmed';
  const activeEmotionCode = activeRecord ? recordEmotionCode(activeRecord) : null;
  const activeEmotion = activeEmotionCode ? getEmotion(activeEmotionCode) : undefined;
  const activeGemBadges = buildActiveRecordGemBadges(activeRecord);
  const activeGemLabel = activeGemBadges.length > 0
    ? activeGemBadges.map((badge) => badge.label).join('·')
    : activeEmotion?.nameKo ?? '감정';
  const suggestedEmotion =
    activeRecord?.classificationStatus === 'needs_confirmation'
      ? getEmotion(activeRecord.aiEmotionCode ?? activeRecord.gemEmotionCode ?? 'regret')
      : activeEmotion;
  const activeNeedsWebReview = Boolean(
    activeRecord &&
      activeRecord.entryMode === 'emotion_classification' &&
      activeStatus === 'confirmed' &&
      !activeRecord.webReviewedAt,
  );
  const activeCanReclassify = Boolean(activeRecord && activeStatus === 'confirmed' && activeEmotionCode);
  const reclassifyFlow = buildReclassifyFlowState(reclassifyAnswer, reclassifyAnswerSubmitted);
  const showEmotionGrid =
    (activeStatus === 'candidate' && (!suggestedEmotion || emotionPickerOpen)) ||
    (activeCanReclassify && reflectionMode === 'picker');

  const candidateCount = lakeStones.filter((stone) => stone.status === 'candidate').length;
  const confirmedCount = lakeStones.filter((stone) => stone.status === 'confirmed').length;
  const nearbyStone = useMemo(() => {
    if (activeRecord || showBook) return null;
    return (
      lakeStones
        .map((stone) => ({
          stone,
          distance: distance(mascotPosition, stone.position),
        }))
        .filter((item) => item.distance <= PROXIMITY_PROMPT_RADIUS)
        .sort((a, b) => a.distance - b.distance)[0]?.stone ?? null
    );
  }, [activeRecord, lakeStones, mascotPosition, showBook]);
  const nearbyEmotion = nearbyStone ? getEmotion(nearbyStone.emotionCodes[0]) : undefined;

  const resetReviewControls = () => {
    setEmotionPickerOpen(false);
    setReflectionMode('idle');
    setSelectedReflectionType('none');
    setReclassifyAnswer('');
    setReclassifyAnswerSubmitted(false);
  };

  const submitReclassifyAnswer = () => {
    if (!reclassifyAnswer.trim()) return;
    setReclassifyAnswerSubmitted(true);
    setSelectedReflectionType('question');
    setReflectionMode('picker');
    setEmotionPickerOpen(true);
  };

  const handleReclassifyAnswerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitReclassifyAnswer();
  };

  const openRecordSheet = (recordId: number) => {
    resetReviewControls();
    setRecordToast(null);
    setActiveRecordId(recordId);
    setPickerSelection([]);
  };

  const closeRecordSheet = () => {
    setActiveRecordId(null);
    resetReviewControls();
    setPickerSelection([]);
    setMascotPosition(MASCOT_START);
    stopJoystick();
  };

  const handleConfirmRecord = async (
    emotionCode: string,
    opts: {
      interaction?: 'confirm' | 'reclassify';
      reflectionType?: ReflectionType;
      emotionCodes?: string[];
      reflectionAnswer?: string;
    } = {},
  ) => {
    if (!activeRecord) return;
    const wasCandidate = activeRecord.classificationStatus === 'needs_confirmation';
    const interaction = opts.interaction ?? (wasCandidate ? 'confirm' : 'reclassify');
    const codes = opts.emotionCodes && opts.emotionCodes.length > 0 ? opts.emotionCodes : [emotionCode];
    const result = await confirmEmotion(activeRecord.id, codes, {
      interaction,
      reflectionType: opts.reflectionType ?? 'none',
      reflectionAnswer: opts.reflectionAnswer,
    });
    resetReviewControls();
    setPickerSelection([]);
    if (result.ok) {
      closeRecordSheet();
    }
    const primaryEmotion = getEmotion(codes[0]);
    const multiSuffix = codes.length > 1 ? ` 외 ${codes.length - 1}개` : '';
    setRecordToast(
      result.ok
        ? interaction === 'confirm' && wasCandidate
          ? `${primaryEmotion?.nameKo ?? '감정'}${multiSuffix} 원석으로 저장했어요`
          : interaction === 'confirm'
            ? `${primaryEmotion?.nameKo ?? '감정'}${multiSuffix} 원석으로 확정했어요`
          : `${primaryEmotion?.nameKo ?? '감정'}${multiSuffix} 원석으로 업데이트했어요`
        : result.error ?? '저장에 실패했어요',
    );
    window.setTimeout(() => setRecordToast(null), 2400);
  };

  const updateJoystick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const rawDistance = Math.hypot(dx, dy);
    const scale = rawDistance > JOYSTICK_KNOB_LIMIT ? JOYSTICK_KNOB_LIMIT / rawDistance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setJoystick({ active: true, x, y });
    joystickVectorRef.current = {
      x: rawDistance === 0 ? 0 : dx / rawDistance,
      y: rawDistance === 0 ? 0 : dy / rawDistance,
    };
  };

  function stopJoystick() {
    joystickVectorRef.current = { x: 0, y: 0 };
    setJoystick({ active: false, x: 0, y: 0 });
  }

  const handleJoystickPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };

  const todayDateString = useMemo(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${month}월 ${date}일 ${days[now.getDay()]}요일`;
  }, []);

  const lakeHelper =
    lakeStones.length > 0
      ? '아보하를 움직여 오늘의 감정을 찾아보세요.'
      : '카카오톡 챗봇에서 오늘 마음을 남기면 호수에 원석이 생겨요.';

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        position: 'relative',
        background: 'var(--color-base)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 20px 10px',
        paddingTop: 'calc(16px + env(safe-area-inset-top))',
        paddingBottom: 10,
        overflowY: 'hidden',
        overflowX: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8, flexShrink: 0 }}>
        <div
          style={{
            background: 'var(--color-point-yellow)',
            borderRadius: 14,
            padding: '7px 14px',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-sub)' }}>
            {todayDateString}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowBook(true)}
          style={{
            background: 'var(--color-point-yellow)',
            borderRadius: 14,
            padding: '8px 17px',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--color-text-main)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          도감
        </button>
      </div>

      <section
        aria-label="오늘의 마음"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          height: 474,
          flexShrink: 0,
          marginBottom: 8,
        }}
      >
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-main)' }}>
              오늘의 마음
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, lineHeight: 1.35, color: 'var(--color-text-sub)' }}>
              {lakeHelper}
            </p>
          </div>

          <div
            style={{
              position: 'relative',
              width: 316,
              height: 316,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 48% 42%, rgba(255,255,255,0.66) 0%, rgba(239,236,218,0.94) 49%, rgba(220,230,215,0.76) 78%, rgba(205,222,211,0.52) 100%)',
              boxShadow:
                'inset 0 0 0 1px rgba(61, 107, 80, 0.06), inset 0 -22px 60px rgba(126, 104, 66, 0.08)',
              overflow: 'visible',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {lakeStones.map((stone) => {
              const primaryCode = stone.emotionCodes[0];
              const emotion = getEmotion(primaryCode);
              const isCandidate = stone.status === 'candidate';
              const isPlainConfirmed =
                !isCandidate && stone.record.entryMode === 'plain_record';
              const isEmotionConfirmed =
                !isCandidate && stone.record.entryMode === 'emotion_classification';
              const primaryHex = emotion?.hexColor ?? '#9AA89A';
              const stoneSize = isCandidate ? 54 : 58;
              const gemSize = isCandidate ? 34 : 38;
              const visibleCodes = stone.emotionCodes.slice(0, 5);
              const gemLayout = buildHomeStoneGemLayout(visibleCodes, gemSize);
              const extraCount = stone.emotionCodes.length - visibleCodes.length;
              const border = isCandidate
                ? '1px dashed rgba(61, 96, 80, 0.38)'
                : isPlainConfirmed
                  ? 'none'
                  : `1.5px solid ${primaryHex}AA`;
              const background = isCandidate
                ? 'rgba(255, 255, 255, 0.22)'
                : isPlainConfirmed
                  ? 'transparent'
                  : `radial-gradient(circle, ${primaryHex}26 0%, ${primaryHex}10 55%, transparent 82%)`;
              const boxShadow = isEmotionConfirmed
                ? `0 0 22px 6px ${primaryHex}55, 0 8px 20px rgba(86,71,48,0.09)`
                : isPlainConfirmed
                  ? '0 4px 10px rgba(86,71,48,0.06)'
                  : '0 10px 24px rgba(61, 96, 80, 0.08)';
              return (
                <button
                  key={`${stone.status}-${stone.record.id}`}
                  type="button"
                  onClick={() => openRecordSheet(stone.record.id)}
                  aria-label={
                    isCandidate && stone.record.entryMode === 'plain_record'
                      ? '확인 필요한 기록 원석 열기'
                      : isCandidate
                      ? `${emotion?.nameKo ?? '감정'} 후보 원석 기록 확인하기`
                      : stone.emotionCodes.length > 1
                        ? `${emotion?.nameKo ?? primaryCode} 외 ${stone.emotionCodes.length - 1}개 감정 원석 기록 열기`
                        : `${emotion?.nameKo ?? primaryCode} 원석 기록 열기`
                  }
                  title={
                    isCandidate && stone.record.entryMode === 'plain_record'
                      ? '기록의 원석'
                      : isCandidate
                        ? '확인 필요한 감정'
                        : stone.emotionCodes.length > 1
                          ? `${emotion?.nameKo ?? primaryCode} 외 ${stone.emotionCodes.length - 1}개 감정`
                          : `${emotion?.nameKo ?? primaryCode} 원석`
                  }
                  style={{
                    position: 'absolute',
                    left: `${stone.position.x}%`,
                    top: `${stone.position.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: stoneSize,
                    height: stoneSize,
                    borderRadius: '50%',
                    border,
                    background,
                    boxShadow,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 4,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'relative',
                      width: gemSize,
                      height: gemSize,
                      animation: isCandidate
                        ? 'candidateGemPulse 1.8s ease-in-out infinite'
                        : 'gemFloat 3s ease-in-out infinite',
                    }}
                  >
                    {gemLayout.map((item, i) => (
                      <span
                        key={`${item.code}-${i}`}
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          transform: `translate(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px))`,
                          zIndex: i + 1,
                        }}
                      >
                        <GemStone
                          gem={{
                            id: `${stone.status}-${stone.record.id}-${item.code}-${i}`,
                            emotionCode: item.code,
                            tier: 1,
                            createdAt: stone.record.createdAt,
                            consumedAt: null,
                          }}
                          size={item.size}
                        />
                      </span>
                    ))}
                    {extraCount > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          right: -8,
                          top: -6,
                          minWidth: 16,
                          height: 16,
                          padding: '0 4px',
                          borderRadius: 999,
                          background: 'rgba(61,107,80,0.92)',
                          color: '#FFFFFF',
                          fontSize: 9,
                          fontWeight: 800,
                          lineHeight: '16px',
                          textAlign: 'center',
                          zIndex: 10,
                        }}
                      >
                        +{extraCount}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {todayRecords.length === 0 && (
              <div
                style={{
                  width: 148,
                  padding: '14px 12px',
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.24)',
                  border: '1px solid rgba(126,104,66,0.08)',
                  textAlign: 'center',
                  color: 'var(--color-text-sub)',
                  fontSize: 12,
                  lineHeight: 1.45,
                  zIndex: 3,
                }}
              >
                오늘 기록을 기다리는 중
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                left: `${mascotPosition.x}%`,
                top: `${mascotPosition.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 5,
                animation: 'mascotBreathe 3.6s ease-in-out infinite',
                transition: joystick.active ? 'none' : 'left 0.18s ease, top 0.18s ease',
              }}
            >
              <div style={{ filter: 'saturate(0.9) contrast(0.96)' }}>
                <ChibiAvatar size={MASCOT_SIZE} mood="idle" />
              </div>
            </div>

            <div
              role="slider"
              aria-label="아보하 이동 조이스틱"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.hypot(joystick.x, joystick.y))}
              onPointerDown={handleJoystickPointerDown}
              onPointerMove={(event) => {
                if (joystick.active) updateJoystick(event);
              }}
              onPointerUp={stopJoystick}
              onPointerCancel={stopJoystick}
              style={{
                position: 'absolute',
                right: 12,
                bottom: -34,
                width: 64,
                height: 64,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle at 50% 28%, #F7EFDA 0%, #DCC9A0 58%, #B89A6A 100%)',
                border: '1px solid rgba(86, 71, 48, 0.22)',
                boxShadow:
                  'inset 0 -3px 6px rgba(86,71,48,0.28), inset 0 2px 4px rgba(255,255,255,0.62), 0 10px 22px rgba(86,71,48,0.22)',
                zIndex: 8,
                touchAction: 'none',
                cursor: joystick.active ? 'grabbing' : 'grab',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background:
                    'radial-gradient(circle at 32% 28%, #80C297 0%, var(--color-point-green) 55%, #285238 100%)',
                  boxShadow: joystick.active
                    ? 'inset 0 3px 6px rgba(0,0,0,0.35), 0 1px 3px rgba(61,107,80,0.20)'
                    : 'inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.20), 0 8px 14px rgba(61,107,80,0.35)',
                  transform: `translate(calc(-50% + ${joystick.x}px), calc(-50% + ${joystick.y}px))`,
                  transition: joystick.active ? 'none' : 'transform 0.16s ease',
                }}
              />
            </div>
          </div>

          {nearbyStone && (
            <button
              type="button"
              onClick={() => openRecordSheet(nearbyStone.record.id)}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 24,
                transform: 'translateX(-50%)',
                zIndex: 12,
                minWidth: 196,
                minHeight: 42,
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(61, 107, 80, 0.18)',
                background: 'rgba(255, 255, 255, 0.92)',
                boxShadow: '0 10px 26px rgba(61, 107, 80, 0.14)',
                color: 'var(--color-text-main)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label={stonePromptLabel(nearbyStone, nearbyEmotion?.nameKo)}
            >
              {stonePromptText(nearbyStone, nearbyEmotion?.nameKo)}
            </button>
          )}

          {lakeStones.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 40,
                fontSize: 11,
                color: 'var(--color-text-sub)',
              }}
            >
              {candidateCount > 0 && <span>확인 필요 {candidateCount}</span>}
              {confirmedCount > 0 && <span>저장 완료 {confirmedCount}</span>}
            </div>
          )}
        </section>

      {!showBook && (
        <section
          aria-label="오늘의 원석함"
          style={{
            position: 'relative',
            zIndex: 10,
            flex: 1,
            minHeight: 0,
            marginTop: 0,
            paddingBottom: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 8,
              flexShrink: 0,
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  color: 'var(--color-text-main)',
                  fontSize: 16,
                  fontWeight: 800,
                }}
              >
                오늘의 원석함
              </h3>
              <p
                style={{
                  margin: '4px 0 0',
                  color: 'var(--color-text-sub)',
                  fontSize: 10,
                  lineHeight: 1.3,
                }}
              >
                기록한 순서대로 오늘의 감정을 담아둬요.
              </p>
            </div>
            <span
              style={{
                flex: '0 0 auto',
                color: 'var(--color-text-sub)',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {todayGemBoxItems.length}개
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GEM_BOX_SLOT_COUNT}, minmax(0, 1fr))`,
              gap: 8,
              flexShrink: 0,
            }}
          >
            {Array.from({ length: GEM_BOX_SLOT_COUNT }).map((_, index) => {
              const item = todayGemBoxItems[index];
              if (!item) {
                return (
                  <div
                    key={`empty-slot-${index}`}
                    aria-label={`비어있는 원석 슬롯 ${index + 1}`}
                    style={{
                      height: 76,
                      borderRadius: 14,
                      border: '1px dashed rgba(126, 104, 66, 0.2)',
                      background: 'rgba(255,255,255,0.38)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(126, 104, 66, 0.38)',
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    빈칸
                  </div>
                );
              }
              const record = item.record;
              return (
                <button
                  key={`gem-box-${record.id}`}
                  type="button"
                  onClick={() => openRecordSheet(record.id)}
                  aria-label={`${formatRecordTime(record.createdAt)} ${item.label} 원석 기록 열기`}
                  style={{
                    height: 76,
                    borderRadius: 14,
                    border: '1px solid rgba(86, 71, 48, 0.1)',
                    background: 'rgba(255,255,255,0.78)',
                    boxShadow: '0 6px 18px rgba(86, 71, 48, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    padding: '6px 4px',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <GemStone
                    gem={{
                      id: `gem-box-${record.id}`,
                      emotionCode: item.emotionCode,
                      tier: 1,
                      createdAt: record.createdAt,
                      consumedAt: null,
                    }}
                    size={30}
                  />
                  <strong
                    style={{
                      maxWidth: '100%',
                      color: 'var(--color-text-main)',
                      fontSize: 10,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.label}
                  </strong>
                  <span style={{ color: 'var(--color-text-sub)', fontSize: 9, fontWeight: 700 }}>
                    {formatRecordTime(record.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>

          {todayGemBoxItems.length === 0 && (
            <p
              style={{
                margin: '7px 0 0',
                color: 'var(--color-text-sub)',
                fontSize: 10,
                lineHeight: 1.35,
              }}
            >
              {candidateCount > 0
                ? '확인 필요한 원석을 확정하면 이곳에 시간순으로 들어와요.'
                : '오늘 확정한 감정 원석이 아직 없어요.'}
            </p>
          )}
        </section>
      )}

      {!showBook && activeRecord && (
        <section
          aria-label={activeStatus === 'candidate' ? '확인 필요한 기록' : '감정 기록'}
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 76,
            zIndex: 30,
            padding: 16,
            borderRadius: 18,
            background: '#FFFFFF',
            border: '1px solid rgba(160, 188, 168, 0.45)',
            boxShadow: '0 12px 30px rgba(61, 107, 80, 0.18)',
            animation: 'sheetUp 0.24s ease-out',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, color: 'var(--color-point-green)', fontSize: 12, fontWeight: 800 }}>
                {activeStatus === 'candidate'
                  ? 'AI가 감정을 읽어봤어요'
                  : activeNeedsWebReview
                    ? '저장된 감정을 살펴봐요'
                    : '오늘의 감정 기록'}
              </p>
              <div
                style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: '#FAF7F0',
                  border: '1px solid rgba(86, 71, 48, 0.08)',
                }}
              >
                <span style={{ display: 'block', color: 'var(--color-text-sub)', fontSize: 10, fontWeight: 800, marginBottom: 4 }}>
                  오늘 남긴 기록
                </span>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--color-text-main)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}
                >
                  {activeRecord.recordText || (activeRecord.hasPhoto ? '사진으로 남긴 일상 기록' : '짧은 일상 기록')}
                </p>
              </div>
              <p
                style={{
                  margin: '8px 0 0',
                  color: 'var(--color-text-sub)',
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {activeStatus === 'candidate'
                  ? suggestedEmotion
                    ? `AI가 이 감정을 ${suggestedEmotion.nameKo} 원석으로 읽었어요. 맞나요?`
                    : '이 기록은 어떤 감정이었나요? 가장 가까운 감정을 골라주세요.'
                  : activeNeedsWebReview
                    ? `챗봇에서 ${activeGemLabel} 원석으로 저장한 감정이에요. 그대로 확정하거나, 잠깐 다시 생각해볼 수 있어요.`
                    : `${activeGemLabel} 원석으로 저장되어 있어요.`}
              </p>
              {activeStatus === 'confirmed' && activeGemBadges.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'rgba(247, 242, 234, 0.82)',
                    border: '1px solid rgba(86, 71, 48, 0.08)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: 10,
                      color: 'var(--color-text-sub)',
                      fontWeight: 800,
                      marginBottom: 8,
                    }}
                  >
                    저장된 원석
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    {activeGemBadges.map((badge) => (
                      <div
                        key={`${activeRecord.id}-${badge.code}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 9px',
                          borderRadius: 999,
                          background: '#FFFFFF',
                          border: '1px solid rgba(86, 71, 48, 0.08)',
                          boxShadow: '0 3px 8px rgba(86,71,48,0.05)',
                        }}
                      >
                        <GemStone
                          gem={{
                            id: `active-${activeRecord.id}-${badge.code}`,
                            emotionCode: badge.code,
                            tier: 1,
                            createdAt: activeRecord.createdAt,
                            consumedAt: null,
                          }}
                          size={24}
                        />
                        <strong style={{ fontSize: 12, color: 'var(--color-text-main)' }}>
                          {badge.label} 원석
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={closeRecordSheet}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '1px solid #EDE2CC',
                background: '#F7F2EA',
                color: 'var(--color-text-sub)',
                cursor: 'pointer',
                flex: '0 0 auto',
              }}
              aria-label="기록 닫기"
            >
              ×
            </button>
          </div>

          {activeStatus === 'candidate' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: suggestedEmotion ? '1fr 1fr' : '1fr',
                gap: 8,
                marginTop: 14,
              }}
            >
              {suggestedEmotion && (
                <button
                  type="button"
                  disabled={savingId === activeRecord.id}
                  onClick={() => void handleConfirmRecord(suggestedEmotion.code)}
                  style={{
                    minHeight: 44,
                    border: 'none',
                    borderRadius: 12,
                    background: 'var(--color-point-green)',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: savingId === activeRecord.id ? 'wait' : 'pointer',
                  }}
                >
                  맞아요
                </button>
              )}
              <button
                type="button"
                disabled={savingId === activeRecord.id}
                onClick={() => setEmotionPickerOpen((open) => !open)}
                style={{
                  minHeight: 44,
                  border: '1px solid rgba(86, 71, 48, 0.16)',
                  borderRadius: 12,
                  background: '#F7F2EA',
                  color: 'var(--color-text-main)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: savingId === activeRecord.id ? 'wait' : 'pointer',
                }}
              >
                다른 감정 선택
              </button>
            </div>
          )}

          {activeCanReclassify && reflectionMode === 'idle' && activeEmotionCode && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginTop: 14,
              }}
            >
              <button
                type="button"
                disabled={savingId === activeRecord.id}
                onClick={() =>
                  void handleConfirmRecord(activeEmotionCode, {
                    interaction: 'confirm',
                    reflectionType: 'none',
                  })
                }
                style={{
                  minHeight: 44,
                  border: 'none',
                  borderRadius: 12,
                  background: 'var(--color-point-green)',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: savingId === activeRecord.id ? 'wait' : 'pointer',
                }}
              >
                수집하기
              </button>
              <button
                type="button"
                disabled={savingId === activeRecord.id}
                onClick={() => {
                  setReflectionMode('choice');
                  setEmotionPickerOpen(false);
                }}
                style={{
                  minHeight: 44,
                  border: '1px solid rgba(86, 71, 48, 0.16)',
                  borderRadius: 12,
                  background: '#F7F2EA',
                  color: 'var(--color-text-main)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: savingId === activeRecord.id ? 'wait' : 'pointer',
                }}
              >
                감정 재분류하기
              </button>
            </div>
          )}

          {activeCanReclassify && reflectionMode === 'choice' && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                background: '#FAF7F0',
                border: '1px solid rgba(86, 71, 48, 0.08)',
              }}
              aria-label="감정 재분류 자기인지 질문"
            >
              <span style={{ display: 'block', marginBottom: 4, color: 'var(--color-point-green)', fontSize: 10, fontWeight: 800 }}>
                자기인지 질문
              </span>
              <p style={{ margin: '0 0 10px', color: 'var(--color-text-main)', fontSize: 12, lineHeight: 1.45, fontWeight: 700 }}>
                Q. {reclassifyFlow.question}
              </p>
              <textarea
                value={reclassifyAnswer}
                onChange={(event) => {
                  setReclassifyAnswer(event.target.value);
                  setReclassifyAnswerSubmitted(false);
                }}
                onKeyDown={handleReclassifyAnswerKeyDown}
                placeholder="짧게 한 문장으로 적어도 괜찮아요."
                style={{
                  width: '100%',
                  minHeight: 68,
                  padding: '9px 10px',
                  borderRadius: 12,
                  border: '1px solid rgba(86, 71, 48, 0.14)',
                  background: '#FFFFFF',
                  color: 'var(--color-text-main)',
                  fontSize: 12,
                  lineHeight: 1.45,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                disabled={!reclassifyFlow.canChooseEmotion}
                onClick={() => {
                  submitReclassifyAnswer();
                }}
                style={{
                  width: '100%',
                  minHeight: 40,
                  marginTop: 10,
                  border: 'none',
                  borderRadius: 12,
                  background: reclassifyFlow.canChooseEmotion ? 'var(--color-point-green)' : '#D9CEB8',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: reclassifyFlow.canChooseEmotion ? 'pointer' : 'wait',
                }}
              >
                {reclassifyFlow.canChooseEmotion ? '감정 다시 선택' : '답변을 적고 Enter를 누르면 감정을 고를 수 있어요'}
              </button>
            </div>
          )}

          {showEmotionGrid && (() => {
            const isReclassify = activeStatus === 'confirmed' && reflectionMode === 'picker';
            return (
              <>
                {isReclassify && (
                  <p style={{ margin: '10px 0 6px', fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-sub)', fontWeight: 700 }}>
                    여러 감정이 함께 떠오르면 모두 골라주세요.
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: isReclassify ? 0 : 10 }}>
                  {EMOTIONS.map((emotion) => {
                    const selected = isReclassify && pickerSelection.includes(emotion.code);
                    return (
                      <button
                        key={emotion.code}
                        type="button"
                        disabled={savingId === activeRecord.id}
                        onClick={() => {
                          if (isReclassify) {
                            setPickerSelection((prev) =>
                              prev.includes(emotion.code)
                                ? prev.filter((c) => c !== emotion.code)
                                : [...prev, emotion.code],
                            );
                          } else {
                            void handleConfirmRecord(emotion.code, {
                              interaction: 'confirm',
                              reflectionType: 'none',
                            });
                          }
                        }}
                        style={{
                          minHeight: 40,
                          border: selected
                            ? `2px solid ${emotion.hexColor}`
                            : `1px solid ${emotion.hexColor}66`,
                          borderRadius: 10,
                          background: selected ? `${emotion.hexColor}55` : `${emotion.hexColor}18`,
                          color: 'var(--color-text-main)',
                          fontSize: 11,
                          fontWeight: selected ? 800 : 700,
                          cursor: savingId === activeRecord.id ? 'wait' : 'pointer',
                          position: 'relative',
                        }}
                      >
                        {emotion.nameKo}
                        {selected && (
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 4,
                              fontSize: 10,
                              fontWeight: 800,
                              color: emotion.hexColor,
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {isReclassify && (
                  <button
                    type="button"
                    disabled={pickerSelection.length === 0 || savingId === activeRecord.id}
                    onClick={() =>
                      void handleConfirmRecord(pickerSelection[0], {
                        interaction: 'reclassify',
                        reflectionType: selectedReflectionType,
                        emotionCodes: pickerSelection,
                        reflectionAnswer: reclassifyAnswer,
                      })
                    }
                    style={{
                      width: '100%',
                      minHeight: 42,
                      marginTop: 10,
                      border: 'none',
                      borderRadius: 12,
                      background:
                        pickerSelection.length === 0 ? '#D9CEB8' : 'var(--color-point-green)',
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor:
                        pickerSelection.length === 0 || savingId === activeRecord.id
                          ? 'wait'
                          : 'pointer',
                    }}
                  >
                    {pickerSelection.length === 0
                      ? '감정을 골라주세요'
                      : `감정 ${pickerSelection.length}개 저장`}
                  </button>
                )}
              </>
            );
          })()}

          <p style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-sub)' }}>
            저장된 감정은 캘린더에서도 같은 상태로 보여요.
          </p>
        </section>
      )}

      {showBook && (
        <>
          <div
            onClick={() => setShowBook(false)}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(20, 14, 8, 0.35)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              zIndex: 40,
              animation: 'backdropFadeIn 0.22s ease-out',
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="감정 도감"
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              top: 64,
              bottom: 90,
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(86, 71, 48, 0.28)',
              zIndex: 50,
              animation: 'overlayCardIn 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            <CollectionBook onClose={() => setShowBook(false)} />
          </div>
        </>
      )}

      {recordToast && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 118,
            transform: 'translateX(-50%)',
            zIndex: 60,
            padding: '9px 14px',
            borderRadius: 999,
            background: 'rgba(61, 107, 80, 0.92)',
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {recordToast}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes overlayCardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes sheetUp {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes candidateGemPulse {
          0%, 100% { transform: scale(1); opacity: 0.78; }
          50%      { transform: scale(1.07); opacity: 1; }
        }
        @keyframes gemFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        @keyframes mascotBreathe {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-3px) scale(1.015); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
