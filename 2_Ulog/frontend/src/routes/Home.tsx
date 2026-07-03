// === Home 화면 — 오늘의 감정 호수 ===
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useInventoryStore } from '../stores/inventory-store';
import { useRecordsStore } from '../stores/records-store';
import { EMOTIONS, getEmotion } from '../data/emotions';
import CollectionBook from './CollectionBook';
import ChibiAvatar from '../components/field/ChibiAvatar';
import GemStone from '../components/pixel/GemStone';
import type { RecordDto } from '../lib/api';
import { emotionToCategory, type CategoryCode } from '../lib/emotion-category';
import { buildRecordReclassifyAction } from '../lib/reclassify-flow';
import { buildRecordDetailedEmotionBadges, dedupeLogicalRecords } from '../lib/logical-record';
import { UNCLASSIFIED_EMOTION_CODE } from '../data/unclassified-gem';

const CANDIDATE_SLOTS = [
  { x: 30, y: 48 },
  { x: 70, y: 42 },
  { x: 50, y: 24 },
];

// 오늘 기록 전부를 lake 안에 배치한다. 3개 이하는 손맞춤 슬롯, 그 이상은 호수 중심 둘레에
// 고르게 흩뿌린다(아래쪽 로기 자리 ~40°는 비워 둠). 모두 로기가 닿는 반경 안.
function buildLakeStonePositions(count: number): { x: number; y: number }[] {
  if (count <= CANDIDATE_SLOTS.length) {
    return CANDIDATE_SLOTS.slice(0, count);
  }
  const center = { x: 50, y: 42 };
  const radius = 28;
  const arcDeg = 260; // 하단 ~100°는 로기(마스코트) 자리라 비워 둔다
  const startDeg = -90 - arcDeg / 2;
  return Array.from({ length: count }, (_, i) => {
    const deg = startDeg + (arcDeg / (count - 1)) * i;
    const rad = (deg * Math.PI) / 180;
    return {
      x: center.x + radius * Math.cos(rad),
      y: center.y + radius * 0.7 * Math.sin(rad),
    };
  });
}

const MASCOT_START = { x: 50, y: 66 };
const LAKE_MOVE_RADIUS = 48;
const PROXIMITY_PROMPT_RADIUS = 18;
const JOYSTICK_KNOB_LIMIT = 24;
const JOYSTICK_SPEED = 0.036;
const MASCOT_SIZE = 58;
// ChibiAvatar는 height = size * 1.15 로 세로가 더 길고, SVG overflow:visible + glow,
// breathe(translateY -3px / scale 1.015)까지 더해져 실제 외곽이 더 크다. 가로/세로 반경을
// 따로 두고 여백을 줘서 원 가장자리에서 잘리지 않게 한다.
const MASCOT_HEIGHT_RATIO = 1.15;
const MASCOT_GLOW_MARGIN = 6; // glow/breathe lift 등 외곽 여유(px)
const MASCOT_HALF_W = MASCOT_SIZE / 2 + MASCOT_GLOW_MARGIN;
const MASCOT_HALF_H = (MASCOT_SIZE * MASCOT_HEIGHT_RATIO) / 2 + MASCOT_GLOW_MARGIN;
const LAKE_CIRCLE_SIZE = 304;
const MEDITATION_SECONDS = 5;

const GEM_BOX_CATEGORY_ORDER: CategoryCode[] = ['joy', 'sadness', 'anger', 'anxiety', 'complex'];

const CATEGORY_LABELS: Record<CategoryCode, string> = {
  joy: '기쁨',
  sadness: '슬픔',
  anger: '분노',
  anxiety: '불안',
  complex: '복잡',
};

const REPRESENTATIVE_EMOTION_BY_CATEGORY: Record<CategoryCode, string> = {
  joy: 'joy',
  sadness: 'sadness',
  anger: 'annoyance',
  anxiety: 'solace',
  complex: 'regret',
};

const CATEGORY_ACCENT: Record<CategoryCode, string> = {
  joy: '#D4B84E',
  sadness: '#58728E',
  anger: '#914640',
  anxiety: '#B8C7D8',
  complex: '#3D3A34',
};

export function buildHomeLakeStageStyle(): CSSProperties {
  return {
    position: 'relative',
    width: LAKE_CIRCLE_SIZE,
    height: LAKE_CIRCLE_SIZE,
    overflow: 'visible',
    flexShrink: 0,
  };
}

