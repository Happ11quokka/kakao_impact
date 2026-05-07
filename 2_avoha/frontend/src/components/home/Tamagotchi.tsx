// === Tamagotchi — 썸원 스타일 다마고치 캐릭터 ===
// stage prop으로 에셋 교체 가능 (현재 'baby'만 구현)
import type { PetStage } from '../../stores/pet-store';

interface TamagotchiProps {
  stage: PetStage;
  size?: number;
  isEating?: boolean;
}

/** 성장 단계별 컴포넌트 매핑 — 에셋 추가 시 여기만 확장 */
const STAGE_RENDERER: Record<PetStage, React.FC<{ size: number; isEating: boolean }>> = {
  egg: BabyCreature,   // 아직 미구현, fallback
  baby: BabyCreature,
  child: BabyCreature, // 아직 미구현, fallback
  adult: BabyCreature, // 아직 미구현, fallback
};

export default function Tamagotchi({ stage, size = 120, isEating = false }: TamagotchiProps) {
  const Renderer = STAGE_RENDERER[stage] ?? BabyCreature;
  return (
    <div
      style={{
        animation: isEating ? 'tamaEat 0.4s ease 2' : 'tamaBreathe 3s ease-in-out infinite',
      }}
    >
      <Renderer size={size} isEating={isEating} />
    </div>
  );
}

/** 베이비 크리처 — 썸원 반려몽 스타일의 둥근 캐릭터 SVG */
function BabyCreature({ size, isEating }: { size: number; isEating: boolean }) {
  const mouthD = isEating
    ? 'M52 78 Q56 84 60 78 Q64 84 68 78' // 크게 벌린 입
    : 'M53 76 Q56 80 60 76 Q64 80 67 76'; // 기본 미소

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: 'block' }}>
      {/* 그림자 */}
      <ellipse cx="60" cy="112" rx="32" ry="6" fill="rgba(0,0,0,0.1)" />

      {/* 몸통 */}
      <ellipse cx="60" cy="68" rx="42" ry="38" fill="#FFE8D0" />
      <ellipse cx="60" cy="72" rx="38" ry="32" fill="#FFF0DC" />

      {/* 귀 */}
      <ellipse cx="30" cy="38" rx="14" ry="12" fill="#FFE0C0" />
      <ellipse cx="90" cy="38" rx="14" ry="12" fill="#FFE0C0" />
      <ellipse cx="30" cy="39" rx="8" ry="7" fill="#FFCBA4" />
      <ellipse cx="90" cy="39" rx="8" ry="7" fill="#FFCBA4" />

      {/* 눈 */}
      <ellipse cx="45" cy="63" rx="5.5" ry="6.5" fill="#3A2520" />
      <ellipse cx="75" cy="63" rx="5.5" ry="6.5" fill="#3A2520" />
      {/* 눈 하이라이트 */}
      <circle cx="47" cy="60" r="2.5" fill="white" />
      <circle cx="77" cy="60" r="2.5" fill="white" />
      <circle cx="44" cy="64" r="1" fill="white" opacity="0.6" />
      <circle cx="74" cy="64" r="1" fill="white" opacity="0.6" />

      {/* 볼 터치 */}
      <ellipse cx="35" cy="73" rx="7" ry="4.5" fill="#FFB5C2" opacity="0.45" />
      <ellipse cx="85" cy="73" rx="7" ry="4.5" fill="#FFB5C2" opacity="0.45" />

      {/* 입 */}
      <path d={mouthD} stroke="#5A3E28" strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {/* 먹는 중 이펙트 — 반짝이 */}
      {isEating && (
        <>
          <circle cx="28" cy="50" r="2" fill="#FFD700" opacity="0.8">
            <animate attributeName="opacity" values="0.8;0;0.8" dur="0.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="92" cy="48" r="1.5" fill="#FFD700" opacity="0.6">
            <animate attributeName="opacity" values="0.6;0;0.6" dur="0.3s" repeatCount="indefinite" />
          </circle>
          <circle cx="60" cy="32" r="2" fill="#FFD700" opacity="0.7">
            <animate attributeName="opacity" values="0.7;0;0.7" dur="0.35s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  );
}
