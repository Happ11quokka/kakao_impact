// === CollectionBook 화면 — Figma 도감 오버레이 ===
import GemStone from '../components/pixel/GemStone';
import type { Gem } from '../types/gem';

const FIGMA_WIDTH = 391;
const FIGMA_HEIGHT = 540;

const GRID_X = [24, 118, 212, 306] as const;
const GRID_Y = [41, 144, 242, 335, 431] as const;
const EMOTION_ORDER = [
  // 슬픔 계열
  '우울', '외로움', '상실', '서러움', '실망',
  // 불안 계열
  '걱정', '긴장', '위축',
  // 분노 계열
  '짜증', '억울', '화남', '적대',
  // 기쁨 계열
  '즐거움', '감사', '설렘', '뿌듯', '편안',
  // 복잡/모호 계열
  '무기력', '공허', '후회',
] as const;

const FIGMA_EMOTIONS = EMOTION_ORDER.map((label, idx) => ({
  label,
  x: GRID_X[idx % 4],
  y: GRID_Y[Math.floor(idx / 4)],
}));

const LABEL_TO_EMOTION_CODE: Record<string, string> = {
  // 슬픔 계열
  우울: 'sadness',
  외로움: 'sadness',
  상실: 'sadness',
  서러움: 'sadness',
  실망: 'sadness',
  // 불안 계열
  걱정: 'solace',
  긴장: 'solace',
  위축: 'solace',
  // 분노 계열
  짜증: 'annoyance',
  억울: 'annoyance',
  화남: 'annoyance',
  적대: 'annoyance',
  // 기쁨 계열
  즐거움: 'joy',
  감사: 'satisfaction',
  설렘: 'flutter',
  뿌듯: 'pride',
  편안: 'satisfaction',
  // 복잡/모호 계열
  무기력: 'untroubled',
  공허: 'regret',
  후회: 'regret',
};

function toBookGem(label: string, idx: number): Gem {
  const tier = ((idx % 4) + 1) as 1 | 2 | 3 | 4;
  return {
    id: `book-${idx}-${label}`,
    emotionCode: LABEL_TO_EMOTION_CODE[label] ?? 'untroubled',
    tier,
    createdAt: new Date().toISOString(),
    consumedAt: null,
  };
}

export default function CollectionBook({ onClose }: { onClose?: () => void }) {
  return (
    <section
      aria-label="도감"
      style={{
        width: '100%',
        height: '100%',
        aspectRatio: `${FIGMA_WIDTH} / ${FIGMA_HEIGHT}`,
        position: 'relative',
        background: 'var(--color-point-green-light)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="도감 닫기"
        style={{
          position: 'absolute',
          top: 0,
          right: 2,
          width: 24,
          height: 45,
          border: 0,
          background: 'transparent',
          color: '#000000',
          fontSize: 18,
          fontWeight: 400,
          lineHeight: '45px',
          padding: 0,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        X
      </button>

      {FIGMA_EMOTIONS.map((item) => (
        <div
          key={item.label}
          style={{
            position: 'absolute',
            left: `${(item.x / FIGMA_WIDTH) * 100}%`,
            top: `${(item.y / FIGMA_HEIGHT) * 100}%`,
            width: `${(57 / FIGMA_WIDTH) * 100}%`,
            height: `${(92 / FIGMA_HEIGHT) * 100}%`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ width: '100%', height: `${(62 / 92) * 100}%`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GemStone gem={toBookGem(item.label, item.x + item.y)} size={54} variant={item.label} />
          </div>
          <span
            style={{
              display: 'block',
              width: '100%',
              marginTop: -2,
              color: '#5A4A32',
              fontSize: 'clamp(10px, 3.32vw, 13px)',
              fontWeight: 400,
              lineHeight: '32px',
              textAlign: 'center',
              wordBreak: 'keep-all',
            }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </section>
  );
}
