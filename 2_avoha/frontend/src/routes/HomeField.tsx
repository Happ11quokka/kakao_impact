// === HomeField 화면 — 배낭 팝업 보텀시트 추가 ===
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldStore } from '../stores/field-store';
import type { FieldDrop } from '../stores/field-store';
import { useInventoryStore } from '../stores/inventory-store';
import GemStone from '../components/pixel/GemStone';
import ChibiAvatar from '../components/field/ChibiAvatar';
import PixelTree from '../components/field/PixelTree';
import { getEmotion } from '../data/emotions';
import { FIELD_SKY, getFieldTimePhase, type FieldPhase } from '../lib/field-time';
import { api } from '../lib/api';

const PALETTE: Record<FieldPhase, {
  mountainFar: string[];
  mountainNear: string[];
  treeMid: string;
  grassTop: string;
  grassMain: string;
  dirtMain: string;
  dirtBot: string;
  grassBlade: string;
  fogColor: string;
}> = {
  dawn: {
    mountainFar:  ['#E8C8D8', '#D8B8CC'],
    mountainNear: ['#C8A8C0', '#B898B0'],
    treeMid:      '#7A9A6A',
    grassTop:     'linear-gradient(180deg, #8AC86A 0%, #72B855 100%)',
    grassMain:    'linear-gradient(180deg, #6BAE55 0%, #5A9E45 100%)',
    dirtMain:     'linear-gradient(180deg, #9B7B5A 0%, #7B5B3A 100%)',
    dirtBot:      '#5A3E28',
    grassBlade:   '#72C455',
    fogColor:     'rgba(255, 220, 180, 0.15)',
  },
  afternoon: {
    mountainFar:  ['#8AAEC8', '#9ABCD8'],
    mountainNear: ['#6A8EA8', '#7A9EBA'],
    treeMid:      '#4A8A4A',
    grassTop:     'linear-gradient(180deg, #7AC85A 0%, #62B845 100%)',
    grassMain:    'linear-gradient(180deg, #5AA845 0%, #489835 100%)',
    dirtMain:     'linear-gradient(180deg, #8B6B4A 0%, #6B4F34 100%)',
    dirtBot:      '#4A3628',
    grassBlade:   '#62B845',
    fogColor:     'rgba(200, 240, 255, 0.1)',
  },
  dusk: {
    mountainFar:  ['#252548', '#1E1E40'],
    mountainNear: ['#1A1A38', '#151530'],
    treeMid:      '#162416',
    grassTop:     'linear-gradient(180deg, #1E3818 0%, #182E12 100%)',
    grassMain:    'linear-gradient(180deg, #182E12 0%, #12240E 100%)',
    dirtMain:     'linear-gradient(180deg, #2A1E14 0%, #201610 100%)',
    dirtBot:      '#140E0A',
    grassBlade:   '#1E3818',
    fogColor:     'rgba(80, 60, 120, 0.2)',
  },
};

const STARS = [
  { x: 8,  y: 4,  s: 2.5, d: '0s',    bright: true  },
  { x: 18, y: 8,  s: 1.5, d: '0.4s',  bright: false },
  { x: 28, y: 3,  s: 2,   d: '0.8s',  bright: false },
  { x: 38, y: 11, s: 1,   d: '1.2s',  bright: false },
  { x: 48, y: 5,  s: 1.5, d: '0.6s',  bright: false },
  { x: 55, y: 14, s: 2,   d: '1.6s',  bright: true  },
  { x: 63, y: 7,  s: 1,   d: '2s',    bright: false },
  { x: 72, y: 3,  s: 1.5, d: '0.2s',  bright: false },
  { x: 80, y: 10, s: 2,   d: '1s',    bright: false },
  { x: 88, y: 6,  s: 1,   d: '1.4s',  bright: false },
  { x: 92, y: 16, s: 1.5, d: '0.7s',  bright: false },
  { x: 23, y: 18, s: 1,   d: '1.8s',  bright: false },
  { x: 43, y: 19, s: 1.5, d: '2.2s',  bright: true  },
  { x: 68, y: 18, s: 1,   d: '0.9s',  bright: false },
  { x: 12, y: 22, s: 1,   d: '1.1s',  bright: false },
  { x: 85, y: 22, s: 2,   d: '0.3s',  bright: false },
];

