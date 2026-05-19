// === CollectionBook 화면 — Figma 도감 오버레이 + 미분류 원석 스크롤 영역 ===
import GemStone from '../components/pixel/GemStone';
import { ALL_EMOTION_VARIANT_LABELS, VARIANT_TO_EMOTION_CODE } from '../data/emotion-variants';
import { UNCLASSIFIED_EMOTION_CODE } from '../data/unclassified-gem';
import type { Gem } from '../types/gem';

const FIGMA_WIDTH = 391;
const FIGMA_HEIGHT = 540;

/** 5열 × 5행 (계열당 5종) — 좌우 22px 여백 + 균등 74px column gap */
const GRID_X = [21, 95, 169, 243, 317] as const;
const GRID_Y = [44, 144, 240, 332, 426] as const;

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

function toUnclassifiedGem(): Gem {
  return {
    id: 'book-unclassified',
    emotionCode: UNCLASSIFIED_EMOTION_CODE,
    tier: 1,
    createdAt: new Date().toISOString(),
    consumedAt: null,
  };
}

export default function CollectionBook({ onClose }: { onClose?: () => void }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--color-point-green-light)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <section
        aria-label="도감"
        style={{
          width: '100%',
          aspectRatio: `${FIGMA_WIDTH} / ${FIGMA_HEIGHT}`,
          position: 'relative',
          background: 'var(--color-point-green-light)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="도감 닫기"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            border: '1px solid rgba(86,71,48,0.16)',
            background: 'rgba(255,255,255,0.92)',
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(86,71,48,0.12)',
            padding: 0,
            cursor: 'pointer',
            outline: 'none',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M2 2 L12 12 M12 2 L2 12"
              stroke="#5A4A32"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
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

        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 4,
            transform: 'translateX(-50%)',
            color: 'rgba(86, 71, 48, 0.45)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.04em',
            pointerEvents: 'none',
          }}
        >
          ▾ 아래로 미분류 원석 ▾
        </span>
      </section>

      <section
        aria-label="미분류 원석"
        style={{
          width: '100%',
          padding: '22px 22px 28px',
          background: 'var(--color-point-green-light)',
          borderTop: '1px dashed rgba(86, 71, 48, 0.22)',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <p
            style={{
              margin: 0,
              color: '#5A4A32',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.01em',
            }}
          >
            미분류 원석
          </p>
          <p
            style={{
              margin: '4px 0 0',
              color: 'rgba(86, 71, 48, 0.7)',
              fontSize: 11,
              lineHeight: 1.5,
              wordBreak: 'keep-all',
            }}
          >
            아직 감정이 정해지지 않은 기록의 원석이에요. 캘린더에서 다시 골라 분류할 수 있어요.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GemStone gem={toUnclassifiedGem()} size={52} />
            </div>
            <span
              style={{
                display: 'block',
                marginTop: 2,
                color: '#5A4A32',
                fontSize: 'clamp(9px, 2.6vw, 11px)',
                fontWeight: 500,
                lineHeight: 1.35,
                textAlign: 'center',
                wordBreak: 'keep-all',
              }}
            >
              미분류
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
