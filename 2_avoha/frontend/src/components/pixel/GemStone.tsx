// === GemStone — CSS로 보석 표현 (에셋 도착 전 플레이스홀더) ===
import { getEmotion } from '../../data/emotions';
import type { Gem, GemTier } from '../../types/gem';

const SHAPES: Record<string, string> = {
  pebble:   '50%',          // 둥근 자갈
  crystal:  '12% 40% 12% 40%', // 각진 크리스탈
  fragment: '30% 70% 50% 20%', // 비대칭 조각
};

const TIER_STYLES: Record<GemTier, React.CSSProperties> = {
  1: { opacity: 0.7, filter: 'none' },
  2: { opacity: 0.85, filter: 'brightness(1.1)' },
  3: { opacity: 1, filter: 'brightness(1.2) saturate(1.2)' },
  4: { opacity: 1, filter: 'brightness(1.3) saturate(1.4) drop-shadow(0 0 8px currentColor)' },
};

interface GemStoneProps {
  gem: Gem;
  size?: number;
  onClick?: () => void;
  className?: string;
}

export default function GemStone({ gem, size = 40, onClick, className = '' }: GemStoneProps) {
  const emotion = getEmotion(gem.emotionCode);
  if (!emotion) return null;

  const shape = SHAPES[emotion.silhouette] || '50%';

  return (
    <div
      onClick={onClick}
      className={`pixel-art ${gem.tier === 4 ? 'animate-glow' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: emotion.hexColor,
        borderRadius: shape,
        color: emotion.hexColor,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        transition: 'transform var(--duration-fast) var(--easing-out)',
        ...TIER_STYLES[gem.tier],
      }}
      title={`${emotion.gemName} (${emotion.nameKo}) Lv.${gem.tier}`}
    >
      {/* 등급에 따른 내부 하이라이트 */}
      {gem.tier >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '25%',
            width: '30%',
            height: '25%',
            background: 'rgba(255,255,255,0.4)',
            borderRadius: '50%',
            filter: 'blur(2px)',
          }}
        />
      )}
      {gem.tier >= 3 && (
        <div
          style={{
            position: 'absolute',
            bottom: '15%',
            right: '20%',
            width: '20%',
            height: '20%',
            background: 'rgba(255,255,255,0.3)',
            borderRadius: '50%',
            filter: 'blur(3px)',
          }}
        />
      )}
    </div>
  );
}
