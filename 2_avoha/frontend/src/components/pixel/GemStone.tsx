// === GemStone — gem_generator_v2 스타일 4단계 맵 + design/README Hex 기반 팔레트 ===
// 감정 코드·보석명·Hex 단일 소스: src/data/emotions.ts (README v1.1과 동기화)
import { getEmotion } from '../../data/emotions';
import type { Gem } from '../../types/gem';

type GemPalette = {
  o: [number, number, number];
  k: [number, number, number];
  b: [number, number, number];
  h1: [number, number, number];
  h2: [number, number, number];
  glow: [number, number, number];
};

const MAP_STONE = [
  '........................',
  '........................',
  '........................',
  '......OOOOOO............',
  '.....OKKKBBO............',
  '....OKKBBBBBO...........',
  '....OKBBBBBBO...........',
  '...OKBBBBBBBO...........',
  '...OKBBBBBBBOO..........',
  '...OKBBBBBBBBO..........',
  '...OKBBBBBBBO...........',
  '....OKBBBBBOO...........',
  '....OKKBBBBOO...........',
  '.....OOOOOO.............',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
] as const;

const MAP_ROUGH = [
  '........................',
  '........................',
  '.......OOOOOO...........',
  '......OKKBBOO...........',
  '.....OKKHBBBBO..........',
  '.....OKHLHBBBO..........',
  '....OKHHHBBBBB..........',
  '....OKKBBBBBBBO.........',
  '....OKBBBBBBBO..........',
  '.....OKKBBBBOO..........',
  '.....OOOOOOO............',
  '........................',
  '........................',
  '......W.................',
  '.....W.W................',
  '......W.................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
] as const;

const MAP_GEM = [
  '........................',
  '.........OOOO...........',
  '.......OOKKKBOO.........',
  '......OKHHLBBBO.........',
  '.....OKHLWLHBBBO........',
  '.....OKHLLLHBBBO........',
  '....OKHHHHHBBBBO........',
  '....OKKHBBBBBBBO........',
  '....OKBBBBBBBBO.........',
  '.....OKKBBBBOO..........',
  '......OOOOOO............',
  '........................',
  '......W.................',
  '.....WLW................',
  '....W.L.W...............',
  '.....WLW................',
  '......W.................',
  '........................',
  '...............W........',
  '..............WLW.......',
  '...............W........',
  '........................',
  '........................',
  '........................',
] as const;

const MAP_CRYSTAL = [
  '............W...........',
  '...........WLW..........',
  '............W...........',
  '.........OOOOO..........',
  '........OKHHLBO.........',
  '.......OKHLWLHBO........',
  '......OKHLLLHHBO........',
  '.....OKHHHHHBBBO........',
  '....OKKHBBBBBBO.........',
  '....OKBBBBBBBO..........',
  '.....OKKBBBOO...........',
  '......OOOOO.............',
  '........................',
  '..W..........W..........',
  '.WLW........WLW.........',
  '..W..........W..........',
  '........................',
  '...W....................',
  '..WLW...................',
  '...W....................',
  '........................',
  '.............W..........',
  '............WLW.........',
  '.............W..........',
] as const;

const MAPS = [MAP_STONE, MAP_ROUGH, MAP_GEM, MAP_CRYSTAL] as const;

interface GemStoneProps {
  gem: Gem;
  size?: number;
  onClick?: () => void;
  className?: string;
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return null;
  return [r, g, b];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function mixHex(hex: string, amount: number): [number, number, number] {
  const parsed = parseHexRgb(hex);
  if (!parsed) return [200, 200, 200];
  const [r, g, b] = parsed;

  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);

  const mixedR = Math.min(255, Math.max(0, Math.round(r + (target - r) * ratio)));
  const mixedG = Math.min(255, Math.max(0, Math.round(g + (target - g) * ratio)));
  const mixedB = Math.min(255, Math.max(0, Math.round(b + (target - b) * ratio)));

  return [mixedR, mixedG, mixedB];
}

function rgba(c: [number, number, number], alpha = 1): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

function buildPalette(hexColor: string): GemPalette {
  const base = parseHexRgb(hexColor);
  if (!base) {
    return {
      o: [100, 100, 100],
      k: [140, 140, 140],
      b: [200, 200, 200],
      h1: [230, 230, 230],
      h2: [255, 255, 255],
      glow: [220, 220, 220],
    };
  }

  const lum = relativeLuminance(base);
  const outlineMix = lum > 0.88 ? -0.64 : lum > 0.72 ? -0.58 : lum > 0.45 ? -0.52 : -0.48;
  const shadowMix = lum > 0.88 ? -0.34 : lum > 0.72 ? -0.28 : -0.22;
  const h1Mix = lum > 0.9 ? 0.18 : 0.28;
  const h2Mix = lum > 0.9 ? 0.38 : 0.52;
  const glowMix = lum > 0.88 ? 0.14 : 0.22;

  return {
    o: mixHex(hexColor, outlineMix),
    k: mixHex(hexColor, shadowMix),
    b: base,
    h1: mixHex(hexColor, h1Mix),
    h2: mixHex(hexColor, h2Mix),
    glow: mixHex(hexColor, glowMix),
  };
}

export default function GemStone({ gem, size = 40, onClick, className = '' }: GemStoneProps) {
  const emotion = getEmotion(gem.emotionCode);
  if (!emotion) return null;

  const pmap = MAPS[gem.tier - 1];
  const palette = buildPalette(emotion.hexColor);

  const colorOf: Record<string, string | null> = {
    '.': null,
    O: rgba(palette.o),
    K: rgba(palette.k),
    B: rgba(palette.b),
    H: rgba(palette.h1),
    L: rgba(palette.h2),
    W: 'rgba(255,255,255,1)',
    G: rgba(palette.glow, 0.47),
  };

  const pixels: Array<{ x: number; y: number; color: string }> = [];
  pmap.forEach((row, y) => {
    row.split('').forEach((ch, x) => {
      const color = colorOf[ch];
      if (!color) return;
      pixels.push({ x, y, color });
    });
  });

  return (
    <div
      onClick={onClick}
      className={`pixel-art ${gem.tier === 4 ? 'animate-glow' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-block',
        color: emotion.hexColor,
        transition: 'transform var(--duration-fast) var(--easing-out)',
        imageRendering: 'pixelated',
        filter: gem.tier === 4 ? 'drop-shadow(0 0 4px rgba(255,255,255,0.4))' : undefined,
      }}
      title={`${emotion.gemName} (${emotion.nameKo}) Lv.${gem.tier}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden
        style={{
          display: 'block',
          shapeRendering: 'crispEdges',
          imageRendering: 'pixelated',
        }}
      >
        {pixels.map((pixel, idx) => (
          <rect
            key={`${pixel.x}-${pixel.y}-${idx}`}
            x={pixel.x}
            y={pixel.y}
            width="1"
            height="1"
            fill={pixel.color}
          />
        ))}
      </svg>
    </div>
  );
}
