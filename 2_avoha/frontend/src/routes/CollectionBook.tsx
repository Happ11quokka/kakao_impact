// === CollectionBook 화면 — Figma 도감 오버레이 ===
import GemStone from '../components/pixel/GemStone';
import { ALL_EMOTION_VARIANT_LABELS, VARIANT_TO_EMOTION_CODE } from '../data/emotion-variants';
import type { Gem } from '../types/gem';

const FIGMA_WIDTH = 391;
const FIGMA_HEIGHT = 540;

/** 5열 × 5행 (계열당 5종) */
const GRID_X = [18, 99, 180, 261, 318] as const;
const GRID_Y = [41, 144, 242, 335, 431] as const;

const FIGMA_EMOTIONS = ALL_EMOTION_VARIANT_LABELS.map((label, idx) => ({
  label,
  x: GRID_X[idx % 5],
  y: GRID_Y[Math.floor(idx / 5)],
}));

function toBookGem(label: string, idx: number): Gem {
  const tier = ((idx % 4) + 1) as 1 | 2 | 3 | 4;
  return {
    id: `book-${idx}-${label}`,
    emotionCode: VARIANT_TO_EMOTION_CODE[label as keyof typeof VARIANT_TO_EMOTION_CODE] ?? 'untroubled',
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

      {FIGMA_EMOTIONS.map((item, idx) => (
        <div
          key={item.label}
          style={{
            position: 'absolute',
            left: `${(item.x / FIGMA_WIDTH) * 100}%`,
            top: `${(item.y / FIGMA_HEIGHT) * 100}%`,
            width: `${(52 / FIGMA_WIDTH) * 100}%`,
            height: `${(92 / FIGMA_HEIGHT) * 100}%`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ width: '100%', height: `${(62 / 92) * 100}%`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GemStone gem={toBookGem(item.label, idx)} size={50} variant={item.label} />
          </div>
          <span
            style={{
              display: 'block',
              width: '100%',
              marginTop: -2,
              color: '#5A4A32',
              fontSize: 'clamp(9px, 2.8vw, 12px)',
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
