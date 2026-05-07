// === ChibiAvatar — 유령 캐릭터 (캐릭터_사진.png 기반) ===

interface ChibiAvatarProps {
  size?: number;
  className?: string;
  mood?: 'idle' | 'eating';
}

export default function ChibiAvatar({ size = 120, className = '', mood = 'idle' }: ChibiAvatarProps) {
  const w = size;
  const h = size * 1.15;
  const isEating = mood === 'eating';

  return (
    <div className={className} style={{ width: w, height: h, position: 'relative' }}>
      <svg
        viewBox="0 0 120 138"
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* 바디 메인 그라디언트 — 중앙 밝고 가장자리 황금빛 */}
          <radialGradient id="bodyGrad" cx="42%" cy="34%" r="62%">
            <stop offset="0%"   stopColor="#FFFDF6" stopOpacity="0.96" />
            <stop offset="36%"  stopColor="#F7EED6" stopOpacity="0.94" />
            <stop offset="70%"  stopColor="#EFD8AE" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#DDB77A" stopOpacity="0.90" />
          </radialGradient>

          {/* 가장자리 림 라이트 — 유령 특유의 밝은 테두리 */}
          <radialGradient id="rimLight" cx="50%" cy="50%" r="50%">
            <stop offset="70%"  stopColor="transparent" />
            <stop offset="100%" stopColor="#FFE8A0" stopOpacity="0.6" />
          </radialGradient>

          {/* 배경 글로우 */}
          <radialGradient id="bgGlow" cx="50%" cy="48%" r="50%">
            <stop offset="0%"   stopColor="#EFDDB0" stopOpacity="0.24" />
            <stop offset="60%"  stopColor="#DEBF81" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFA500" stopOpacity="0" />
          </radialGradient>

          {/* 블러 필터 — 바디 소프트 */}
          <filter id="bodyBlur" x="-8%" y="-8%" width="116%" height="116%">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>

          {/* 글로우 필터 */}
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* 스파클 전용 글로우 (더 선명하게) */}
          <filter id="sparkleGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.1" result="s1" />
            <feMerge>
              <feMergeNode in="s1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── 배경 글로우 ── */}
        <ellipse cx="60" cy="64" rx="52" ry="58" fill="url(#bgGlow)" filter="url(#glow)" />

        {/* ── 유령 바디 ── */}
        {/*
          유령 실루엣:
          - 위: 둥근 머리
          - 아래: 4개 물결 꼬리 (좌우 대칭)
          사진 기준으로 꼬리는 완만한 파도형
        */}
        <path
          d="
            M18,62
            C18,28 38,10 60,10
            C82,10 102,28 102,62
            L102,92
            C102,92 96,104 88,96
            C80,88 76,104 68,100
            C60,96 60,108 60,108
            C60,108 60,96 52,100
            C44,104 40,88 32,96
            C24,104 18,92 18,92
            Z
          "
          fill="url(#bodyGrad)"
          stroke="#BE9662"
          strokeWidth="1.1"
          strokeOpacity="0.42"
        />

        {/* 바디 내부 반투명 하이라이트 — 유령의 광택 */}
        <ellipse
          cx="50"
          cy="36"
          rx="18"
          ry="13"
          fill="white"
          opacity="0.42"
          transform="rotate(-15, 50, 36)"
        />
        <ellipse
          cx="54"
          cy="30"
          rx="9"
          ry="6"
          fill="white"
          opacity="0.60"
          transform="rotate(-10, 54, 30)"
        />

        {/* ── 눈 ── */}
        {isEating ? (
          <>
            <path d="M38,53 Q44,47 50,53" stroke="#3A2008" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M70,53 Q76,47 82,53" stroke="#3A2008" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* 왼쪽 눈 */}
            <ellipse cx="44" cy="52" rx="5.5" ry="6" fill="#3A2008" />
            <ellipse cx="42.5" cy="50" rx="2.2" ry="2" fill="white" opacity="0.85" />
            <ellipse cx="45.5" cy="54" rx="1" ry="1" fill="white" opacity="0.55" />

            {/* 오른쪽 눈 */}
            <ellipse cx="76" cy="52" rx="5.5" ry="6" fill="#3A2008" />
            <ellipse cx="74.5" cy="50" rx="2.2" ry="2" fill="white" opacity="0.85" />
            <ellipse cx="77.5" cy="54" rx="1" ry="1" fill="white" opacity="0.55" />
          </>
        )}

        {/* ── 볼터치 ── */}
        <ellipse cx="36" cy="60" rx={isEating ? 8 : 7} ry={isEating ? 5.4 : 4.5} fill="#D88A7A" opacity={isEating ? 0.28 : 0.2} />
        <ellipse cx="84" cy="60" rx={isEating ? 8 : 7} ry={isEating ? 5.4 : 4.5} fill="#D88A7A" opacity={isEating ? 0.28 : 0.2} />

        {/* ── 미소 ── */}
        {isEating ? (
          <path
            d="M49,65 Q60,79 71,65"
            stroke="#7A4018"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M50,66 Q60,75 70,66"
            stroke="#7A4018"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        )}

        {/* ── 팔 (몸 쪽으로 자연스럽게 모은 포즈) ── */}
        {/* 왼쪽 팔 */}
        <path
          d="M30,78 Q30,92 40,96"
          stroke="#BE9662"
          strokeWidth="5.2"
          strokeOpacity="0.48"
          fill="none"
          strokeLinecap="round"
        />
        {/* 오른쪽 팔 */}
        <path
          d="M90,78 Q90,92 80,96"
          stroke="#BE9662"
          strokeWidth="5.2"
          strokeOpacity="0.48"
          fill="none"
          strokeLinecap="round"
        />

        {/* ── 스파클 ── */}
        {/* 우상단 큰 스파클 */}
        <g filter="url(#sparkleGlow)" opacity="0.86">
          <line x1="98" y1="18" x2="98" y2="28" stroke="#F9E7A8" strokeWidth="1.9" strokeLinecap="round" />
          <line x1="93" y1="23" x2="103" y2="23" stroke="#F9E7A8" strokeWidth="1.9" strokeLinecap="round" />
          <line x1="94" y1="19" x2="102" y2="27" stroke="#F4DA90" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="102" y1="19" x2="94" y2="27" stroke="#F4DA90" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        {/* 좌상단 작은 스파클 */}
        <g filter="url(#sparkleGlow)" opacity="0.7">
          <line x1="18" y1="24" x2="18" y2="31" stroke="#F2D898" strokeWidth="1.55" strokeLinecap="round" />
          <line x1="14.5" y1="27.5" x2="21.5" y2="27.5" stroke="#F2D898" strokeWidth="1.55" strokeLinecap="round" />
          <line x1="15" y1="25" x2="21" y2="30" stroke="#EDCD81" strokeWidth="1" strokeLinecap="round" />
          <line x1="21" y1="25" x2="15" y2="30" stroke="#EDCD81" strokeWidth="1" strokeLinecap="round" />
        </g>
        {/* 우측 중간 작은 스파클 */}
        <g filter="url(#sparkleGlow)" opacity="0.64">
          <line x1="108" y1="55" x2="108" y2="61" stroke="#F2D898" strokeWidth="1.45" strokeLinecap="round" />
          <line x1="105" y1="58" x2="111" y2="58" stroke="#F2D898" strokeWidth="1.45" strokeLinecap="round" />
        </g>
        {/* 도트 스파클 */}
        <circle cx="104" cy="36" r="2.3" fill="#F4DC9A" opacity="0.82" filter="url(#sparkleGlow)" />
        <circle cx="14"  cy="46" r="1.8" fill="#EFD091" opacity="0.72" filter="url(#sparkleGlow)" />
        <circle cx="110" cy="80" r="1.6" fill="#E8C884" opacity="0.66" filter="url(#sparkleGlow)" />
        <circle cx="22"  cy="72" r="1.5" fill="#EBCB8A" opacity="0.6" filter="url(#sparkleGlow)" />
      </svg>
    </div>
  );
}
