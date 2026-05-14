// === Home 화면 — 마음 산책길 MVP ===
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, type ChatbotRecordDto } from '../lib/api';
import { useInventoryStore } from '../stores/inventory-store';
import { emotionToCategory, type CategoryCode } from '../lib/emotion-category';
import { getEmotion, EMOTIONS } from '../data/emotions';
import CollectionBook from './CollectionBook';
import ChibiAvatar from '../components/field/ChibiAvatar';
import GemStone from '../components/pixel/GemStone';
import type { Gem } from '../types/gem';

type ReappraiseMode = 'idle' | 'select' | 'reflect' | 'breathe';

type WalkItem = {
  id: string;
  kind: 'emotion' | 'memory';
  gem: Gem | null;
  record: ChatbotRecordDto | null;
  displayEmotionCode: string;
  status: 'suggested' | 'confirmed';
  createdAt: string;
};

const EMOTION_VARIANT: Record<string, string> = {
  untroubled: '편안',
  serenity: '편안',
  pride: '뿌듯',
  joy: '즐거움',
  satisfaction: '감사',
  flutter: '설렘',
  sadness: '우울',
  annoyance: '짜증',
  regret: '후회',
  solace: '걱정',
};

const CATEGORY_LABEL: Record<CategoryCode, string> = {
  sadness: '슬픔',
  anxiety: '불안',
  anger: '분노',
  joy: '기쁨',
  complex: '복잡',
};

const REFLECTION_QUESTIONS = [
  {
    title: '그 순간 몸의 느낌은 어땠나요?',
    options: ['편안했어요', '살짝 긴장됐어요', '무거웠어요', '들떴어요', '텅 빈 느낌이었어요'],
  },
  {
    title: '그 마음은 어디에서 온 것 같나요?',
    options: ['사람', '일/공부', '몸 상태', '혼자 있는 시간', '특별한 이유 없음'],
  },
];

const WALK_STEP_COUNT = 13;

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function todayLabel(): string {
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;
}

function gemWithEmotion(gem: Gem, emotionCode: string): Gem {
  return { ...gem, emotionCode };
}

function itemToGem(item: WalkItem): Gem {
  return item.gem
    ? gemWithEmotion(item.gem, item.displayEmotionCode)
    : {
        id: `memory-gem-${item.id}`,
        emotionCode: item.displayEmotionCode,
        tier: 1,
        createdAt: item.createdAt,
      };
}