export function buildHomeLakeCircleStyle(): CSSProperties {
  return {
    position: 'relative',
    width: LAKE_CIRCLE_SIZE,
    height: LAKE_CIRCLE_SIZE,
    borderRadius: '50%',
    background:
      'radial-gradient(circle at 48% 42%, rgba(255,255,255,0.66) 0%, rgba(239,236,218,0.94) 49%, rgba(220,230,215,0.76) 78%, rgba(205,222,211,0.52) 100%)',
    boxShadow:
      'inset 0 0 0 1px rgba(61, 107, 80, 0.06), inset 0 -22px 60px rgba(126, 104, 66, 0.08)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

export function buildHomeJoystickStyle(active = false): CSSProperties {
  return {
    position: 'absolute',
    right: -14,
    bottom: -14,
    width: 60,
    height: 60,
    borderRadius: '50%',
    background:
      'radial-gradient(circle at 50% 28%, #F7EFDA 0%, #DCC9A0 58%, #B89A6A 100%)',
    border: '1px solid rgba(86, 71, 48, 0.22)',
    boxShadow:
      'inset 0 -3px 6px rgba(86,71,48,0.28), inset 0 2px 4px rgba(255,255,255,0.62), 0 10px 22px rgba(86,71,48,0.22)',
    zIndex: 8,
    touchAction: 'none',
    cursor: active ? 'grabbing' : 'grab',
  };
}

type FieldPosition = { x: number; y: number };
type ReflectionType = 'meditation' | 'none';
type ReflectionMode = 'idle' | 'meditation' | 'picker';
type LakeStone = {
  record: RecordDto;
  position: FieldPosition;
  emotionCodes: string[];
  status: 'candidate' | 'confirmed';
};

export function clampMascotPositionToLake(position: FieldPosition): FieldPosition {
  // 아바타가 세로로 더 길어 가로/세로 가용 반경을 따로 계산한다(%, 원은 정사각이라 px↔% 동일).
  const radiusX = LAKE_MOVE_RADIUS - (MASCOT_HALF_W / LAKE_CIRCLE_SIZE) * 100;
  const radiusY = LAKE_MOVE_RADIUS - (MASCOT_HALF_H / LAKE_CIRCLE_SIZE) * 100;
  const dx = position.x - 50;
  const dy = position.y - 50;
  // 타원(가로 radiusX, 세로 radiusY) 안으로 가둔다.
  const norm = Math.hypot(dx / radiusX, dy / radiusY);
  if (norm <= 1) {
    return { x: position.x, y: position.y };
  }
  const scale = 1 / norm;
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

// 사용자가 웹(원판/캘린더)에서 한 번도 확정/재분류하지 않은 기록은 원판에 머문다.
// 챗봇 INSERT 시 classification_status='user_confirmed' 디폴트라도, web_reviewed_at 가
// 비어 있으면 사용자의 명시적 확정이 아직 없는 상태.
export function needsLakeReview(record: RecordDto): boolean {
  if (record.classificationStatus === 'needs_confirmation') return true;
  return !record.webReviewedAt;
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
  const detailedBadges = buildRecordDetailedEmotionBadges(record);
  if (detailedBadges.length > 0) {
    return detailedBadges.map((badge) => ({ code: badge.code, label: badge.label }));
  }
  return confirmedEmotionCodes(record).map((code) => ({
    code,
    label: getEmotion(code)?.nameKo ?? code,
  }));
}

export type CategoryGemSlot = {
  category: CategoryCode;
  label: string;
  representativeEmotionCode: string;
  accentColor: string;
  count: number;
  records: RecordDto[];
};

export function buildTodayCategoryGemSlots(
  records: RecordDto[],
  base = new Date(),
): CategoryGemSlot[] {
  const buckets: Record<CategoryCode, CategoryGemSlot> = GEM_BOX_CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = {
        category,
        label: CATEGORY_LABELS[category],
        representativeEmotionCode: REPRESENTATIVE_EMOTION_BY_CATEGORY[category],
        accentColor: CATEGORY_ACCENT[category],
        count: 0,
        records: [],
      };
      return acc;
    },
    {} as Record<CategoryCode, CategoryGemSlot>,
  );

  const todayConfirmed = records.filter(
    (record) => isSameLocalDate(record.createdAt, base) && !needsLakeReview(record),
  );

  for (const record of todayConfirmed) {
    const detailedBadges = buildRecordDetailedEmotionBadges(record);
    if (detailedBadges.length > 0) {
      for (const badge of detailedBadges) {
        const category = emotionToCategory(badge.code);
        buckets[category].count += 1;
        buckets[category].records.push(record);
      }
      continue;
    }

    const codes = confirmedEmotionCodes(record);
    if (codes.length === 0) continue;
    const seen = new Set<CategoryCode>();
    for (const code of codes) {
      const category = emotionToCategory(code);
      if (seen.has(category)) continue;
      seen.add(category);
      buckets[category].count += 1;
      buckets[category].records.push(record);
    }
  }

  for (const category of GEM_BOX_CATEGORY_ORDER) {
    buckets[category].records.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  return GEM_BOX_CATEGORY_ORDER.map((category) => buckets[category]).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return GEM_BOX_CATEGORY_ORDER.indexOf(a.category) - GEM_BOX_CATEGORY_ORDER.indexOf(b.category);
  });
}

