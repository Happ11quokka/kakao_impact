// === GemStone — 도감 스타일 파셋(다면체) 원석 렌더러 ===
import {
  DEFAULT_VARIANT_BY_EMOTION_CODE,
  variantToFamilyShape,
} from '../../data/emotion-variants';
import { getEmotion } from '../../data/emotions';
import { isUnclassifiedGem, UNCLASSIFIED_VARIANT } from '../../data/unclassified-gem';
import type { Gem } from '../../types/gem';
import UnclassifiedGemSvg from './UnclassifiedGemSvg';

interface GemStoneProps {
  gem: Gem;
  size?: number;
  onClick?: () => void;
  className?: string;
  variant?: string;
}

function parseHexRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return [180, 180, 180];
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return [180, 180, 180];
  return [r, g, b];
}

function clamp(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

function tint(rgb: [number, number, number], amount: number): [number, number, number] {
  const [r, g, b] = rgb;
  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  return [
    clamp(r + (target - r) * ratio),
    clamp(g + (target - g) * ratio),
    clamp(b + (target - b) * ratio),
  ];
}

function rgba(c: [number, number, number], alpha = 1): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

const SHAPE_PATH: Record<string, string> = {
  pebble: 'M14 54 Q20 26 50 24 Q80 26 86 54 Q86 76 50 78 Q14 76 14 54 Z',
  crystal: 'M50 12 L78 24 L88 50 L78 78 L50 90 L22 78 L12 50 L22 24 Z',
  fragment: 'M18 38 L40 14 L70 18 L86 40 L80 72 L52 88 L24 74 L12 50 Z',
  우울: 'M10 58 Q14 30 50 26 Q86 30 90 58 Q88 74 50 78 Q12 74 10 58 Z',
  외로움: 'M18 52 Q18 26 50 24 Q82 26 82 52 Q82 80 50 82 Q18 80 18 52 Z',
  상실: 'M18 48 Q22 20 52 22 Q82 24 86 52 Q84 80 54 82 Q28 80 20 62 L34 56 L30 44 Z',
  서러움: 'M24 30 Q32 18 50 18 Q68 18 76 30 Q82 42 78 58 Q72 78 58 90 Q50 96 42 90 Q28 78 22 58 Q18 42 24 30 Z',
  실망: 'M14 44 L34 18 L66 20 L84 42 L78 70 L52 86 L24 76 L12 56 Z',
  걱정: 'M18 52 Q20 20 50 20 Q80 20 82 52 Q80 82 50 84 Q20 82 18 52 Z',
  긴장: 'M18 56 Q20 26 50 22 Q80 26 82 56 Q80 86 50 90 Q20 86 18 56 Z',
  위축: 'M26 52 Q30 30 50 28 Q70 30 74 52 Q72 72 50 76 Q28 72 26 52 Z',
  짜증: 'M16 46 L30 20 L58 18 L82 34 L80 62 L62 84 L32 82 L14 60 Z',
  억울: 'M20 50 Q22 22 50 20 Q78 22 80 50 Q76 78 50 82 Q24 78 20 50 Z',
  화남: 'M16 62 L28 34 L42 16 L58 24 L72 12 L84 34 L84 64 L68 86 L42 88 L20 78 Z',
  적대: 'M10 50 L30 18 L68 16 L90 50 L70 86 L30 88 Z',
  즐거움: 'M26 82 L20 58 L30 34 L42 18 L58 20 L70 34 L80 56 L74 82 L50 90 Z',
  감사: 'M18 52 Q20 24 50 22 Q80 24 82 52 Q80 80 50 82 Q20 80 18 52 Z',
  설렘: 'M50 12 L68 28 L76 48 L68 74 L50 90 L32 74 L24 48 L32 28 Z',
  뿌듯: 'M18 48 Q18 20 50 18 Q82 20 82 48 Q82 80 50 86 Q18 80 18 48 Z',
  편안: 'M10 58 Q14 32 50 30 Q86 32 90 58 Q88 74 50 78 Q12 74 10 58 Z',
  무기력: 'M12 60 Q16 34 50 32 Q84 34 88 60 Q86 78 50 80 Q14 78 12 60 Z',
  공허: 'M18 52 Q20 22 50 20 Q80 22 82 52 Q80 82 50 84 Q20 82 18 52 Z',
  후회: 'M22 50 Q24 22 54 20 Q78 24 82 50 Q80 76 58 84 Q36 86 24 70 Q18 62 22 50 Z',
  // 분노 — 경멸 (날카로운 냉소 각)
  경멸: 'M54 10 L76 24 L86 50 L68 82 L50 90 L22 76 L14 46 L34 18 Z',
  // 불안 — 초조·공포
  초조: 'M14 52 Q12 30 46 28 Q84 30 88 52 Q86 74 50 78 Q14 76 14 52 Z',
  공포: 'M50 16 L62 30 L76 26 L84 48 L88 58 Q86 80 50 84 Q14 80 12 56 L24 38 L38 24 Z',
  // 복잡 — 부끄러움·혼란스러움
  부끄러움: 'M24 58 Q24 36 50 34 Q76 36 76 58 Q74 76 50 78 Q26 76 24 58 Z',
  혼란스러움: 'M18 50 Q26 16 50 20 Q74 14 84 50 Q80 78 56 88 Q50 92 44 88 Q20 74 18 50 Z',
};

const FACETS: Record<string, string[]> = {
  pebble: [
    'M50 24 L64 38 L50 50 L36 38 Z',
    'M36 38 L50 50 L30 58 Z',
    'M50 50 L64 38 L70 58 Z',
    'M30 58 L50 50 L40 74 Z',
    'M50 50 L70 58 L60 74 Z',
    'M40 74 L50 50 L60 74 Z',
    'M20 52 L36 38 L30 58 Z',
    'M80 52 L64 38 L70 58 Z',
  ],
  crystal: [
    'M50 12 L62 28 L50 40 L38 28 Z',
    'M38 28 L50 40 L28 42 Z',
    'M50 40 L62 28 L72 42 Z',
    'M28 42 L50 40 L24 58 Z',
    'M50 40 L72 42 L76 58 Z',
    'M24 58 L50 40 L32 74 Z',
    'M50 40 L76 58 L68 74 Z',
    'M32 74 L50 40 L50 90 Z',
    'M50 40 L68 74 L50 90 Z',
  ],
  fragment: [
    'M40 14 L56 26 L42 40 L28 32 Z',
    'M56 26 L70 18 L74 36 L58 40 Z',
    'M42 40 L58 40 L52 56 Z',
    'M28 32 L42 40 L30 54 Z',
    'M58 40 L74 36 L76 58 Z',
    'M30 54 L52 56 L34 70 Z',
    'M52 56 L76 58 L62 78 Z',
    'M34 70 L52 56 L52 88 Z',
    'M52 56 L62 78 L52 88 Z',
  ],
};

function facetOpacity(tier: number): number {
  if (tier >= 4) return 0.96;
  if (tier === 3) return 0.88;
  if (tier === 2) return 0.78;
  return 0.62;
}

export default function GemStone({ gem, size = 40, onClick, className = '', variant }: GemStoneProps) {
  const emotion = getEmotion(gem.emotionCode);
  if (!emotion) return null;

  const resolvedVariant = variant ?? DEFAULT_VARIANT_BY_EMOTION_CODE[emotion.code] ?? '뿌듯';
  const unclassified = isUnclassifiedGem(gem.emotionCode, variant);

  if (unclassified) {
    const idBase = `${gem.id}-unclassified-${gem.tier}`.replace(/[^a-zA-Z0-9_-]/g, '');
    return (
      <div
        onClick={onClick}
        className={className}
        style={{
          width: size,
          height: size,
          cursor: onClick ? 'pointer' : 'default',
          display: 'inline-block',
          transition: 'transform var(--duration-fast) var(--easing-out)',
          filter:
            'drop-shadow(0 2px 6px rgba(70,95,120,0.22)) drop-shadow(0 0 12px rgba(160,195,225,0.18))',
        }}
        title={`${emotion.gemName} (${UNCLASSIFIED_VARIANT}) — 감정을 골라 주세요`}
      >
        <UnclassifiedGemSvg size={size} idBase={idBase} tier={gem.tier} />
      </div>
    );
  }

  const base = parseHexRgb(emotion.hexColor);
  const hi = tint(base, 0.48);
  const mid = tint(base, 0.16);
  const low = tint(base, -0.24);
  const dark = tint(base, -0.48);
  const glow = tint(base, 0.32);
  const shape = variantToFamilyShape(resolvedVariant);
  const shapePath = SHAPE_PATH[shape];
  const facets = FACETS[shape];
  const variantPath = SHAPE_PATH[resolvedVariant] ?? shapePath;
  const idBase = `${gem.id}-${emotion.code}-${gem.tier}-${resolvedVariant}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `gem-grad-${idBase}`;
  const glowId = `gem-glow-${idBase}`;
  const clipId = `gem-clip-${idBase}`;

  return (
    <div
      onClick={onClick}
      className={`${gem.tier === 4 ? 'animate-glow' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-block',
        transition: 'transform var(--duration-fast) var(--easing-out)',
        filter:
          gem.tier === 4
            ? `drop-shadow(0 0 8px ${rgba(glow, 0.65)}) drop-shadow(0 0 14px rgba(255,255,255,0.42))`
            : `drop-shadow(0 1px 3px ${rgba(dark, 0.28)})`,
      }}
      title={`${emotion.gemName} (${emotion.nameKo}) Lv.${gem.tier}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden
        style={{
          display: 'block',
          overflow: 'visible',
        }}
      >
        <defs>
          <radialGradient id={gradId} cx="34%" cy="28%" r="72%">
            <stop offset="0%" stopColor={rgba(hi)} />
            <stop offset="44%" stopColor={rgba(mid)} />
            <stop offset="100%" stopColor={rgba(low)} />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={rgba(glow, 0.34)} />
            <stop offset="100%" stopColor={rgba(glow, 0)} />
          </radialGradient>
          <clipPath id={clipId}>
            <path d={variantPath} />
          </clipPath>
        </defs>

        {gem.tier >= 3 && <ellipse cx="50" cy="52" rx="44" ry="40" fill={`url(#${glowId})`} />}

        <path d={variantPath} fill={`url(#${gradId})`} stroke={rgba(dark, 0.7)} strokeWidth="1.8" />

        <g clipPath={`url(#${clipId})`}>
          {facets.map((d, i) => {
            const color = i % 3 === 0 ? hi : i % 3 === 1 ? mid : low;
            const alpha = facetOpacity(gem.tier) - (i % 4) * 0.06;
            return <path key={i} d={d} fill={rgba(color, Math.max(0.36, alpha))} />;
          })}
          <ellipse cx="38" cy="30" rx="14" ry="9" fill="rgba(255,255,255,0.34)" transform="rotate(-18 38 30)" />
          <ellipse cx="33" cy="22" rx="4.5" ry="3" fill="rgba(255,255,255,0.52)" />
        </g>

        {resolvedVariant === '걱정' && (
          <g opacity={0.45}>
            <path d="M36 50 Q50 40 64 50 Q52 60 40 54 Q52 46 60 54" stroke={rgba(hi, 0.65)} strokeWidth="1.6" fill="none" />
          </g>
        )}

        {resolvedVariant === '공허' && (
          <circle cx="50" cy="52" r="11" fill="rgba(25,25,28,0.26)" stroke={rgba(hi, 0.45)} strokeWidth="1.2" />
        )}

        {resolvedVariant === '후회' && (
          <path d="M38 64 Q50 74 66 68" stroke={rgba(hi, 0.5)} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        )}

        {resolvedVariant === '경멸' && (
          <path d="M32 28 L68 72" stroke={rgba(hi, 0.55)} strokeWidth="2" strokeLinecap="round" opacity={0.7} />
        )}

        {resolvedVariant === '초조' && (
          <g opacity={0.5}>
            <path d="M30 46 Q50 38 70 46" stroke={rgba(hi, 0.7)} strokeWidth="1.5" fill="none" />
            <path d="M28 54 Q50 46 72 54" stroke={rgba(hi, 0.55)} strokeWidth="1.3" fill="none" />
          </g>
        )}

        {resolvedVariant === '공포' && (
          <g opacity={0.55}>
            <path d="M50 8 L50 18" stroke={rgba(hi, 0.75)} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M38 14 L44 22" stroke={rgba(hi, 0.6)} strokeWidth="1.3" strokeLinecap="round" />
            <path d="M62 14 L56 22" stroke={rgba(hi, 0.6)} strokeWidth="1.3" strokeLinecap="round" />
          </g>
        )}

        {resolvedVariant === '부끄러움' && (
          <>
            <ellipse cx="38" cy="54" rx="6" ry="3.5" fill={rgba(hi, 0.35)} />
            <ellipse cx="62" cy="54" rx="6" ry="3.5" fill={rgba(hi, 0.35)} />
          </>
        )}

        {resolvedVariant === '혼란스러움' && (
          <g opacity={0.48}>
            <path d="M40 38 Q50 48 60 38 Q50 58 40 48" stroke={rgba(hi, 0.65)} strokeWidth="1.4" fill="none" />
            <path d="M44 62 Q50 52 56 62" stroke={rgba(mid, 0.7)} strokeWidth="1.2" fill="none" />
          </g>
        )}
      </svg>
    </div>
  );
}