export default function Home() {
  const { ticketsRemaining, gems, fetchInventory } = useInventoryStore();
  const [records, setRecords] = useState<ChatbotRecordDto[]>([]);
  const [showBook, setShowBook] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mascotStep, setMascotStep] = useState(0);
  const [mascotWalking, setMascotWalking] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [emotionOverrides, setEmotionOverrides] = useState<Record<string, string>>({});
  const [reappraiseMode, setReappraiseMode] = useState<ReappraiseMode>('idle');
  const [reflectionStep, setReflectionStep] = useState(0);
  const [breathPhase, setBreathPhase] = useState(0);

  useEffect(() => {
    fetchInventory();
    api.chatbotRecords(200).then((res) => setRecords(res.records)).catch(() => {});
  }, [fetchInventory]);

  const todayGems = useMemo(() => {
    return gems
      .filter((gem) => !gem.consumedAt && isToday(gem.createdAt))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [gems]);

  const todayRecords = useMemo(() => {
    return records
      .filter((record) => isToday(record.createdAt))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [records]);

  const walkItems = useMemo<WalkItem[]>(() => {
    const emotionRecords = todayRecords.filter((record) => record.gem !== '일상기록');
    const emotionItems: WalkItem[] = todayGems.map((gem, index) => ({
      id: gem.id,
      kind: 'emotion',
      gem,
      record: emotionRecords[index] ?? null,
      displayEmotionCode: emotionOverrides[gem.id] ?? gem.emotionCode,
      status: confirmedIds.has(gem.id) ? 'confirmed' : 'suggested',
      createdAt: gem.createdAt,
    }));
    const memoryItems: WalkItem[] = todayRecords
      .filter((record) => record.gem === '일상기록')
      .map((record) => ({
        id: `record-${record.id}`,
        kind: 'memory',
        gem: null,
        record,
        displayEmotionCode: emotionOverrides[`record-${record.id}`] ?? 'untroubled',
        status: confirmedIds.has(`record-${record.id}`) ? 'confirmed' : 'suggested',
        createdAt: record.createdAt,
      }));

    return [...emotionItems, ...memoryItems].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [confirmedIds, emotionOverrides, todayGems, todayRecords]);

  useEffect(() => {
    if (walkItems.length > 0 && currentIndex > walkItems.length - 1) {
      setCurrentIndex(walkItems.length - 1);
    }
  }, [currentIndex, walkItems.length]);

  const currentItem = walkItems[currentIndex] ?? null;
  const selectedItem = walkItems.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (reappraiseMode !== 'breathe') return;
    setBreathPhase(0);
    const timers = [
      window.setTimeout(() => setBreathPhase(1), 1500),
      window.setTimeout(() => setBreathPhase(2), 3200),
      window.setTimeout(() => setReappraiseMode('select'), 5100),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reappraiseMode]);

  useEffect(() => {
    if (!mascotWalking) return;
    const timer = window.setTimeout(() => setMascotWalking(false), 220);
    return () => window.clearTimeout(timer);
  }, [mascotStep, mascotWalking]);

  function openItem(item: WalkItem) {
    setSelectedItemId(item.id);
    setReappraiseMode('idle');
    setReflectionStep(0);
  }

  function closePopup() {
    setSelectedItemId(null);
    setReappraiseMode('idle');
    setReflectionStep(0);
  }

  function confirmItem(item: WalkItem) {
    setConfirmedIds((prev) => new Set(prev).add(item.id));
    setReappraiseMode('idle');
  }

  function chooseEmotion(item: WalkItem, emotionCode: string) {
    setEmotionOverrides((prev) => ({ ...prev, [item.id]: emotionCode }));
    setConfirmedIds((prev) => new Set(prev).add(item.id));
    setReappraiseMode('idle');
  }

  function move(delta: number) {
    setMascotStep((step) => {
      const nextStep = Math.min(WALK_STEP_COUNT - 1, Math.max(0, step + delta));
      if (walkItems.length > 0) {
        const nearestItemIndex = Math.round((nextStep / (WALK_STEP_COUNT - 1)) * (walkItems.length - 1));
        setCurrentIndex(nearestItemIndex);
      }
      return nextStep;
    });
    setMascotWalking(true);
    setSelectedItemId(null);
    setReappraiseMode('idle');
  }

  const mascotLeft = 12 + (mascotStep / (WALK_STEP_COUNT - 1)) * 76;
  const currentEmotion = currentItem ? getEmotion(currentItem.displayEmotionCode) : null;

  if (showBook) {
    return (
      <div style={styles.screen}>
        <div style={styles.topBar}>
          <button type="button" onClick={() => setShowBook(false)} style={styles.secondaryButton}>산책길</button>
        </div>
        <div style={styles.bookWrap}>
          <CollectionBook onClose={() => setShowBook(false)} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <div style={styles.topBar}>
        <div style={styles.ticketBadge}>채집권 {ticketsRemaining}/5</div>
        <div style={styles.dateBadge}>{todayLabel()}</div>
        <button type="button" onClick={() => setShowBook(true)} style={styles.bookButton}>도감</button>
      </div>

      <section aria-label="마음 산책길" style={styles.walkScene}>
        <PixelCloud left={30} top={34} scale={0.9} />
        <PixelCloud left={238} top={58} scale={0.72} />
        <PixelCloud left={176} top={22} scale={0.56} />
        <PixelHill left={18} />
        <PixelHill left={222} small />
        <PixelPipe left={44} />
        <PixelBlock left={132} top={74} />
        <PixelBlock left={168} top={74} accent />
        <PixelBlock left={204} top={74} />

        <div style={styles.sceneTitle}>
          <span>마음 산책길</span>
          <small>{walkItems.length > 0 ? `${currentIndex + 1} / ${walkItems.length}` : '0 / 0'}</small>
        </div>

        <div
          style={{
            ...styles.mascotTrack,
            left: `${mascotLeft}%`,
            animation: mascotWalking ? 'walkStep 220ms steps(2, end)' : 'none',
          }}
        >
          <ChibiAvatar size={54} mood="idle" />
        </div>

        {walkItems.length === 0 ? (
          <div style={styles.emptyPath}>
            <strong>아직 오늘 길 위에 원석이 없어요.</strong>
            <span>카카오톡에 가볍게 기록하면 이곳에 원석이 놓여요.</span>
          </div>
        ) : (
          <>
            <div style={styles.gemRail}>
              {walkItems.map((item, index) => {
                const emotion = getEmotion(item.displayEmotionCode);
                const left = walkItems.length <= 1 ? 50 : 14 + (index / (walkItems.length - 1)) * 72;
                const active = index === currentIndex;
                const confirmed = item.status === 'confirmed';
                const showAsGem = item.kind === 'emotion' || confirmed;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(index);
                      setMascotStep(
                        walkItems.length <= 1
                          ? Math.round((WALK_STEP_COUNT - 1) / 2)
                          : Math.round((index / (walkItems.length - 1)) * (WALK_STEP_COUNT - 1)),
                      );
                      setMascotWalking(true);
                      openItem(item);
                    }}
                    aria-label={
                      showAsGem
                        ? `${emotion?.nameKo ?? item.displayEmotionCode} 원석 감정하기`
                        : '일상 기록 확인하기'
                    }
                    style={{
                      ...styles.pathGem,
                      left: `${left}%`,
                      filter: showAsGem && !confirmed ? 'grayscale(0.12) saturate(0.82)' : 'none',
                      opacity: showAsGem ? 0.95 : 1,
                      transform: active ? 'translate(-50%, -50%) scale(1.08)' : 'translate(-50%, -50%)',
                    }}
                  >
                    {showAsGem ? (
                      <GemStone
                        gem={itemToGem(item)}
                        size={active ? 28 : 23}
                        variant={EMOTION_VARIANT[item.displayEmotionCode]}
                      />
                    ) : (
                      <MemoryShard active={active} hasPhoto={Boolean(item.record?.hasPhoto)} />
                    )}
                    {item.record?.hasPhoto && <span style={styles.photoSpark}>사진</span>}
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={() => currentItem && openItem(currentItem)} style={styles.inspectBubble}>
              {currentItem?.kind === 'memory' && currentItem.status !== 'confirmed'
                ? '일상 기록 확인하기'
                : `${currentEmotion?.nameKo ?? '오늘'} 원석 감정하기`}
            </button>
          </>
        )}

        <div style={styles.ground}>
          {Array.from({ length: 16 }, (_, i) => <span key={i} style={styles.brick} />)}
        </div>
      </section>

      <div style={styles.controls}>
        <button type="button" onClick={() => move(-1)} disabled={mascotStep === 0} style={styles.arrowButton}>◀</button>
        <button type="button" onClick={() => currentItem && openItem(currentItem)} disabled={!currentItem} style={styles.primaryButton}>
          감정하기
        </button>
        <button type="button" onClick={() => move(1)} disabled={mascotStep >= WALK_STEP_COUNT - 1} style={styles.arrowButton}>▶</button>
      </div>

      <section style={styles.statusPanel}>
        <h2 style={styles.panelTitle}>오늘 길 위의 원석</h2>
        <div style={styles.summaryRow}>
          {(['joy', 'complex', 'sadness', 'anger', 'anxiety'] as CategoryCode[]).map((category) => {
            const count = walkItems
              .filter((item) => item.kind === 'emotion' || item.status === 'confirmed')
              .filter((item) => emotionToCategory(item.displayEmotionCode) === category).length;
            return (
              <div key={category} style={styles.summaryChip}>
                <span>{CATEGORY_LABEL[category]}</span>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      </section>

      {selectedItem && (
        <AppraisalPopup
          item={selectedItem}
          mode={reappraiseMode}
          reflectionStep={reflectionStep}
          breathPhase={breathPhase}
          onClose={closePopup}
          onConfirm={() => confirmItem(selectedItem)}
          onReappraise={() => setReappraiseMode('select')}
          onReflect={() => {
            setReappraiseMode('reflect');
            setReflectionStep(0);
          }}
          onBreathe={() => setReappraiseMode('breathe')}
          onChooseEmotion={(emotionCode) => chooseEmotion(selectedItem, emotionCode)}
          onNextReflection={() => setReflectionStep((step) => Math.min(step + 1, REFLECTION_QUESTIONS.length - 1))}
        />
      )}

      <style>{`
        @keyframes walkBob {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -4px); }
        }
        @keyframes walkStep {
          0%, 100% { transform: translateX(-50%) scaleX(1) scaleY(1); }
          50% { transform: translateX(-50%) scaleX(0.96) scaleY(1.03) skewX(-2deg); }
        }
        @keyframes gemPulse {
          0%, 100% { box-shadow: 0 0 0 rgba(255,255,255,0); }
          50% { box-shadow: 0 0 20px rgba(255,255,255,0.68); }
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

function AppraisalPopup({
  item,
  mode,
  reflectionStep,
  breathPhase,
  onClose,
  onConfirm,
  onReappraise,
  onReflect,
  onBreathe,
  onChooseEmotion,
  onNextReflection,
}: {
  item: WalkItem;
  mode: ReappraiseMode;
  reflectionStep: number;
  breathPhase: number;
  onClose: () => void;
  onConfirm: () => void;
  onReappraise: () => void;
  onReflect: () => void;
  onBreathe: () => void;
  onChooseEmotion: (emotionCode: string) => void;
  onNextReflection: () => void;
}) {
  const emotion = getEmotion(item.displayEmotionCode);
  const record = item.record;
  const question = REFLECTION_QUESTIONS[reflectionStep];
  const breathText = ['숨을 들이마셔요', '잠깐 머물러요', '천천히 내쉬어요'][breathPhase] ?? '천천히 내쉬어요';
  const isMemoryPending = item.kind === 'memory' && item.status !== 'confirmed';

  return (
    <div style={styles.modalLayer}>
      <section style={styles.popup} aria-label={isMemoryPending ? '일상 기록 확인' : '원석 감정 결과'}>
        <button type="button" onClick={onClose} aria-label="닫기" style={styles.closeButton}>×</button>
        <div style={styles.popupHeader}>
          <span style={styles.popupEyebrow}>{isMemoryPending ? '일상 기록' : '원석 감정 결과'}</span>
          <strong>
            {isMemoryPending
              ? '아직 감정이 정해지지 않은 기록이에요.'
              : `이 기록은 ‘${emotion?.nameKo ?? item.displayEmotionCode} 원석’으로 감정되었어요.`}
          </strong>
        </div>

        {record?.hasPhoto && (
          <div style={styles.photoBox}>
            {record.imageUrl ? <img src={record.imageUrl} alt="" style={styles.photoImage} /> : <span>사진 기록</span>}
          </div>
        )}

        <p style={styles.recordText}>
          {record?.recordText ?? (isMemoryPending ? '카카오톡에서 저장한 일상 기록이에요.' : '채집한 기록과 연결된 원석이에요. 지금 감정을 확인해볼 수 있어요.')}
        </p>

        {mode === 'idle' && (
          <div style={styles.actionStack}>
            {isMemoryPending ? (
              <button type="button" onClick={onReappraise} style={styles.confirmButton}>감정 선택하기</button>
            ) : (
              <button type="button" onClick={onConfirm} style={styles.confirmButton}>{emotion?.nameKo ?? '이 감정'}이 맞아요</button>
            )}
            <button type="button" onClick={isMemoryPending ? onBreathe : onReappraise} style={styles.lightButton}>
              {isMemoryPending ? '5초 숨 고르고 고르기' : '다시 감정하기'}
            </button>
            <button type="button" onClick={onReflect} style={styles.lightButton}>잘 모르겠어요</button>
            <button type="button" onClick={onClose} style={styles.textButton}>나중에 볼게요</button>
          </div>
        )}

        {mode === 'select' && (
          <>
            <p style={styles.helperText}>더 가까운 원석을 바로 골라주세요.</p>
            <div style={styles.emotionGrid}>
              {EMOTIONS.map((candidate) => (
                <button
                  key={candidate.code}
                  type="button"
                  onClick={() => onChooseEmotion(candidate.code)}
                  style={{
                    ...styles.emotionChoice,
                    borderColor: candidate.hexColor,
                  }}
                >
                  <span style={{ ...styles.colorDot, background: candidate.hexColor }} />
                  {candidate.nameKo}
                </button>
              ))}
            </div>
          </>
        )}

        {mode === 'reflect' && (
          <div style={styles.reflectBox}>
            <strong>{question.title}</strong>
            <div style={styles.reflectOptions}>
              {question.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={reflectionStep < REFLECTION_QUESTIONS.length - 1 ? onNextReflection : onReappraise}
                  style={styles.reflectOption}
                >
                  {option}
                </button>
              ))}
            </div>
            <button type="button" onClick={onBreathe} style={styles.textButton}>5초 숨 고르고 고르기</button>
          </div>
        )}

        {mode === 'breathe' && (
          <div style={styles.breathBox}>
            <div style={styles.breathCircle} />
            <strong>{breathText}</strong>
            <span>끝나면 원석을 다시 골라볼게요.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function PixelCloud({ left, top, scale }: { left: number; top: number; scale: number }) {
  return (
    <div style={{ ...styles.cloud, left, top, transform: `scale(${scale})` }}>
      <span style={{ ...styles.cloudBlock, left: 0, top: 10, width: 58, height: 14 }} />
      <span style={{ ...styles.cloudBlock, left: 10, top: 0, width: 24, height: 24 }} />
      <span style={{ ...styles.cloudBlock, left: 30, top: 4, width: 22, height: 20 }} />
    </div>
  );
}

function MemoryShard({ active, hasPhoto }: { active: boolean; hasPhoto: boolean }) {
  return (
    <span
      style={{
        ...styles.memoryShard,
        width: active ? 30 : 26,
        height: active ? 28 : 24,
      }}
      aria-hidden="true"
    >
      <span style={styles.memoryShardGlow} />
      <span
        style={{
          ...styles.memoryShardCore,
          background: hasPhoto ? 'rgba(232, 243, 255, 0.8)' : 'rgba(255, 253, 245, 0.74)',
        }}
      />
    </span>
  );
}

function PixelHill({ left, small = false }: { left: number; small?: boolean }) {
  return (
    <div
      style={{
        ...styles.hill,
        left,
        width: small ? 90 : 128,
        height: small ? 44 : 62,
      }}
    />
  );
}

function PixelPipe({ left }: { left: number }) {
  return (
    <div style={{ ...styles.pipe, left }}>
      <span style={styles.pipeTop} />
      <span style={styles.pipeBody} />
    </div>
  );
}

function PixelBlock({ left, top, accent = false }: { left: number; top: number; accent?: boolean }) {
  return (
    <span
      style={{
        ...styles.floatBlock,
        left,
        top,
        background: accent ? '#F5C24B' : '#C56A2B',
        borderColor: accent ? '#8A4F18' : '#783612',
      }}
    >
      {accent ? '?' : ''}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    flex: 1,
    position: 'relative',
    background: '#6FB6FF',
    display: 'flex',
    flexDirection: 'column',
    padding: '18px 16px 18px',
    paddingTop: 'calc(44px + env(safe-area-inset-top))',
    overflowY: 'auto',
    overflowX: 'hidden',
    color: '#3C2B15',
    fontFamily: 'var(--font-sans)',
  },
  topBar: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    zIndex: 5,
  },
  ticketBadge: {
    justifySelf: 'start',
    background: '#F5C24B',
    border: '2px solid #8A4F18',
    boxShadow: 'inset -2px -2px 0 rgba(117, 62, 18, 0.28)',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 900,
  },
  dateBadge: {
    justifySelf: 'center',
    background: '#FFFFFF',
    border: '2px solid rgba(59, 102, 185, 0.28)',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 800,
    color: '#2459B4',
  },
  bookButton: {
    justifySelf: 'end',
    border: '2px solid #8A4F18',
    borderRadius: 4,
    background: '#ED7D27',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 900,
    padding: '6px 10px',
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '2px solid #8A4F18',
    borderRadius: 4,
    background: '#FFFFFF',
    color: '#3C2B15',
    fontSize: 12,
    fontWeight: 900,
    padding: '7px 10px',
    cursor: 'pointer',
  },
  walkScene: {
    position: 'relative',
    flex: '0 0 clamp(360px, 58vh, 460px)',
    overflow: 'hidden',
    border: '3px solid #2F5FB8',
    borderRadius: 8,
    background: 'linear-gradient(#5EA6FF 0%, #75BDFF 50%, #83D965 51%, #5AA83E 100%)',
    boxShadow: '0 8px 0 rgba(37, 75, 139, 0.28)',
  },
  sceneTitle: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    zIndex: 3,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#FFFFFF',
    textShadow: '1px 2px 0 #2253A0',
    fontWeight: 900,
    fontSize: 16,
  },
  emptyPath: {
    position: 'absolute',
    left: 22,
    right: 22,
    top: '42%',
    transform: 'translateY(-50%)',
    zIndex: 4,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 18,
    borderRadius: 8,
    background: 'rgba(255, 255, 255, 0.86)',
    textAlign: 'center',
    color: '#315C2E',
    fontSize: 13,
    lineHeight: 1.45,
  },
  mascotTrack: {
    position: 'absolute',
    bottom: 58,
    zIndex: 8,
    transform: 'translateX(-50%)',
    transition: 'left 180ms linear',
    filter: 'drop-shadow(0 3px 0 rgba(0,0,0,0.18))',
  },
  gemRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 74,
    height: 44,
    zIndex: 4,
  },
  pathGem: {
    position: 'absolute',
    top: 18,
    border: 0,
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
    transition: 'transform 220ms ease, opacity 180ms ease, filter 180ms ease',
    animation: 'none',
  },
  photoSpark: {
    position: 'absolute',
    top: -13,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: 28,
    padding: '2px 4px',
    borderRadius: 999,
    background: '#FFFFFF',
    border: '1px solid #2459B4',
    color: '#2459B4',
    fontSize: 8,
    fontWeight: 900,
  },
  inspectBubble: {
    position: 'absolute',
    left: '50%',
    bottom: 136,
    zIndex: 6,
    transform: 'translateX(-50%)',
    border: '2px solid #315C2E',
    borderRadius: 999,
    background: '#FFFFFF',
    color: '#315C2E',
    padding: '8px 13px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 4px 0 rgba(49, 92, 46, 0.18)',
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 66,
    display: 'grid',
    gridTemplateColumns: 'repeat(16, 1fr)',
    background: '#B95721',
    borderTop: '4px solid #783612',
    zIndex: 7,
  },
  brick: {
    display: 'block',
    borderRight: '2px solid #783612',
    borderBottom: '2px solid #783612',
    boxShadow: 'inset 0 3px 0 #E59538',
  },
  controls: {
    display: 'grid',
    gridTemplateColumns: '58px 1fr 58px',
    gap: 10,
    marginTop: 10,
  },
  arrowButton: {
    height: 48,
    border: '2px solid #8A4F18',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#3C2B15',
    fontSize: 18,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 4px 0 rgba(86, 51, 18, 0.22)',
  },
  primaryButton: {
    height: 48,
    border: '2px solid #8A4F18',
    borderRadius: 8,
    background: '#F5C24B',
    color: '#3C2B15',
    fontSize: 15,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 4px 0 rgba(86, 51, 18, 0.22)',
  },
  statusPanel: {
    marginTop: 8,
    padding: '10px 10px',
    borderRadius: 8,
    background: '#FFF7D8',
    border: '2px solid rgba(138, 79, 24, 0.28)',
  },
  panelTitle: {
    margin: '0 0 8px',
    fontSize: 13,
    fontWeight: 900,
    color: '#3C2B15',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
  },
  summaryChip: {
    minHeight: 44,
    borderRadius: 6,
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    fontSize: 10,
    fontWeight: 800,
  },
  modalLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'flex-end',
    background: 'rgba(24, 49, 94, 0.42)',
    padding: 14,
  },
  popup: {
    position: 'relative',
    width: '100%',
    maxHeight: '86%',
    overflowY: 'auto',
    borderRadius: 14,
    background: '#FFFDF5',
    border: '3px solid #8A4F18',
    padding: '18px 16px 16px',
    boxShadow: '0 -8px 0 rgba(86, 51, 18, 0.18)',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 30,
    height: 30,
    border: 0,
    background: 'transparent',
    fontSize: 24,
    fontWeight: 900,
    cursor: 'pointer',
    color: '#8A4F18',
  },
  popupHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    paddingRight: 28,
    color: '#3C2B15',
    lineHeight: 1.36,
  },
  popupEyebrow: {
    color: '#2459B4',
    fontSize: 11,
    fontWeight: 900,
  },
  photoBox: {
    marginTop: 14,
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#E8F3FF',
    border: '2px solid #2459B4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#2459B4',
    fontSize: 12,
    fontWeight: 800,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  recordText: {
    margin: '14px 0 0',
    padding: 12,
    borderRadius: 8,
    background: '#F7EDCF',
    color: '#3C2B15',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'keep-all',
  },
  actionStack: {
    display: 'grid',
    gap: 8,
    marginTop: 14,
  },
  confirmButton: {
    height: 44,
    border: '2px solid #315C2E',
    borderRadius: 8,
    background: '#72C85A',
    color: '#173A18',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
  },
  lightButton: {
    height: 42,
    border: '2px solid rgba(138, 79, 24, 0.42)',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#3C2B15',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
  },
  textButton: {
    border: 0,
    background: 'transparent',
    color: '#2459B4',
    fontSize: 12,
    fontWeight: 900,
    padding: 8,
    cursor: 'pointer',
  },
  helperText: {
    margin: '12px 0 10px',
    color: '#6B4B25',
    fontSize: 12,
    fontWeight: 800,
  },
  emotionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    marginTop: 8,
  },
  emotionChoice: {
    minHeight: 42,
    border: '2px solid',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#3C2B15',
    fontSize: 13,
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
  },
  reflectBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    background: '#E9F5E3',
    display: 'grid',
    gap: 10,
  },
  reflectOptions: {
    display: 'grid',
    gap: 7,
  },
  reflectOption: {
    minHeight: 38,
    border: '1px solid #9BCB8B',
    borderRadius: 8,
    background: '#FFFFFF',
    color: '#315C2E',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  breathBox: {
    marginTop: 16,
    minHeight: 170,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    color: '#2459B4',
    textAlign: 'center',
  },
  breathCircle: {
    width: 86,
    height: 86,
    borderRadius: '50%',
    background: 'radial-gradient(circle, #FFFFFF 0%, #BDE2FF 62%, #6FB6FF 100%)',
    animation: 'walkBob 1.8s ease-in-out infinite',
  },
  cloud: {
    position: 'absolute',
    width: 58,
    height: 24,
    zIndex: 1,
    transformOrigin: 'left top',
  },
  cloudBlock: {
    position: 'absolute',
    display: 'block',
    background: '#FFFFFF',
    border: '2px solid #2F5FB8',
    borderRadius: 2,
    boxShadow: 'inset -2px -2px 0 #D9ECFF',
  },
  memoryShard: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    background: 'rgba(255, 255, 255, 0.36)',
    border: '2px dashed rgba(255, 255, 255, 0.72)',
    boxShadow: '0 4px 0 rgba(49, 92, 46, 0.14), inset 0 0 12px rgba(255,255,255,0.44)',
    backdropFilter: 'blur(1.5px)',
  },
  memoryShardGlow: {
    position: 'absolute',
    inset: -5,
    borderRadius: 10,
    background: 'rgba(255, 255, 255, 0.12)',
    filter: 'blur(5px)',
  },
  memoryShardCore: {
    position: 'relative',
    width: '58%',
    height: '48%',
    borderRadius: 4,
    background: 'rgba(255, 253, 245, 0.74)',
    boxShadow: 'inset -2px -2px 0 rgba(47, 95, 184, 0.14)',
  },
  hill: {
    position: 'absolute',
    bottom: 66,
    zIndex: 1,
    borderRadius: '70px 70px 0 0',
    background: '#8FE06B',
    border: '3px solid #4E9C37',
    borderBottom: 0,
    boxShadow: 'inset 10px 0 0 rgba(255,255,255,0.18)',
  },
  pipe: {
    position: 'absolute',
    bottom: 66,
    width: 44,
    height: 52,
    zIndex: 2,
  },
  pipeTop: {
    position: 'absolute',
    left: -5,
    top: 0,
    width: 54,
    height: 18,
    border: '3px solid #236B35',
    background: '#40B95B',
    boxShadow: 'inset 6px 0 0 rgba(255,255,255,0.18), inset -5px 0 0 rgba(0,0,0,0.14)',
  },
  pipeBody: {
    position: 'absolute',
    left: 3,
    top: 15,
    width: 38,
    height: 38,
    border: '3px solid #236B35',
    borderTop: 0,
    background: '#35A84F',
    boxShadow: 'inset 7px 0 0 rgba(255,255,255,0.16), inset -5px 0 0 rgba(0,0,0,0.16)',
  },
  floatBlock: {
    position: 'absolute',
    zIndex: 2,
    width: 28,
    height: 28,
    border: '3px solid',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: '22px',
    fontSize: 16,
    fontWeight: 900,
    textShadow: '1px 1px 0 rgba(0,0,0,0.25)',
    boxShadow: 'inset 3px 3px 0 rgba(255,255,255,0.24), inset -3px -3px 0 rgba(0,0,0,0.16)',
  },
  bookWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: 10,
  },
};