function stonePromptText(stone: LakeStone, emotionName?: string): string {
  // 미분류(흐릿) = 확정 감정 없음. 일상기록이든 AI 추정이든 전부 '감정을 물어보는' 흐름.
  // '감정 원석'이라 부르면 아직 확정 전이라 모순이므로 '감정'만 묻는다.
  if (confirmedEmotionCodes(stone.record).length === 0) {
    return '어떤 감정인지 살펴볼까요?';
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
  if (confirmedEmotionCodes(stone.record).length === 0) {
    return '감정 확인하기';
  }
  if (stone.status === 'candidate') {
    return '감정 원석 열어보기';
  }
  return `${emotionName ?? '감정'} 원석 기록 열어보기`;
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { fetchInventory } = useInventoryStore();
  const { records, fetchRecords, confirmEmotion, savingId } = useRecordsStore();
  const [showBook, setShowBook] = useState(false);
  const [recordToast, setRecordToast] = useState<string | null>(null);
  const [emotionPickerOpen, setEmotionPickerOpen] = useState(false);
  const [reflectionMode, setReflectionMode] = useState<ReflectionMode>('idle');
  const [meditationRemaining, setMeditationRemaining] = useState(MEDITATION_SECONDS);
  const [activeRecordId, setActiveRecordId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryCode | null>(null);
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [categoryPickerRecordId, setCategoryPickerRecordId] = useState<number | null>(null);
  const [categoryPickerSelection, setCategoryPickerSelection] = useState<string[]>([]);
  const [categoryMeditationRemaining, setCategoryMeditationRemaining] = useState(MEDITATION_SECONDS);
  const [categoryReflectionMode, setCategoryReflectionMode] = useState<'idle' | 'meditation' | 'picker'>('idle');
  const [mascotPosition, setMascotPosition] = useState<FieldPosition>(MASCOT_START);
  const [joystick, setJoystick] = useState({ active: false, x: 0, y: 0 });
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchRecords();
  }, [fetchInventory, fetchRecords]);

  // 마이페이지의 "감정 도감" 단축에서 navigate('/', { state: { openBook: true } }) 로 들어오면 바로 도감 오픈.
  useEffect(() => {
    const state = location.state as { openBook?: boolean } | null;
    if (state?.openBook) {
      setShowBook(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

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
    if (reflectionMode !== 'meditation') return undefined;
    if (meditationRemaining <= 0) {
      setReflectionMode('picker');
      setEmotionPickerOpen(true);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setMeditationRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [reflectionMode, meditationRemaining]);

  useEffect(() => {
    if (categoryReflectionMode !== 'meditation') return undefined;
    if (categoryMeditationRemaining <= 0) {
      setCategoryReflectionMode('picker');
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setCategoryMeditationRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [categoryReflectionMode, categoryMeditationRemaining]);

  useEffect(() => {
    if (categoryReflectionMode === 'picker' && categoryPickerRecordId) {
      const target = records.find((r) => r.id === categoryPickerRecordId);
      const existing = target?.confirmedEmotionCodes ?? [];
      setCategoryPickerSelection(existing);
    }
  }, [categoryReflectionMode, categoryPickerRecordId, records]);


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
        clampMascotPositionToLake({
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
    () => dedupeLogicalRecords(records.filter((record) => isSameLocalDate(record.createdAt))),
    [records],
  );

  const lakeStones = useMemo<LakeStone[]>(() => {
    // 후보(확인 필요)뿐 아니라 오늘 채집한(확정) 기록도 같은 자리에 유지한다.
    // 채집하면 바깥 점선만 사라지고 원석은 원 안에 그대로 남는다.
    // 오늘 기록은 개수 제한 없이 전부 lake 안에 배치한다.
    const positions = buildLakeStonePositions(todayRecords.length);

    // 미분류(흐릿) 원석끼리는 팝업/탭이 겹치지 않게 호 전체에 최대한 멀리 분산시키고,
    // 이미 분류된(색상) 원석은 그 사이 빈자리를 채운다. (분류 후엔 간격 신경 안 씀)
    const unclassifiedIdx: number[] = [];
    const classifiedIdx: number[] = [];
    todayRecords.forEach((record, i) => {
      (confirmedEmotionCodes(record).length === 0 ? unclassifiedIdx : classifiedIdx).push(i);
    });

    const N = positions.length;
    const taken = new Array<boolean>(N).fill(false);
    const posForRecord = new Array<{ x: number; y: number }>(N);

    const U = unclassifiedIdx.length;
    unclassifiedIdx.forEach((recIdx, k) => {
      let p = U > 1 ? Math.round((k * (N - 1)) / (U - 1)) : 0;
      while (taken[p]) p = (p + 1) % N; // 반올림 충돌 회피
      taken[p] = true;
      posForRecord[recIdx] = positions[p];
    });
    let cursor = 0;
    classifiedIdx.forEach((recIdx) => {
      while (taken[cursor]) cursor += 1;
      taken[cursor] = true;
      posForRecord[recIdx] = positions[cursor];
    });

    return todayRecords.map<LakeStone>((record, index) => {
      const codes = confirmedEmotionCodes(record);
      // 일상 track: 사용자가 확정한 감정이 없으면(일상기록이든 AI 추정 미확정이든)
      // 색상 원석이 아니라 흐릿한 미분류 원석으로 보여준다. AI 추정값은 팝업에서만 드러난다.
      return {
        record,
        position: posForRecord[index],
        emotionCodes: codes.length > 0 ? codes : [UNCLASSIFIED_EMOTION_CODE],
        status: needsLakeReview(record) ? 'candidate' : 'confirmed',
      };
    });
  }, [todayRecords]);

  const todayCategorySlots = useMemo(
    () => buildTodayCategoryGemSlots(todayRecords),
    [todayRecords],
  );
  const todayConfirmedCount = useMemo(
    () => todayRecords.filter((record) => !needsLakeReview(record)).length,
    [todayRecords],
  );
  const activeCategorySlot = useMemo(
    () => (activeCategory ? todayCategorySlots.find((slot) => slot.category === activeCategory) ?? null : null),
    [activeCategory, todayCategorySlots],
  );

  const activeRecord = activeRecordId
    ? todayRecords.find((record) => record.id === activeRecordId) ?? null
    : null;
  // 확정 감정이 없는 기록(미분류·흐릿한 원석)은 전부 '감정을 물어보는' candidate 로 다룬다.
  const activeStatus =
    activeRecord && confirmedEmotionCodes(activeRecord).length === 0 ? 'candidate' : 'confirmed';
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
  const showEmotionGrid =
    (activeStatus === 'candidate' && (!suggestedEmotion || emotionPickerOpen)) ||
    (activeCanReclassify && reflectionMode === 'picker');

  const candidateCount = lakeStones.filter((stone) => stone.status === 'candidate').length;
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
  const nearbyPromptPosition = nearbyStone
    ? (() => {
        const belowStone = nearbyStone.position.y < 38;
        return {
          x: Math.max(36, Math.min(64, nearbyStone.position.x)),
          y: Math.max(16, Math.min(84, nearbyStone.position.y + (belowStone ? 18 : -18))),
          belowStone,
        };
      })()
    : null;

  const resetReviewControls = () => {
    setEmotionPickerOpen(false);
    setReflectionMode('idle');
    setMeditationRemaining(MEDITATION_SECONDS);
  };

  const resetCategoryReclassify = () => {
    setCategoryPickerRecordId(null);
    setCategoryPickerSelection([]);
    setCategoryReflectionMode('idle');
    setCategoryMeditationRemaining(MEDITATION_SECONDS);
  };

  const openRecordSheet = (recordId: number) => {
    resetReviewControls();
    setRecordToast(null);
    setActiveCategory(null);
    resetCategoryReclassify();
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

  const openCategoryPanel = (category: CategoryCode) => {
    resetReviewControls();
    setActiveRecordId(null);
    resetCategoryReclassify();
    setRecordToast(null);
    setActiveCategory(category);
  };

  const closeCategoryPanel = () => {
    setActiveCategory(null);
    resetCategoryReclassify();
  };

  const handleCategoryReclassifySave = async (record: RecordDto) => {
    if (categoryPickerSelection.length === 0) return;
    const codes = categoryPickerSelection;
    const interaction = buildRecordReclassifyAction(record).interaction;
    const result = await confirmEmotion(record.id, codes, {
      interaction,
      reflectionType: 'meditation',
    });
    if (result.ok) {
      const primary = getEmotion(codes[0]);
      const multiSuffix = codes.length > 1 ? ` 외 ${codes.length - 1}개` : '';
      setRecordToast(`${primary?.nameKo ?? '감정'}${multiSuffix} 원석으로 업데이트했어요`);
      window.setTimeout(() => setRecordToast(null), 2400);
      resetCategoryReclassify();
    } else if (result.error) {
      setRecordToast(result.error);
      window.setTimeout(() => setRecordToast(null), 2400);
    }
  };

  const beginCategoryReclassify = (recordId: number) => {
    setCategoryPickerRecordId(recordId);
    setCategoryPickerSelection([]);
    setCategoryMeditationRemaining(MEDITATION_SECONDS);
    setCategoryReflectionMode('meditation');
  };

  const handleConfirmRecord = async (
    emotionCode: string,
    opts: {
      interaction?: 'confirm' | 'reclassify';
      reflectionType?: ReflectionType;
      emotionCodes?: string[];
    } = {},
  ) => {
    if (!activeRecord) return;
    const wasCandidate = activeRecord.classificationStatus === 'needs_confirmation';
    const interaction = opts.interaction ?? (wasCandidate ? 'confirm' : 'reclassify');
    const codes = opts.emotionCodes && opts.emotionCodes.length > 0 ? opts.emotionCodes : [emotionCode];
    const result = await confirmEmotion(activeRecord.id, codes, {
      interaction,
      reflectionType: opts.reflectionType ?? 'none',
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

  const lakeHelper =
    lakeStones.length > 0
      ? '로기를 움직여 오늘의 감정을 찾아보세요.'
      : '카카오톡 챗봇에서 오늘 마음을 남기면 로기 옆에 원석이 생겨요.';

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
        padding: '12px 20px 8px',
        paddingTop: 'calc(24px + var(--phone-content-top-inset, env(safe-area-inset-top, 0px)))',
        paddingBottom: 8,
        overflowY: 'hidden',
        overflowX: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 132px minmax(0, 1fr)',
          alignItems: 'center',
          gap: 0,
          minHeight: 38,
          marginBottom: 'var(--home-header-gap, 22px)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            minHeight: 34,
            padding: 0,
            gridColumn: 1,
            justifySelf: 'center',
            maxWidth: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translate(-8px, var(--home-top-control-y, 0px))',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--color-text-sub)', flexShrink: 0, display: 'block' }}
              aria-hidden
            >
              <path d="M9 10h.01M15 10h.01M5 21V8a7 7 0 0 1 14 0v13l-3-2-2 2-2-2-2 2-2-2z" />
            </svg>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--color-text-sub)',
                lineHeight: 1,
                letterSpacing: 0.2,
              }}
            >
              U-log
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowBook(true)}
          style={{
            background:
              'radial-gradient(circle at 50% 28%, #EFE3C9 0%, #DCC9A0 100%)',
            borderRadius: 15,
            minHeight: 34,
            minWidth: 60,
            padding: '0 14px',
            fontSize: 12.5,
            lineHeight: 1,
            fontWeight: 800,
            color: 'var(--color-text-sub)',
            border: 'none',
            cursor: 'pointer',
            gridColumn: 3,
            justifySelf: 'end',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translateY(var(--home-top-control-y, 0px))',
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
          height: 'auto',
          flex: '0 1 auto',
          marginBottom: 6,
        }}
      >
          <div style={{ textAlign: 'center', marginBottom: 7 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-main)' }}>
              오늘의 마음
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, lineHeight: 1.35, color: 'var(--color-text-sub)' }}>
              {lakeHelper}
            </p>
          </div>

          <div style={buildHomeLakeStageStyle()}>
            <div
              style={buildHomeLakeCircleStyle()}
            >
            {lakeStones.map((stone) => {
              const primaryCode = stone.emotionCodes[0];
              const emotion = getEmotion(primaryCode);
              const isCandidate = stone.status === 'candidate';
              // 채집(확정) 후에는 색상 감정 원석만 은은한 잔광을 남긴다.
              const isEmotionConfirmed =
                !isCandidate &&
                stone.emotionCodes[0] !== UNCLASSIFIED_EMOTION_CODE;
              const primaryHex = emotion?.hexColor ?? '#9AA89A';
              const stoneSize = isCandidate ? 54 : 58;
              const gemSize = isCandidate ? 34 : 38;
              const visibleCodes = stone.emotionCodes.slice(0, 5);
              const gemLayout = buildHomeStoneGemLayout(visibleCodes, gemSize);
              const extraCount = stone.emotionCodes.length - visibleCodes.length;
              // 채집 전(후보)만 바깥 점선 링을 둔다. 채집하면 링은 사라지고 원석만 남는다.
              const border = isCandidate ? '1px dashed rgba(61, 96, 80, 0.38)' : 'none';
              const background = isCandidate ? 'rgba(255, 255, 255, 0.22)' : 'transparent';
              const boxShadow = isCandidate
                ? '0 10px 24px rgba(61, 96, 80, 0.08)'
                : isEmotionConfirmed
                  ? `0 0 18px 4px ${primaryHex}44, 0 6px 14px rgba(86,71,48,0.08)`
                  : '0 4px 10px rgba(86,71,48,0.06)';
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

            {/* 바깥: 위치/중앙정렬 전담 (transform은 여기서만 — 애니메이션과 분리) */}
            <div
              style={{
                position: 'absolute',
                left: `${mascotPosition.x}%`,
                top: `${mascotPosition.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 5,
                transition: joystick.active ? 'none' : 'left 0.18s ease, top 0.18s ease',
              }}
            >
              {/* 안쪽: breathe 애니메이션 전담 (transform이 바깥 중앙정렬을 덮어쓰지 않게 분리) */}
              <div style={{ animation: 'mascotBreathe 3.6s ease-in-out infinite' }}>
                <div style={{ filter: 'saturate(0.9) contrast(0.96)' }}>
                  <ChibiAvatar size={MASCOT_SIZE} mood="idle" />
                </div>
              </div>
            </div>
            </div>

	            <div
	              role="slider"
	              aria-label="로기 이동 조이스틱"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.hypot(joystick.x, joystick.y))}
              onPointerDown={handleJoystickPointerDown}
              onPointerMove={(event) => {
                if (joystick.active) updateJoystick(event);
              }}
              onPointerUp={stopJoystick}
              onPointerCancel={stopJoystick}
              style={buildHomeJoystickStyle(joystick.active)}
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

	            {nearbyStone && nearbyPromptPosition && (
	              <button
	                type="button"
	                onClick={() => openRecordSheet(nearbyStone.record.id)}
	                style={{
	                  position: 'absolute',
	                  left: `${nearbyPromptPosition.x}%`,
	                  top: `${nearbyPromptPosition.y}%`,
	                  transform: 'translate(-50%, -50%)',
	                  zIndex: 12,
	                  minWidth: 154,
	                  maxWidth: 178,
	                  minHeight: 34,
	                  padding: '7px 12px',
	                  borderRadius: 999,
	                  border: '1px solid rgba(61, 107, 80, 0.18)',
	                  background: 'rgba(255, 255, 255, 0.94)',
	                  boxShadow: '0 8px 22px rgba(61, 107, 80, 0.15)',
	                  color: 'var(--color-text-main)',
	                  fontSize: 11.5,
	                  fontWeight: 800,
	                  lineHeight: 1.2,
	                  cursor: 'pointer',
	                  whiteSpace: 'nowrap',
	                  WebkitTapHighlightColor: 'transparent',
	                }}
	                aria-label={stonePromptLabel(nearbyStone, nearbyEmotion?.nameKo)}
	              >
	                <span
	                  aria-hidden="true"
	                  style={{
	                    position: 'absolute',
	                    left: '50%',
	                    top: nearbyPromptPosition.belowStone ? -4 : undefined,
	                    bottom: nearbyPromptPosition.belowStone ? undefined : -4,
	                    width: 8,
	                    height: 8,
	                    background: 'rgba(255, 255, 255, 0.94)',
	                    borderLeft: '1px solid rgba(61, 107, 80, 0.14)',
	                    borderTop: '1px solid rgba(61, 107, 80, 0.14)',
	                    transform: 'translateX(-50%) rotate(45deg)',
	                  }}
	                />
	                {stonePromptText(nearbyStone, nearbyEmotion?.nameKo)}
	              </button>
	            )}
	          </div>

	          {lakeStones.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 10,
                fontSize: 11,
                color: 'var(--color-text-sub)',
              }}
            >
              {candidateCount > 0 && <span>확인 필요 {candidateCount}</span>}
              {todayConfirmedCount > 0 && <span>저장 완료 {todayConfirmedCount}</span>}
            </div>
          )}
        </section>

      {!showBook && (
        <section
          aria-label="오늘의 원석함"
          style={{
            position: 'relative',
            zIndex: 10,
            flex: '1 1 150px',
            minHeight: 150,
            marginTop: 0,
            paddingBottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            overflow: 'hidden',
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
                오늘의 감정 분포를 한눈에 살펴봐요.
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
              {todayConfirmedCount}개
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GEM_BOX_CATEGORY_ORDER.length}, minmax(0, 1fr))`,
              gap: 8,
              flexShrink: 0,
            }}
          >
            {todayCategorySlots.map((slot) => {
              const empty = slot.count === 0;
              const isActive = activeCategory === slot.category;
              return (
                <button
                  key={`category-slot-${slot.category}`}
                  type="button"
                  disabled={empty}
                  onClick={() => (empty ? undefined : openCategoryPanel(slot.category))}
                  aria-label={
                    empty
                      ? `${slot.label} 원석 없음`
                      : `${slot.label} 원석 ${slot.count}개 기록 열기`
                  }
                  style={{
                    height: 84,
                    borderRadius: 14,
                    border: empty
                      ? '1px dashed rgba(126, 104, 66, 0.2)'
                      : isActive
                        ? `1.5px solid ${slot.accentColor}`
                        : '1px solid rgba(86, 71, 48, 0.1)',
                    background: empty
                      ? 'rgba(255,255,255,0.38)'
                      : isActive
                        ? `${slot.accentColor}1A`
                        : 'rgba(255,255,255,0.82)',
                    boxShadow: empty ? 'none' : '0 6px 18px rgba(86, 71, 48, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    padding: '6px 4px',
                    cursor: empty ? 'default' : 'pointer',
                    opacity: empty ? 0.45 : 1,
                    transition: 'background 0.18s ease, border-color 0.18s ease',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <GemStone
                    gem={{
                      id: `category-slot-${slot.category}`,
                      emotionCode: slot.representativeEmotionCode,
                      tier: 1,
                      createdAt: new Date().toISOString(),
                      consumedAt: null,
                    }}
                    size={32}
                  />
                  <strong
                    style={{
                      color: 'var(--color-text-main)',
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  >
                    {slot.label}
                  </strong>
                  <span
                    style={{
                      color: empty ? 'rgba(126,104,66,0.55)' : slot.accentColor,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.02em',
                    }}
                  >
                    ×{slot.count}
                  </span>
                </button>
              );
            })}
          </div>

          {todayConfirmedCount === 0 && (
            <p
              style={{
                margin: '6px 0 0',
                color: 'var(--color-text-sub)',
                fontSize: 9,
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {candidateCount > 0
                ? '확인 필요한 원석을 확정하면 카테고리별로 묶여서 보여드릴게요.'
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
                  ? suggestedEmotion
                    ? 'AI가 감정을 읽어봤어요'
                    : '오늘의 감정을 골라봐요'
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

          {/* 추정 감정이 있을 때만 맞아요/다른 감정 선택. 추정이 없으면 아래 감정 그리드가 바로 뜬다. */}
          {activeStatus === 'candidate' && suggestedEmotion && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
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
                  setEmotionPickerOpen(false);
                  setMeditationRemaining(MEDITATION_SECONDS);
                  setReflectionMode('meditation');
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

          {activeCanReclassify && reflectionMode === 'meditation' && (
            <div
              style={{
                marginTop: 14,
                padding: '18px 14px',
                borderRadius: 14,
                background: 'linear-gradient(180deg, rgba(160, 188, 168, 0.18), rgba(247, 242, 234, 0.6))',
                border: '1px solid rgba(86, 71, 48, 0.08)',
                textAlign: 'center',
              }}
              aria-label="5초 감상"
            >
              <span style={{ display: 'block', marginBottom: 6, color: 'var(--color-point-green)', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>
                🌿 5초 감상
              </span>
              <p style={{ margin: '0 0 10px', color: 'var(--color-text-main)', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>
                잠깐 호흡을 가다듬고, 다시 감정을 골라볼게요.
              </p>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: 4,
                  color: 'var(--color-text-main)',
                  fontSize: 32,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                }}
                aria-live="polite"
              >
                {meditationRemaining}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)' }}>초</span>
              </div>
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
                        reflectionType: 'meditation',
                        emotionCodes: pickerSelection,
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

      {!showBook && activeCategorySlot && (
        <section
          aria-label={`${activeCategorySlot.label} 카테고리 기록`}
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 76,
            zIndex: 30,
            padding: 16,
            borderRadius: 18,
            background: '#FFFFFF',
            border: `1px solid ${activeCategorySlot.accentColor}55`,
            boxShadow: '0 12px 30px rgba(61, 107, 80, 0.18)',
            animation: 'sheetUp 0.24s ease-out',
            maxHeight: 'calc(100% - 200px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GemStone
                gem={{
                  id: `panel-${activeCategorySlot.category}`,
                  emotionCode: activeCategorySlot.representativeEmotionCode,
                  tier: 1,
                  createdAt: new Date().toISOString(),
                  consumedAt: null,
                }}
                size={28}
              />
              <div>
                <p style={{ margin: 0, color: 'var(--color-text-main)', fontSize: 14, fontWeight: 800 }}>
                  {activeCategorySlot.label}
                </p>
                <p style={{ margin: '2px 0 0', color: activeCategorySlot.accentColor, fontSize: 11, fontWeight: 800 }}>
                  ×{activeCategorySlot.count}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeCategoryPanel}
              aria-label="카테고리 닫기"
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
            >
              ×
            </button>
          </header>

          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2 }}>
            {activeCategorySlot.records.map((record) => {
              const isOpen = categoryPickerRecordId === record.id;
              const recordBadges = buildActiveRecordGemBadges(record);
              const action = buildRecordReclassifyAction(record);
              const saving = savingId === record.id;
              const time = new Date(record.createdAt).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <article
                  key={`category-card-${record.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ paddingTop: 10, color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 700 }}>
                    {time}
                  </span>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: '#FAF7F0',
                      border: '1px solid rgba(86, 71, 48, 0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
                        {recordBadges.length > 0 ? (
                          recordBadges.map((badge) => (
                            <span
                              key={`${record.id}-${badge.code}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 8px',
                                borderRadius: 999,
                                background: '#FFFFFF',
                                border: '1px solid rgba(86, 71, 48, 0.08)',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--color-text-main)',
                              }}
                            >
                              <GemStone
                                gem={{
                                  id: `cat-${record.id}-${badge.code}`,
                                  emotionCode: badge.code,
                                  tier: 1,
                                  createdAt: record.createdAt,
                                  consumedAt: null,
                                }}
                                size={18}
                              />
                              {badge.label}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>미분류 원석</span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (isOpen) {
                            resetCategoryReclassify();
                          } else {
                            beginCategoryReclassify(record.id);
                          }
                        }}
                        aria-expanded={isOpen}
                        aria-label={action.ariaLabel}
                        style={{
                          flex: '0 0 auto',
                          padding: '5px 10px',
                          borderRadius: 999,
                          border: '1px solid rgba(86, 71, 48, 0.16)',
                          background: isOpen ? activeCategorySlot.accentColor : '#F7F2EA',
                          color: isOpen ? '#FFFFFF' : 'var(--color-text-main)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: saving ? 'wait' : 'pointer',
                        }}
                      >
                        {action.label}
                      </button>
                    </div>

                    {record.recordText && (
                      <p
                        style={{
                          margin: '8px 0 0',
                          color: 'var(--color-text-main)',
                          fontSize: 12,
                          lineHeight: 1.5,
                          wordBreak: 'break-word',
                        }}
                      >
                        {record.recordText}
                      </p>
                    )}

                    {isOpen && (
                      <div style={{ marginTop: 10 }}>
                        {categoryReflectionMode === 'meditation' && (
                          <div
                            style={{
                              padding: '14px 12px',
                              borderRadius: 12,
                              background: 'linear-gradient(180deg, rgba(160, 188, 168, 0.18), rgba(247, 242, 234, 0.6))',
                              border: '1px solid rgba(86, 71, 48, 0.08)',
                              textAlign: 'center',
                            }}
                            aria-label="5초 감상"
                          >
                            <span style={{ display: 'block', marginBottom: 4, color: 'var(--color-point-green)', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>
                              🌿 5초 감상
                            </span>
                            <p style={{ margin: '0 0 8px', color: 'var(--color-text-main)', fontSize: 11, lineHeight: 1.45, fontWeight: 600 }}>
                              잠깐 호흡을 가다듬고, 다시 감정을 골라볼게요.
                            </p>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'baseline',
                                gap: 4,
                                color: 'var(--color-text-main)',
                                fontSize: 26,
                                fontWeight: 800,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                              aria-live="polite"
                            >
                              {categoryMeditationRemaining}
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-sub)' }}>초</span>
                            </div>
                          </div>
                        )}

                        {categoryReflectionMode === 'picker' && (
                          <>
                            <p style={{ margin: '0 0 6px', fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-sub)', fontWeight: 700 }}>
                              여러 감정이 함께 떠오르면 모두 골라주세요.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                              {EMOTIONS.map((emotion) => {
                                const selected = categoryPickerSelection.includes(emotion.code);
                                return (
                                  <button
                                    key={`cat-pick-${emotion.code}`}
                                    type="button"
                                    disabled={saving}
                                    onClick={() => {
                                      setCategoryPickerSelection((prev) =>
                                        prev.includes(emotion.code)
                                          ? prev.filter((c) => c !== emotion.code)
                                          : [...prev, emotion.code],
                                      );
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
                                      cursor: saving ? 'wait' : 'pointer',
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
                            <button
                              type="button"
                              disabled={categoryPickerSelection.length === 0 || saving}
                              onClick={() => void handleCategoryReclassifySave(record)}
                              style={{
                                width: '100%',
                                minHeight: 40,
                                marginTop: 10,
                                border: 'none',
                                borderRadius: 12,
                                background:
                                  categoryPickerSelection.length === 0
                                    ? '#D9CEB8'
                                    : 'var(--color-point-green)',
                                color: '#FFFFFF',
                                fontSize: 12,
                                fontWeight: 800,
                                cursor:
                                  categoryPickerSelection.length === 0 || saving
                                    ? 'wait'
                                    : 'pointer',
                              }}
                            >
                              {categoryPickerSelection.length === 0
                                ? '감정을 골라주세요'
                                : `감정 ${categoryPickerSelection.length}개 저장`}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
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
