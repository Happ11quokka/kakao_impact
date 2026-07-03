// === 미분류 투명 원석 — 유리 질감, 불안(오팔) 계열과 구분 ===

/** 부드러운 캐보숀(렌즈) 형태 — 일상 기록의 담담함 */
export const UNCLASSIFIED_SHAPE_PATH =
  'M16 58 Q14 34 50 30 Q86 34 88 58 Q86 80 50 84 Q14 82 16 58 Z';

const GLASS_FACETS = [
  'M50 30 L64 42 L50 52 L36 42 Z',
  'M36 42 L50 52 L28 58 Z',
  'M50 52 L64 42 L72 56 Z',
  'M28 58 L50 52 L34 68 Z',
  'M50 52 L72 56 L62 72 Z',
  'M34 68 L50 52 L50 84 Z',
  'M50 52 L62 72 L50 84 Z',
];

interface UnclassifiedGemSvgProps {
  size: number;
  idBase: string;
  tier: number;
}

export default function UnclassifiedGemSvg({ size, idBase, tier }: UnclassifiedGemSvgProps) {
  const bodyId = `glass-body-${idBase}`;
  const rimId = `glass-rim-${idBase}`;
  const clipId = `glass-clip-${idBase}`;
  const shineId = `glass-shine-${idBase}`;
  const causticId = `glass-caustic-${idBase}`;
  const facetBoost = tier >= 3 ? 0.06 : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={bodyId} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.52)" />
          <stop offset="38%" stopColor="rgba(210,228,242,0.22)" />
          <stop offset="72%" stopColor="rgba(150,175,198,0.14)" />
          <stop offset="100%" stopColor="rgba(90,115,140,0.2)" />
        </radialGradient>
        <linearGradient id={rimId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
          <stop offset="45%" stopColor="rgba(170,195,215,0.35)" />
          <stop offset="100%" stopColor="rgba(70,95,120,0.55)" />
        </linearGradient>
        <linearGradient id={causticId} x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="42%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="58%" stopColor="rgba(200,230,255,0.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <radialGradient id={shineId} cx="30%" cy="22%" r="35%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={UNCLASSIFIED_SHAPE_PATH} />
        </clipPath>
      </defs>

      {/* 차가운 유리 후광 — 불안(뿌연 백색)과 달리 청회색 */}
      <ellipse cx="50" cy="54" rx="42" ry="38" fill="rgba(140,175,205,0.1)" />

      <path
        d={UNCLASSIFIED_SHAPE_PATH}
        fill={`url(#${bodyId})`}
        stroke="url(#${rimId})"
        strokeWidth="2"
      />

      <g clipPath={`url(#${clipId})`}>
        {GLASS_FACETS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={
              i % 2 === 0
                ? `rgba(220,238,252,${0.14 + facetBoost})`
                : `rgba(160,188,210,${0.1 + facetBoost})`
            }
          />
        ))}

        {/* 일상 기록 — 담담한 가로 줄(공책 느낌) */}
        <g opacity={0.28}>
          <path
            d="M30 50 H70"
            stroke="rgba(80,105,130,0.55)"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <path
            d="M32 58 H66"
            stroke="rgba(80,105,130,0.4)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path
            d="M34 66 H62"
            stroke="rgba(80,105,130,0.28)"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
        </g>

        {/* 유리 굴절 하이라이트 */}
        <path
          d="M28 36 L58 68"
          stroke={`url(#${causticId})`}
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity={0.85}
        />
        <ellipse cx="36" cy="34" rx="16" ry="10" fill={`url(#${shineId})`} transform="rotate(-14 36 34)" />
        <ellipse cx="30" cy="26" rx="5" ry="3.5" fill="rgba(255,255,255,0.72)" />
      </g>

      {/* 아직 감정이 정해지지 않음 — 점선 원 + 말줄임 */}
      <circle
        cx="50"
        cy="54"
        r="14"
        fill="none"
        stroke="rgba(100,125,150,0.32)"
        strokeWidth="1.2"
        strokeDasharray="3 4"
      />
      <g fill="rgba(90,115,140,0.42)">
        <circle cx="42" cy="54" r="2.2" />
        <circle cx="50" cy="54" r="2.2" />
        <circle cx="58" cy="54" r="2.2" />
      </g>

      {tier >= 4 && (
        <ellipse cx="50" cy="52" rx="46" ry="42" fill="none" stroke="rgba(180,215,240,0.35)" strokeWidth="1.5" />
      )}
    </svg>
  );
}
