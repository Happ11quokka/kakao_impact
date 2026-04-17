// === ChibiAvatar — CSS로 그린 2등신 캐릭터 ===

interface ChibiAvatarProps {
  size?: number;
  className?: string;
}

export default function ChibiAvatar({ size = 64, className = '' }: ChibiAvatarProps) {
  const scale = size / 64;

  return (
    <div className={className} style={{ width: size, height: size * 1.3, position: 'relative', transform: `scale(${scale})`, transformOrigin: 'bottom center' }}>
      {/* 머리 */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 40, height: 38, borderRadius: '50% 50% 45% 45%',
        background: '#F5D6B8',
        border: '2px solid #5C3D2E',
        zIndex: 3,
      }}>
        {/* 머리카락 */}
        <div style={{
          position: 'absolute', top: -4, left: -3, right: -3,
          height: 22, borderRadius: '50% 50% 30% 30%',
          background: '#6B4226',
          zIndex: 1,
        }} />
        {/* 앞머리 */}
        <div style={{
          position: 'absolute', top: 2, left: 2, width: 12, height: 14,
          borderRadius: '0 0 50% 50%',
          background: '#7A4E30',
          zIndex: 2,
        }} />
        <div style={{
          position: 'absolute', top: 1, right: 4, width: 10, height: 12,
          borderRadius: '0 0 50% 50%',
          background: '#7A4E30',
          zIndex: 2,
        }} />

        {/* 눈 */}
        <div className="animate-blink" style={{
          position: 'absolute', top: 18, left: 10,
          width: 6, height: 7, borderRadius: '50%',
          background: '#2D1B0E', zIndex: 4,
        }}>
          <div style={{ position: 'absolute', top: 1, left: 1, width: 2, height: 2, borderRadius: '50%', background: 'white' }} />
        </div>
        <div className="animate-blink" style={{
          position: 'absolute', top: 18, right: 10,
          width: 6, height: 7, borderRadius: '50%',
          background: '#2D1B0E', zIndex: 4,
        }}>
          <div style={{ position: 'absolute', top: 1, left: 1, width: 2, height: 2, borderRadius: '50%', background: 'white' }} />
        </div>

        {/* 볼 터치 */}
        <div style={{ position: 'absolute', top: 23, left: 5, width: 8, height: 5, borderRadius: '50%', background: '#F4A6A0', opacity: 0.5, zIndex: 3 }} />
        <div style={{ position: 'absolute', top: 23, right: 5, width: 8, height: 5, borderRadius: '50%', background: '#F4A6A0', opacity: 0.5, zIndex: 3 }} />

        {/* 입 */}
        <div style={{ position: 'absolute', top: 27, left: '50%', transform: 'translateX(-50%)',
          width: 5, height: 3, borderRadius: '0 0 50% 50%',
          background: '#C47B5C', zIndex: 4,
        }} />
      </div>

      {/* 몸통 */}
      <div style={{
        position: 'absolute', top: 34, left: '50%', transform: 'translateX(-50%)',
        width: 28, height: 24, borderRadius: '6px 6px 4px 4px',
        background: '#4A90D9',
        border: '2px solid #2E5A8A',
        zIndex: 2,
      }}>
        {/* 옷 디테일 — 주머니 */}
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 8, height: 6, borderRadius: '2px', border: '1px solid #2E5A8A' }} />
      </div>

      {/* 왼팔 */}
      <div style={{
        position: 'absolute', top: 38, left: 8, width: 8, height: 16,
        borderRadius: '4px', background: '#F5D6B8', border: '1.5px solid #C9A57C',
        transform: 'rotate(8deg)', zIndex: 1,
      }} />
      {/* 오른팔 */}
      <div style={{
        position: 'absolute', top: 38, right: 8, width: 8, height: 16,
        borderRadius: '4px', background: '#F5D6B8', border: '1.5px solid #C9A57C',
        transform: 'rotate(-8deg)', zIndex: 1,
      }} />

      {/* 다리 */}
      <div style={{
        position: 'absolute', top: 55, left: 18, width: 10, height: 16,
        borderRadius: '3px 3px 4px 4px', background: '#5C4033',
        border: '1.5px solid #3D2B22', zIndex: 2,
      }} />
      <div style={{
        position: 'absolute', top: 55, right: 18, width: 10, height: 16,
        borderRadius: '3px 3px 4px 4px', background: '#5C4033',
        border: '1.5px solid #3D2B22', zIndex: 2,
      }} />

      {/* 발 */}
      <div style={{ position: 'absolute', bottom: 0, left: 14, width: 14, height: 6, borderRadius: '3px 6px 4px 2px', background: '#3D2B22', zIndex: 3 }} />
      <div style={{ position: 'absolute', bottom: 0, right: 14, width: 14, height: 6, borderRadius: '6px 3px 2px 4px', background: '#3D2B22', zIndex: 3 }} />
    </div>
  );
}
