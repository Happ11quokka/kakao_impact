// === PixelTree — CSS로 구현한 큰 나무 ===

interface PixelTreeProps {
  phase: 'dawn' | 'afternoon' | 'dusk';
  className?: string;
}

const LEAF_COLORS = {
  dawn:      ['#8CC084', '#A8D89A', '#C4E8A4', '#E8D888'],
  afternoon: ['#5B9E4F', '#78B860', '#4A8E3E', '#6BAE55'],
  dusk:      ['#D4764E', '#C45A3C', '#E89060', '#8B5E3C'],
};

export default function PixelTree({ phase, className = '' }: PixelTreeProps) {
  const colors = LEAF_COLORS[phase];

  return (
    <div className={className} style={{ position: 'relative', width: 160, height: 220 }}>
      {/* 나뭇잎 수관 */}
      {/* 상단 */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 70, height: 55, borderRadius: '50%',
        background: colors[0], zIndex: 3,
        boxShadow: `inset -8px -6px 0 ${colors[2]}`,
      }} />
      {/* 왼쪽 */}
      <div style={{
        position: 'absolute', top: 25, left: 10,
        width: 65, height: 50, borderRadius: '50%',
        background: colors[1], zIndex: 2,
        boxShadow: `inset -6px -4px 0 ${colors[0]}`,
      }} />
      {/* 오른쪽 */}
      <div style={{
        position: 'absolute', top: 20, right: 5,
        width: 70, height: 55, borderRadius: '50%',
        background: colors[0], zIndex: 2,
        boxShadow: `inset 6px -4px 0 ${colors[2]}`,
      }} />
      {/* 중앙 하단 */}
      <div style={{
        position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
        width: 90, height: 45, borderRadius: '45%',
        background: colors[2], zIndex: 1,
        boxShadow: `inset -5px 5px 0 ${colors[3]}`,
      }} />
      {/* 하이라이트 */}
      <div style={{
        position: 'absolute', top: 10, left: '45%',
        width: 20, height: 15, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)', zIndex: 4,
        filter: 'blur(4px)',
      }} />

      {/* 나무 기둥 (trunk) */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 28, height: 140, zIndex: 0,
        background: 'linear-gradient(90deg, #5C3D2E 0%, #7A5240 40%, #6B4636 70%, #5C3D2E 100%)',
        borderRadius: '4px 4px 8px 8px',
      }}>
        {/* 나무 결 디테일 */}
        <div style={{ position: 'absolute', top: 30, left: 5, width: 3, height: 20, background: '#4A2F22', borderRadius: 2, opacity: 0.5 }} />
        <div style={{ position: 'absolute', top: 70, left: 10, width: 4, height: 15, background: '#4A2F22', borderRadius: 2, opacity: 0.4 }} />
        <div style={{ position: 'absolute', top: 50, right: 6, width: 3, height: 18, background: '#4A2F22', borderRadius: 2, opacity: 0.3 }} />
        {/* 작은 가지 */}
        <div style={{
          position: 'absolute', top: 60, left: -12, width: 16, height: 5,
          background: '#6B4636', borderRadius: '4px 0 0 4px',
          transform: 'rotate(-15deg)',
        }} />
        <div style={{
          position: 'absolute', top: 45, right: -10, width: 14, height: 4,
          background: '#6B4636', borderRadius: '0 4px 4px 0',
          transform: 'rotate(12deg)',
        }} />
      </div>

      {/* 떨어지는 나뭇잎 (하나) */}
      <div style={{
        position: 'absolute', top: 80, right: 20,
        width: 8, height: 6, borderRadius: '50% 0 50% 50%',
        background: colors[3], opacity: 0.7, zIndex: 5,
        animation: 'leafFall 4s ease-in-out infinite',
      }} />

      {/* 뿌리 */}
      <div style={{
        position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
        width: 50, height: 10, borderRadius: '0 0 50% 50%',
        background: '#5C3D2E', zIndex: 0,
      }} />
    </div>
  );
}
