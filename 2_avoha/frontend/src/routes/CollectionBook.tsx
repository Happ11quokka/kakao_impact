// === CollectionBook 화면 — Figma 도감 오버레이 ===

const FIGMA_WIDTH = 391;
const FIGMA_HEIGHT = 540;

const FIGMA_EMOTIONS = [
  { label: '우울', x: 24, y: 41 },
  { label: '외로움', x: 118, y: 41 },
  { label: '상실', x: 212, y: 41 },
  { label: '서러움', x: 306, y: 41 },
  { label: '실망', x: 24, y: 144 },
  { label: '걱정', x: 118, y: 144 },
  { label: '긴장', x: 212, y: 144 },
  { label: '위축', x: 306, y: 144 },
  { label: '짜증', x: 24, y: 242 },
  { label: '억울', x: 118, y: 242 },
  { label: '화남', x: 212, y: 242 },
  { label: '적대', x: 306, y: 242 },
  { label: '즐거움', x: 24, y: 335 },
  { label: '감사', x: 118, y: 335 },
  { label: '설렘', x: 212, y: 335 },
  { label: '뿌듯', x: 306, y: 335 },
  { label: '편안', x: 24, y: 431 },
  { label: '무기력', x: 118, y: 431 },
  { label: '공허', x: 212, y: 431 },
  { label: '후회', x: 306, y: 431 },
];

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
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              height: `${(62 / 92) * 100}%`,
              borderRadius: 15,
              background: '#E6E7E2',
            }}
          />
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