// ── 오늘 날짜 포맷 ──────────────────────────────────────────────────
function formatToday(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// ── SVG 구름 ───────────────────────────────────────────────────────
function Cloud({ x, y, scale, opacity, delay, dark }: {
  x: number; y: number; scale: number; opacity: number; delay: string; dark: boolean;
}) {
  const fill   = dark ? 'rgba(140,130,180,0.25)' : 'rgba(255,255,255,0.9)';
  const shadow = dark ? 'rgba(100,90,140,0.15)'  : 'rgba(200,220,255,0.6)';
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      transform: `scale(${scale})`, transformOrigin: 'left center',
      opacity, animation: `cloudDrift ${12 + scale * 4}s ease-in-out infinite alternate`,
      animationDelay: delay,
    }}>
      <svg width="90" height="36" viewBox="0 0 90 36">
        <ellipse cx="45" cy="30" rx="38" ry="8"  fill={shadow} />
        <ellipse cx="30" cy="24" rx="22" ry="14" fill={fill} />
        <ellipse cx="50" cy="22" rx="26" ry="16" fill={fill} />
        <ellipse cx="68" cy="25" rx="18" ry="12" fill={fill} />
        <ellipse cx="38" cy="16" rx="14" ry="10" fill={fill} />
        <ellipse cx="56" cy="13" rx="16" ry="11" fill={fill} />
      </svg>
    </div>
  );
}

// ── 중경 나무 ──────────────────────────────────────────────────────
function MidTree({ x, h, phase }: { x: number; h: number; phase: string }) {
  const isDusk  = phase === 'dusk';
  const isDawn  = phase === 'dawn';
  const leafColor = isDusk ? '#162416' : isDawn ? '#7A9A6A' : '#4A8A4A';
  const leafLight = isDusk ? '#1E2E1E' : isDawn ? '#90B080' : '#62A062';
  const trunkColor = isDusk ? '#1A1208' : '#5A3A1A';
  return (
    <div style={{ position: 'absolute', left: `${x}%`, bottom: 0, opacity: isDusk ? 0.5 : 0.65 }}>
      <svg width={h * 0.7} height={h} viewBox={`0 0 ${h * 0.7} ${h}`}>
        <rect x={h*0.25} y={h*0.55} width={h*0.2} height={h*0.45} fill={trunkColor} rx="2"/>
        <ellipse cx={h*0.35} cy={h*0.55} rx={h*0.32} ry={h*0.2}  fill={leafColor}/>
        <ellipse cx={h*0.35} cy={h*0.4}  rx={h*0.26} ry={h*0.18} fill={leafColor}/>
        <ellipse cx={h*0.35} cy={h*0.27} rx={h*0.18} ry={h*0.14} fill={leafLight}/>
        <ellipse cx={h*0.28} cy={h*0.38} rx={h*0.07} ry={h*0.05} fill={leafLight} opacity="0.6"/>
      </svg>
    </div>
  );
}

// ── 풀잎 ───────────────────────────────────────────────────────────
function GrassBlade({ x, height, width, color, opacity }: {
  x: number; height: number; width: number; color: string; opacity: number;
}) {
  return (
    <svg style={{ position: 'absolute', left: x, bottom: 0 }} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={`M${width/2} ${height} Q${width*0.2} ${height*0.5} ${width*0.3} 0`}   stroke={color} strokeWidth="1.5" fill="none" opacity={opacity} />
      <path d={`M${width/2} ${height} Q${width*0.8} ${height*0.5} ${width*0.7} 0`}   stroke={color} strokeWidth="1.5" fill="none" opacity={opacity * 0.7} />
    </svg>
  );
}

