// === GemStone — gem_generator_v2 기반 픽셀 스프라이트 렌더러 ===
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

const PALETTE_OVERRIDES: Record<string, GemPalette> = {
  joy: { o: [0x8b, 0x00, 0x00], k: [0xc4, 0x20, 0x20], b: [0xe8, 0x50, 0x50], h1: [0xf8, 0x90, 0x90], h2: [0xff, 0xc0, 0xc0], glow: [0xff, 0x60, 0x60] },
  satisfaction: { o: [0x7a, 0x48, 0x00], k: [0xc0, 0x70, 0x20], b: [0xe8, 0xa0, 0x30], h1: [0xf8, 0xcc, 0x70], h2: [0xff, 0xe8, 0xa0], glow: [0xff, 0xb0, 0x30] },
  serenity: { o: [0x00, 0x55, 0x80], k: [0x20, 0x90, 0xc0], b: [0x50, 0xb8, 0xe8], h1: [0x90, 0xd8, 0xf8], h2: [0xc0, 0xee, 0xff], glow: [0x40, 0xc0, 0xff] },
  flutter: { o: [0x88, 0x00, 0x40], k: [0xc0, 0x40, 0x80], b: [0xf0, 0x80, 0xb0], h1: [0xf8, 0xb0, 0xd0], h2: [0xff, 0xd8, 0xe8], glow: [0xff, 0x80, 0xc0] },
  pride: { o: [0x80, 0x60, 0x00], k: [0xc0, 0xa0, 0x00], b: [0xf0, 0xd0, 0x20], h1: [0xf8, 0xe8, 0x70], h2: [0xff, 0xf5, 0xb0], glow: [0xff, 0xd8, 0x00] },
  untroubled: { o: [0x70, 0x70, 0x85], k: [0xa8, 0xa8, 0xbc], b: [0xd0, 0xd0, 0xe4], h1: [0xe8, 0xe8, 0xf8], h2: [0xf8, 0xf8, 0xff], glow: [0xc0, 0xc8, 0xff] },
  solace: { o: [0x7a, 0x40, 0x30], k: [0xc0, 0x80, 0x60], b: [0xe8, 0xb0, 0x90], h1: [0xf8, 0xd0, 0xb0], h2: [0xff, 0xee, 0xdd], glow: [0xff, 0xc0, 0x90] },
  sadness: { o: [0x1a, 0x1a, 0x50], k: [0x30, 0x30, 0x80], b: [0x50, 0x60, 0xa0], h1: [0x80, 0x90, 0xd0], h2: [0xb0, 0xc0, 0xf0], glow: [0x60, 0x80, 0xff] },
};

interface GemStoneProps {
  gem: Gem;
  size?: number;
  onClick?: () => void;
  className?: string;
}

function mixHex(hex: string, amount: number): [number, number, number] {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return [200, 200, 200];

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

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

function buildPalette(emotionCode: string, hexColor: string): GemPalette {
  const preset = PALETTE_OVERRIDES[emotionCode];
  if (preset) return preset;

  // 참고 코드의 O/K/B/H1/H2 관계를 유지하기 위한 자동 팔레트 생성
  return {
    o: mixHex(hexColor, -0.55),
    k: mixHex(hexColor, -0.2),
    b: mixHex(hexColor, 0),
    h1: mixHex(hexColor, 0.3),
    h2: mixHex(hexColor, 0.55),
    glow: mixHex(hexColor, 0.2),
  };
}

export default function GemStone({ gem, size = 40, onClick, className = '' }: GemStoneProps) {
  const emotion = getEmotion(gem.emotionCode);
  if (!emotion) return null;

  const pmap = MAPS[gem.tier - 1];
  const palette = buildPalette(emotion.code, emotion.hexColor);

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
