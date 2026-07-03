// === GemSlots — 십자형(+) 보석 구멍 5개 ===
import { getEmotion } from '../../data/emotions';

interface GemSlotsProps {
  /** 채워진 보석의 emotionCode 배열 (최대 5) */
  filledEmotions: string[];
  /** 보석 구멍 크기 — 'sm' 캘린더 셀, 'md' 상세 뷰 */
  variant?: 'sm' | 'md';
}

/**
 * 십자형 배치:
 *     [1]
 *  [2][0][3]
 *     [4]
 *
 * 채우는 순서: 중앙 → 상 → 우 → 하 → 좌
 */
const POSITIONS = [
  { gridColumn: 2, gridRow: 2 }, // 중앙
  { gridColumn: 2, gridRow: 1 }, // 상
  { gridColumn: 3, gridRow: 2 }, // 우
  { gridColumn: 2, gridRow: 3 }, // 하
  { gridColumn: 1, gridRow: 2 }, // 좌
];

export default function GemSlots({ filledEmotions, variant = 'sm' }: GemSlotsProps) {
  const dotSize = variant === 'sm' ? 6 : 10;
  const gap = variant === 'sm' ? 1 : 3;

  return (
    <div
      style={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(3, ${dotSize}px)`,
        gridTemplateRows: `repeat(3, ${dotSize}px)`,
        gap,
        justifyContent: 'center',
        alignContent: 'center',
      }}
    >
      {POSITIONS.map((pos, i) => {
        const emotionCode = filledEmotions[i];
        const emotion = emotionCode ? getEmotion(emotionCode) : null;
        const filled = !!emotion;

        return (
          <div
            key={i}
            style={{
              gridColumn: pos.gridColumn,
              gridRow: pos.gridRow,
              width: dotSize,
              height: dotSize,
              borderRadius: '50%',
              background: filled
                ? emotion!.hexColor
                : 'rgba(180, 170, 155, 0.25)',
              border: filled
                ? `1px solid ${emotion!.hexColor}`
                : '1px solid rgba(180, 170, 155, 0.4)',
              boxShadow: filled
                ? `0 0 ${variant === 'sm' ? 2 : 4}px ${emotion!.hexColor}80`
                : 'none',
              transition: 'all 0.3s ease',
            }}
          />
        );
      })}
    </div>
  );
}