// ── 배낭 아이콘 (캐릭터 옆) ────────────────────────────────────────
function BackpackIcon({ count, onClick, isDusk }: { count: number; onClick: () => void; isDusk: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', cursor: 'pointer',
        width: 36, height: 36,
        // 탭 피드백용 active scale은 CSS로
      }}
    >
      {/* 배낭 본체 */}
      <svg width="36" height="36" viewBox="0 0 36 36">
        {/* 끈 */}
        <rect x="13" y="4" width="10" height="6" rx="3" fill={isDusk ? '#8B4513' : '#A0522D'} />
        {/* 몸통 */}
        <rect x="8"  y="9"  width="20" height="20" rx="5" fill={isDusk ? '#C8521A' : '#E06020'} />
        {/* 앞주머니 */}
        <rect x="11" y="17" width="14" height="9"  rx="3" fill={isDusk ? '#A03E12' : '#C04A18'} />
        {/* 지퍼 라인 */}
        <line x1="11" y1="17" x2="25" y2="17" stroke={isDusk ? '#8B3510' : '#9B3510'} strokeWidth="1.5" />
      </svg>

      {/* 뱃지 — 수집 개수 */}
      {count > 0 && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          minWidth: 16, height: 16, borderRadius: 8,
          background: '#FFD700',
          border: `2px solid ${isDusk ? '#1B1B3A' : '#FFFFFF'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: '#7A4800',
          padding: '0 3px',
          lineHeight: 1,
        }}>
          {count}
        </div>
      )}
    </div>
  );
}

// ── 배낭 팝업 보텀시트 ────────────────────────────────────────────
function BackpackBottomSheet({
  drops,
  maxSlots,
  onClose,
  onGoInventory,
}: {
  drops: FieldDrop[];
  maxSlots: number;
  onClose: () => void;
  onGoInventory: () => void;
}) {
  const [visible, setVisible] = useState(false);

  // 마운트 직후 애니메이션 트리거
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // NEW 여부: 오늘 수집한 것은 모두 NEW 처리 (실제로는 drop.isNew 플래그 활용 가능)
  const isNew = (idx: number) => idx < drops.length;

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300); // 애니메이션 후 unmount
  }

  // 빈 슬롯 포함한 전체 슬롯 배열
  const slots = Array.from({ length: maxSlots }, (_, i) =>
    i < drops.length ? drops[i] : null
  );

  return (
    <>
      {/* 딤드 오버레이 */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.45)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* 보텀시트 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#FFFAF4',
        borderRadius: '20px 20px 0 0',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        paddingBottom: 24,
        overflow: 'hidden',
      }}>

        {/* 핸들 바 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#D8C8B0', borderRadius: 99 }} />
        </div>

        {/* 헤더 */}
        <div style={{
          padding: '8px 20px 12px',
          borderBottom: '0.5px solid #F0DCC0',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#5A3E28', marginBottom: 6 }}>
            오늘의 원석 배낭
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#A07850' }}>{formatToday()}</span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              background: '#FDE8C8', color: '#7A4800',
              padding: '3px 10px', borderRadius: 99,
            }}>
              {drops.length}개 수집
            </span>
          </div>
        </div>

        {/* 원석 그리드 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          padding: '14px 20px 0',
        }}>
          {slots.map((drop, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1',
                background: drop ? '#FFF7EE' : '#FDF5EA',
                border: drop ? '1.5px solid #F0DCC0' : '1.5px dashed #E8D0B0',
                borderRadius: 12,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 4,
                opacity: drop ? 1 : 0.45,
                position: 'relative',
                // 수집된 원석 드롭인 애니메이션
                animation: drop ? `dropIn 0.35s ease ${i * 60}ms both` : 'none',
              }}
            >
              {drop ? (
                <>
                  {/* NEW 뱃지 */}
                  {isNew(i) && (
                    <div style={{
                      position: 'absolute', top: -5, right: -5,
                      fontSize: 7, fontWeight: 700,
                      background: '#FF6B6B', color: '#fff',
                      padding: '2px 5px', borderRadius: 4,
                      letterSpacing: '0.02em',
                    }}>
                      NEW
                    </div>
                  )}
                  <GemStone gem={drop.gem} size={40} />
                  <span style={{ fontSize: 10, color: '#A07850', fontWeight: 500 }}>
                    {getEmotion(drop.gem.emotionCode)?.nameKo ?? '원석'}
                  </span>
                  <span style={{
                    position: 'absolute', bottom: 4, right: 6,
                    fontSize: 9, color: '#C0A080', fontFamily: 'monospace',
                  }}>
                    Lv{drop.gem.tier}
                  </span>
                </>
              ) : (
                // 미수집 빈 슬롯
                <span style={{ fontSize: 18, color: '#D8C0A0', lineHeight: 1 }}>+</span>
              )}
            </div>
          ))}
        </div>

        {/* 힌트 — 미수집 슬롯 있을 때 */}
        {drops.length < maxSlots && (
          <p style={{
            fontSize: 11, color: '#B09070', textAlign: 'center',
            marginTop: 10, padding: '0 20px',
          }}>
            일상을 더 기록하면 원석을 채울 수 있어요 💎
          </p>
        )}

        {/* 액션 버튼 */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px 0' }}>
          <button
            onClick={onGoInventory}
            style={{
              flex: 1, height: 44,
              background: '#E8A030', border: 'none', borderRadius: 12,
              fontSize: 14, fontWeight: 600, color: '#7A4800', cursor: 'pointer',
            }}
          >
            인벤토리 전체 보기
          </button>
          <button
            onClick={handleClose}
            style={{
              height: 44, padding: '0 18px',
              background: '#FDE8C8', border: '0.5px solid #E8C090', borderRadius: 12,
              fontSize: 14, color: '#A07850', cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}

// ── CSS 애니메이션 ─────────────────────────────────────────────────
const STYLE = `
@keyframes cloudDrift {
  from { transform: translateX(0) scale(var(--sc, 1)); }
  to   { transform: translateX(12px) scale(var(--sc, 1)); }
}
@keyframes starTwinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.3; transform: scale(0.6); }
}
@keyframes starBright {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(1.4); }
}
@keyframes breathe {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-3px); }
}
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-16px) scale(0.75); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes fogDrift {
  0%   { transform: translateX(-5%); opacity: 0.6; }
  50%  { opacity: 1; }
  100% { transform: translateX(5%);  opacity: 0.6; }
}
@keyframes hintPulse {
  0%, 100% { opacity: 0.5; transform: translateY(0); }
  50%       { opacity: 1;   transform: translateY(-2px); }
}
`;

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function HomeField() {
  const navigate = useNavigate();
  const { todayDrops, fetchToday }          = useFieldStore();
  const { ticketsRemaining, fetchInventory } = useInventoryStore();
  const [phase, setPhase]       = useState<FieldPhase>(getFieldTimePhase);
  const [bagOpen, setBagOpen]   = useState(false);
  const [chatbotTodayCount, setChatbotTodayCount] = useState(0);

  useEffect(() => { fetchToday(); fetchInventory(); }, [fetchToday, fetchInventory]);

  // 오늘 챗봇에서 저장한 원석 개수 — 빈 상태 안내문에 사용 (실패해도 UI 깨지지 않게 silent)
  useEffect(() => {
    api
      .chatbotRecords()
      .then((res) => {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const d = today.getDate();
        const n = res.records.filter((r) => {
          const dt = new Date(r.createdAt);
          return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
        }).length;
        setChatbotTodayCount(n);
      })
      .catch(() => setChatbotTodayCount(0));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setPhase(getFieldTimePhase()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const isDusk = phase === 'dusk';
  const isDawn = phase === 'dawn';
  const P      = PALETTE[phase];

  const midTrees = [
    { x: 3,  h: 55 }, { x: 12, h: 40 }, { x: 22, h: 65 },
    { x: 55, h: 48 }, { x: 72, h: 58 }, { x: 88, h: 42 },
  ];

  const grassBlades = Array.from({ length: 40 }, (_, i) => ({
    x: i * (390 / 40) - 4 + (i % 3) * 2,
    h: 10 + (i % 5) * 5,
    w: 8  + (i % 3) * 2,
    opacity: 0.6 + (i % 4) * 0.1,
  }));

  // 배낭에서 인벤토리로 이동
  function handleGoInventory() {
    setBagOpen(false);
    navigate('/inventory');
  }

  return (
    <>
      <style>{STYLE}</style>
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: FIELD_SKY[phase],
        transition: 'background 2s ease',
      }}>

        {/* ── HUD — 채집권 ── */}
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 30,
          background: 'rgba(10,10,25,0.65)', backdropFilter: 'blur(10px)',
          borderRadius: 999, padding: '6px 14px',
          fontSize: 13, fontWeight: 700, color: '#FFD700',
          border: '1px solid rgba(255,215,0,0.35)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          🎫 <span>{ticketsRemaining}/5</span>
        </div>

        {/* ── 시간대 아이콘 ── */}
        <div style={{ position: 'absolute', top: 14, right: 16, zIndex: 30, fontSize: 24 }}>
          {phase === 'dawn' ? '🌅' : phase === 'afternoon' ? '☀️' : '🌙'}
        </div>

        {/* ── 별 (dusk) ── */}
        {isDusk && STARS.map((s, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
            width: s.s, height: s.s, borderRadius: '50%',
            background: s.bright ? '#fff' : 'rgba(255,255,255,0.85)',
            animation: `${s.bright ? 'starBright' : 'starTwinkle'} ${2 + (i % 3)}s ease-in-out infinite`,
            animationDelay: s.d,
            boxShadow: s.bright ? `0 0 ${s.s * 3}px rgba(255,255,255,0.8)` : 'none',
          }} />
        ))}

        {/* ── 새벽 렌즈플레어 ── */}
        {isDawn && (
          <div style={{
            position: 'absolute', top: '-5%', left: '50%',
            width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(255,200,100,0.3) 0%, rgba(255,160,80,0.1) 50%, transparent 70%)',
            transform: 'translateX(-50%)', pointerEvents: 'none',
          }} />
        )}

        {/* ── 구름 ── */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '35%', pointerEvents: 'none' }}>
          <Cloud x={5}  y={6}  scale={1.1} opacity={isDusk ? 0.25 : 0.85} delay="0s" dark={isDusk} />
          <Cloud x={28} y={10} scale={0.8} opacity={isDusk ? 0.2  : 0.7}  delay="2s" dark={isDusk} />
          <Cloud x={52} y={4}  scale={1.3} opacity={isDusk ? 0.2  : 0.9}  delay="4s" dark={isDusk} />
          <Cloud x={74} y={12} scale={0.9} opacity={isDusk ? 0.15 : 0.75} delay="1s" dark={isDusk} />
        </div>

        {/* ── 원경 산 ── */}
        <svg viewBox="0 0 400 100"
          style={{ position: 'absolute', bottom: '38%', width: '100%', height: '22%', opacity: 0.7 }}
          preserveAspectRatio="none"
        >
          <path d="M0 100 L30 55 L60 75 L100 30 L145 60 L190 20 L235 55 L280 15 L325 45 L365 25 L400 50 L400 100 Z" fill={P.mountainFar[0]} />
          <path d="M0 100 L50 65 L95 45 L140 70 L185 38 L230 62 L275 32 L320 58 L365 40 L400 65 L400 100 Z"         fill={P.mountainFar[1]} opacity="0.85" />
          <rect x="0" y="80" width="400" height="20" fill={P.fogColor} />
        </svg>

        {/* ── 중경 나무 ── */}
        <div style={{ position: 'absolute', bottom: '28%', width: '100%', height: 80, pointerEvents: 'none' }}>
          {midTrees.map((t, i) => <MidTree key={i} x={t.x} h={t.h} phase={phase} />)}
        </div>

        {/* ── 큰 나무 ── */}
        <div style={{ position: 'absolute', bottom: '22%', right: '6%', zIndex: 5 }}>
          <PixelTree phase={phase} />
        </div>

        {/* ── 지면 ── */}
        <div style={{ position: 'absolute', bottom: 0, width: '100%', height: '28%', zIndex: 4 }}>
          <div style={{ position: 'absolute', top: -18, left: 0, width: '100%', height: 22, overflow: 'hidden' }}>
            {grassBlades.map((g, i) => (
              <GrassBlade key={i} x={g.x} height={g.h} width={g.w} color={P.grassBlade} opacity={g.opacity} />
            ))}
          </div>
          <div style={{ width: '100%', height: '8%',  background: P.grassTop  }} />
          <div style={{ width: '100%', height: '40%', background: P.grassMain }} />
          <div style={{ width: '100%', height: '35%', background: P.dirtMain  }} />
          <div style={{ width: '100%', height: '17%', background: P.dirtBot   }} />
          {!isDusk && [8, 20, 40, 62, 78, 90].map((x, i) => (
            <div key={i} style={{ position: 'absolute', top: 2, left: `${x}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: ['#FFD700','#FF6B8A','#87CEEB','#FFB347','#FF69B4','#A8E87A'][i],
                boxShadow: `0 0 4px ${['#FFD700','#FF6B8A','#87CEEB','#FFB347','#FF69B4','#A8E87A'][i]}60`,
              }} />
              <div style={{ width: 1.5, height: 6, background: P.grassBlade, borderRadius: 1 }} />
            </div>
          ))}
        </div>

        {/* ── 지면 안개 (dusk) ── */}
        {isDusk && (
          <div style={{
            position: 'absolute', bottom: '25%', left: '-5%', width: '110%', height: 30,
            background: 'linear-gradient(90deg, transparent, rgba(80,60,120,0.25) 30%, rgba(80,60,120,0.25) 70%, transparent)',
            animation: 'fogDrift 8s ease-in-out infinite', pointerEvents: 'none',
          }} />
        )}

        {/* ── 캐릭터 (breathe 애니메이션은 캐릭터에만 — transform이 자식 absolute에 간섭하지 않게 분리) ── */}
        <div style={{
          position: 'absolute', bottom: '26.5%', left: '35%', zIndex: 10,
          animation: 'breathe 3s ease-in-out infinite',
        }}>
          <ChibiAvatar size={58} />
        </div>

        {/* 캐릭터 그림자 */}
        <div style={{
          position: 'absolute', bottom: 'calc(26.5% - 6px)', left: 'calc(35% + 4px)', zIndex: 9,
          width: 36, height: 7, borderRadius: '50%',
          background: 'rgba(0,0,0,0.18)', filter: 'blur(3px)',
        }} />

        {/* ── 배낭 아이콘 (캐릭터와 완전히 독립된 absolute — breathe transform 간섭 없음) ── */}
        <div style={{
          position: 'absolute',
          bottom: 'calc(26.5% + 10px)',
          left: 'calc(35% + 62px)',
          zIndex: 15,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <BackpackIcon
            count={todayDrops.length}
            onClick={() => setBagOpen(true)}
            isDusk={isDusk}
          />
          {todayDrops.length > 0 && (
            <span style={{
              fontSize: 9,
              color: isDusk ? 'rgba(255,220,150,0.85)' : 'rgba(90,60,30,0.7)',
              whiteSpace: 'nowrap',
              animation: 'hintPulse 2s ease-in-out infinite',
            }}>
              탭해서 열기
            </span>
          )}
        </div>

        {/* ── 빈 상태 (원석 없을 때) ── */}
        {todayDrops.length === 0 && (
          <div
            onClick={() => chatbotTodayCount > 0 && navigate('/inventory')}
            style={{
              position: 'absolute', bottom: '42%', left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center', zIndex: 20, whiteSpace: 'nowrap',
              color: isDusk ? 'rgba(255,255,255,0.75)' : 'rgba(60,40,20,0.75)',
              background: isDusk ? 'rgba(10,8,20,0.55)' : 'rgba(255,255,255,0.75)',
              padding: '10px 20px', borderRadius: 12,
              backdropFilter: 'blur(6px)',
              border: isDusk ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.06)',
              fontSize: 13,
              cursor: chatbotTodayCount > 0 ? 'pointer' : 'default',
            }}
          >
            {chatbotTodayCount > 0 ? (
              <>
                <p>오늘 필드엔 아직 원석이 놓여있지 않지만...</p>
                <p style={{ fontSize: 11, marginTop: 4, opacity: 0.85, fontWeight: 600 }}>
                  💬 챗봇에서 {chatbotTodayCount}개 채집한 원석이 있어요 · 탭해서 보기
                </p>
              </>
            ) : (
              <>
                <p>오늘 채집한 보석이 없어요</p>
                <p style={{ fontSize: 11, marginTop: 4, opacity: 0.65 }}>카카오톡에서 일상을 보내보세요 💎</p>
              </>
            )}
          </div>
        )}

        {/* ── 배낭 보텀시트 팝업 ── */}
        {bagOpen && (
          <BackpackBottomSheet
            drops={todayDrops}
            maxSlots={ticketsRemaining + todayDrops.length} // 오늘 최대 슬롯
            onClose={() => setBagOpen(false)}
            onGoInventory={handleGoInventory}
          />
        )}

      </div>
    </>
  );
}
