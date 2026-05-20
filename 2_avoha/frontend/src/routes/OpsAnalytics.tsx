// === OpsAnalytics — 운영자 전용 사용자 행동 분석 대시보드 (데스크탑) ===
// phone-frame 밖, full viewport. 각 패널마다 "무엇을 보는가 / 어떻게 읽는가" 캡션.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { openAnalyticsStream, type StreamEvent } from '../lib/analytics-stream';
import { clearOpsBasicAuth, getOpsBasicAuth } from '../components/RequireOpsUser';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

type Range = '24h' | '7d' | '30d';

type Summary = {
  totalEvents: number;
  totalQuestions: number;
  totalErrors: number;
  dau: number;
  activeSessions: number;
  date?: string;
};
type Page = { path: string; views: number; uniq: number; avgDwellMs: number };
type Funnel = { questions: number; confirmations: number; confirmRate: number };
type TypeRow = { type: string; count: number };
type Bucket = { hour: string; count: number };
type UserRow = {
  userId: string;
  nickname: string;
  eventCount: number;
  sessionCount: number;
  lastSeen: string | null;
};
type ErrorRow = { eventType: string; message: string; count: number; lastSeen: string | null };
type EventRow = {
  eventType: string;
  userId: string | null;
  props: Record<string, unknown> | null;
  occurredAt: string | null;
};

async function get<T>(path: string): Promise<T | null> {
  try {
    const basic = getOpsBasicAuth();
    const res = await fetch(`${API_URL}${path}`, {
      headers: basic ? { Authorization: `Basic ${basic}` } : {},
    });
    if (res.status === 401) {
      clearOpsBasicAuth();
      window.location.reload();
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function OpsAnalytics() {
  const [range, setRange] = useState<Range>('24h');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [recent, setRecent] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setLoading(true);
    const [s, p, f, t, b, u, e, r] = await Promise.all([
      get<Summary>('/ops/analytics/summary'),
      get<{ pages: Page[] }>(`/ops/analytics/pages?range=${range}`),
      get<Funnel>(`/ops/analytics/funnels/chatbot?range=${range}`),
      get<{ types: TypeRow[] }>(`/ops/analytics/event-types?range=${range}`),
      get<{ buckets: Bucket[] }>(`/ops/analytics/timeseries?range=${range}`),
      get<{ users: UserRow[] }>(`/ops/analytics/users?range=${range}`),
      get<{ errors: ErrorRow[] }>(`/ops/analytics/errors?range=${range}`),
      get<{ events: EventRow[] }>(`/ops/analytics/events?range=${range}&limit=80`),
    ]);
    if (s) setSummary(s);
    setPages(p?.pages ?? []);
    if (f) setFunnel(f);
    setTypes(t?.types ?? []);
    setBuckets(b?.buckets ?? []);
    setUsers(u?.users ?? []);
    setErrors(e?.errors ?? []);
    setRecent(r?.events ?? []);
    setLoading(false);
    setLastRefreshed(new Date());
  }, [range]);
  refreshRef.current = reload;

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void refreshRef.current(), 30_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  // 실시간 SSE: 새 이벤트 → 스트림 prepend + KPI 카운터 즉시 증가.
  useEffect(() => {
    if (!autoRefresh) return;
    const close = openAnalyticsStream((ev: StreamEvent) => {
      if (!ev.eventType) return;
      setRecent((prev) => [
        {
          eventType: ev.eventType ?? 'unknown',
          userId: ev.userId ?? null,
          props: ev.props ?? null,
          occurredAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 80));
      setSummary((prev) => {
        if (!prev) return prev;
        const next = { ...prev, totalEvents: prev.totalEvents + 1 };
        if (ev.eventType === 'chatbot.question.sent') next.totalQuestions += 1;
        if (ev.eventType === 'error.client' || ev.eventType === 'error.api') {
          next.totalErrors += 1;
        }
        return next;
      });
    });
    return close;
  }, [autoRefresh]);

  const formatTime = useCallback((iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  const formatBucketLabel = useCallback((iso: string) => {
    const d = new Date(iso);
    if (range === '24h') return `${String(d.getHours()).padStart(2, '0')}:00`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }, [range]);

  const bucketChartData = useMemo(
    () => buckets.map((b) => ({ x: formatBucketLabel(b.hour), count: b.count })),
    [buckets, formatBucketLabel],
  );

  const rangeLabel = range === '24h' ? '지난 24시간' : range === '7d' ? '지난 7일' : '지난 30일';
  const lastRefreshedLabel = lastRefreshed
    ? `${String(lastRefreshed.getHours()).padStart(2, '0')}:${String(lastRefreshed.getMinutes()).padStart(2, '0')}:${String(lastRefreshed.getSeconds()).padStart(2, '0')}`
    : '—';

  const totalTypeEvents = types.reduce((acc, t) => acc + t.count, 0) || 1;

  return (
    <div style={styles.viewport}>
      <div style={styles.container}>
        {/* 상단 헤더 + 가이드 */}
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>운영자 · 사용자 행동 분석 대시보드</p>
            <h1 style={styles.title}>아보하 사용 현황</h1>
            <p style={styles.subtitle}>
              {rangeLabel} 동안 누가 어디서 무엇을 했는지 한눈에. 라이브 모드면 새 이벤트가 들어올 때마다 자동 갱신.
            </p>
          </div>
          <div style={styles.controlsCol}>
            <div style={styles.controls}>
              {(['24h', '7d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  data-track={`ops.range.${r}`}
                  style={{
                    ...styles.rangeBtn,
                    background: range === r ? '#1E3328' : '#FFFFFF',
                    color: range === r ? '#FFFFFF' : '#5A4A32',
                  }}
                >
                  {r === '24h' ? '24시간' : r === '7d' ? '7일' : '30일'}
                </button>
              ))}
              <label style={styles.autoLabel}>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(ev) => setAutoRefresh(ev.target.checked)}
                />
                라이브 (30초+SSE)
              </label>
              <button
                type="button"
                onClick={() => void reload()}
                disabled={loading}
                data-track="ops.refresh"
                style={styles.refreshBtn}
              >
                {loading ? '불러오는 중…' : '새로고침'}
              </button>
            </div>
            <span style={styles.lastRefreshed}>마지막 갱신 {lastRefreshedLabel}</span>
          </div>
        </header>

        {/* KPI 카드 */}
        <section style={styles.kpiRow}>
          <KpiCard
            label="오늘 DAU"
            value={summary?.dau ?? 0}
            hint="오늘 한 번이라도 이벤트를 발사한 고유 사용자/익명 수 (HyperLogLog)"
          />
          <KpiCard
            label="활성 세션 (30분)"
            value={summary?.activeSessions ?? 0}
            hint="지금 이 순간 활동 중인 sessionId 수 (지난 30분 슬라이딩 윈도우)"
            accent="#3D6050"
          />
          <KpiCard
            label="오늘 이벤트"
            value={summary?.totalEvents ?? 0}
            hint="모든 종류의 이벤트 누계 (페이지뷰·클릭·에러·서버 이벤트 포함)"
          />
          <KpiCard
            label="오늘 챗봇 질문"
            value={summary?.totalQuestions ?? 0}
            hint="카카오 webhook 으로 들어온 inbound 메시지 수. 0 이면 webhook 이 우리 endpoint 로 안 옴"
          />
          <KpiCard
            label="오늘 에러"
            value={summary?.totalErrors ?? 0}
            hint="error.client(React/JS) + error.api(백엔드 500/4xx) 합계"
            accent={summary && summary.totalErrors > 0 ? '#B23A3A' : undefined}
          />
        </section>

        {/* 2-column grid: charts + tables */}
        <section style={styles.grid}>
          {/* 시간대별 추이 */}
          <Panel
            title="이벤트 추이"
            caption={range === '24h' ? '시간대별' : '일자별'}
            help="언제 사람들이 가장 많이 들어왔는지. 피크 시간대 파악용."
            span={2}
          >
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={bucketChartData} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="#E0D3BA" strokeDasharray="3 3" />
                  <XAxis dataKey="x" stroke="#8B7355" fontSize={11} />
                  <YAxis stroke="#8B7355" fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#1E3328" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* 이벤트 타입 분포 — 자체 horizontal bar (라벨이 잘 보임) */}
          <Panel
            title="이벤트 타입 분포"
            caption={`${types.length}종 · 총 ${totalTypeEvents.toLocaleString()}건`}
            help="어떤 종류의 이벤트가 가장 많이 발생하는지. 클릭이 압도적으로 많으면 사용자가 활발하다는 뜻."
            span={2}
          >
            {types.length === 0 ? (
              <p style={styles.empty}>아직 이벤트 없음</p>
            ) : (
              <ul style={styles.typeBarList}>
                {types.slice(0, 12).map((t) => {
                  const pct = Math.round((t.count / totalTypeEvents) * 100);
                  return (
                    <li key={t.type} style={styles.typeBarRow}>
                      <span style={styles.typeBarName} title={t.type}>{t.type}</span>
                      <span style={styles.typeBarTrack}>
                        <span
                          style={{
                            ...styles.typeBarFill,
                            width: `${Math.max(pct, t.count ? 3 : 0)}%`,
                          }}
                        />
                      </span>
                      <span style={styles.typeBarValue}>{t.count.toLocaleString()}</span>
                      <span style={styles.typeBarPct}>{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* 챗봇 funnel */}
          <Panel
            title="챗봇 funnel"
            caption="질문 수신 → 감정 확정"
            help={
              funnel && funnel.questions === 0 && funnel.confirmations > 0
                ? '⚠️ 질문 0인데 확정 있음 = 카카오 webhook 이 우리 백엔드로 안 들어오는 상태. webhook URL 확인 필요.'
                : '카카오 챗봇에 들어온 질문 중 사용자가 감정으로 확정해 원석으로 만든 비율.'
            }
            span={2}
          >
            {funnel ? (
              <div style={styles.funnelBlock}>
                <FunnelRow label="질문 수신" value={funnel.questions} color="#A0BCA8" max={Math.max(funnel.questions, funnel.confirmations, 1)} />
                <FunnelRow
                  label="감정 확정"
                  value={funnel.confirmations}
                  color="#1E3328"
                  max={Math.max(funnel.questions, funnel.confirmations, 1)}
                  hint={funnel.questions > 0 ? `확정률 ${Math.round(funnel.confirmRate * 100)}%` : 'n/a'}
                />
              </div>
            ) : (
              <p style={styles.empty}>데이터 없음</p>
            )}
          </Panel>

          {/* 페이지 표 */}
          <Panel
            title="페이지별 사용"
            caption="PV · 고유 사용자 · 평균 체류"
            help="어느 페이지가 인기인지, 사용자가 거기서 얼마나 머무는지. avg dwell 이 0초면 → 그 페이지를 사실상 거치기만 함."
            span={3}
          >
            {pages.length === 0 ? (
              <p style={styles.empty}>아직 페이지뷰가 없어요. 사용자가 사이트 한 번 들어오면 채워집니다.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>경로</Th>
                    <Th align="right">조회수</Th>
                    <Th align="right">고유 사용자</Th>
                    <Th align="right">평균 체류</Th>
                  </tr>
                </thead>
                <tbody>
                  {pages.slice(0, 25).map((p) => (
                    <tr key={p.path}>
                      <Td><code>{p.path}</code></Td>
                      <Td align="right">{p.views.toLocaleString()}</Td>
                      <Td align="right">{p.uniq.toLocaleString()}</Td>
                      <Td align="right">{(p.avgDwellMs / 1000).toFixed(1)}초</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 사용자 랭킹 */}
          <Panel
            title="활동 Top 사용자"
            caption="익명 stitching 포함"
            help="이벤트를 가장 많이 발생시킨 사용자. 세션 수가 0이면 → 옛날 서버측 이벤트(sessionId 없음). 새 SDK가 발사한 이벤트는 sessions 카운트 됨."
            span={3}
          >
            {users.length === 0 ? (
              <p style={styles.empty}>—</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>닉네임</Th>
                    <Th align="right">이벤트</Th>
                    <Th align="right">세션</Th>
                    <Th>마지막 접속</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 25).map((u) => (
                    <tr key={u.userId}>
                      <Td>{u.nickname}</Td>
                      <Td align="right">{u.eventCount.toLocaleString()}</Td>
                      <Td align="right">{u.sessionCount.toLocaleString()}</Td>
                      <Td>{formatTime(u.lastSeen)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 에러 */}
          <Panel
            title="에러 Top"
            caption="client / api"
            help="error.client = React/JS 런타임 에러, error.api = 백엔드 4xx/5xx 응답. 빈 상태면 좋은 거."
            span={3}
          >
            {errors.length === 0 ? (
              <p style={{ ...styles.empty, color: '#3D6050' }}>✓ 에러 없음</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>종류</Th>
                    <Th>메시지</Th>
                    <Th align="right">횟수</Th>
                    <Th>마지막</Th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={`${e.eventType}-${i}`}>
                      <Td>{e.eventType}</Td>
                      <Td>{e.message}</Td>
                      <Td align="right">{e.count.toLocaleString()}</Td>
                      <Td>{formatTime(e.lastSeen)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 최근 이벤트 스트림 */}
          <Panel
            title="실시간 이벤트 스트림"
            caption={`최신 ${recent.length}건 · 라이브 모드면 새 이벤트 즉시 prepend`}
            help="시간순으로 흐르는 raw 이벤트. 디버깅·실시간 모니터링용. 사용자 ID 가 anon 이면 로그인 전 상태."
            span={6}
          >
            <div style={styles.streamList}>
              {recent.length === 0 ? (
                <p style={styles.empty}>—</p>
              ) : (
                recent.map((ev, i) => (
                  <div key={`${ev.occurredAt}-${i}`} style={styles.streamRow}>
                    <span style={styles.streamTime}>{formatTime(ev.occurredAt)}</span>
                    <span style={styles.streamType}>{ev.eventType}</span>
                    <span style={styles.streamUser}>
                      {ev.userId ? ev.userId.slice(0, 8) : 'anon'}
                    </span>
                    <span style={styles.streamProps}>
                      {ev.props ? JSON.stringify(ev.props) : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </section>

        <footer style={styles.footer}>
          <span>이벤트 카탈로그: page.view · page.dwell · click · perf.web_vitals · error.client · error.api · chatbot.question.sent · record_emotion_confirmed</span>
        </footer>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: string;
}) {
  return (
    <div style={styles.kpiCard}>
      <span style={styles.kpiLabel}>{label}</span>
      <strong style={{ ...styles.kpiValue, color: accent ?? '#1E3328' }}>
        {value.toLocaleString()}
      </strong>
      <span style={styles.kpiHint}>{hint}</span>
    </div>
  );
}

function Panel({
  title,
  caption,
  help,
  children,
  span,
}: {
  title: string;
  caption?: string;
  help?: string;
  children: React.ReactNode;
  span?: 2 | 3 | 6;
}) {
  return (
    <section style={{ ...styles.panel, gridColumn: span ? `span ${span}` : undefined }}>
      <header style={styles.panelHeader}>
        <div style={styles.panelHeaderText}>
          <h2 style={styles.panelTitle}>{title}</h2>
          {caption && <span style={styles.panelCaption}>{caption}</span>}
        </div>
      </header>
      {help && <p style={styles.panelHelp}>{help}</p>}
      {children}
    </section>
  );
}

function FunnelRow({
  label,
  value,
  color,
  max,
  hint,
}: {
  label: string;
  value: number;
  color: string;
  max: number;
  hint?: string;
}) {
  const pct = Math.max((value / max) * 100, value > 0 ? 6 : 2);
  return (
    <div style={styles.funnelRow}>
      <span style={styles.funnelLabel}>{label}</span>
      <div style={styles.funnelTrack}>
        <div style={{ ...styles.funnelFill, width: `${pct}%`, background: color }}>
          <span style={styles.funnelValue}>{value.toLocaleString()}</span>
        </div>
      </div>
      {hint && <span style={styles.funnelHint}>{hint}</span>}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <th style={{ ...styles.th, textAlign: align ?? 'left' }}>{children}</th>;
}
function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <td style={{ ...styles.td, textAlign: align ?? 'left' }}>{children}</td>;
}

const styles: Record<string, CSSProperties> = {
  viewport: {
    minHeight: '100vh',
    width: '100%',
    background: '#F4EDDF',
    color: '#5A4A32',
    overflowY: 'auto',
  },
  container: {
    maxWidth: 1480,
    margin: '0 auto',
    padding: '32px 40px 80px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  kicker: { margin: 0, color: '#8B7355', fontSize: 12, fontWeight: 700, letterSpacing: 0.4 },
  title: { margin: '4px 0 4px', fontSize: 28, fontWeight: 900, color: '#1E3328' },
  subtitle: { margin: 0, color: '#5A4A32', fontSize: 13, fontWeight: 500, maxWidth: 720 },
  controlsCol: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
  controls: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  rangeBtn: {
    height: 32,
    padding: '0 14px',
    borderRadius: 999,
    border: '1px solid #E0D3BA',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  autoLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    color: '#5A4A32',
    padding: '0 8px',
  },
  refreshBtn: {
    height: 32,
    padding: '0 14px',
    borderRadius: 999,
    border: '1px solid #1E3328',
    background: '#1E3328',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  lastRefreshed: { fontSize: 11, color: '#8B7355', fontWeight: 700 },

  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  kpiCard: {
    background: '#FFFFFF',
    borderRadius: 14,
    padding: '14px 16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  kpiLabel: { fontSize: 11, fontWeight: 800, color: '#8B7355' },
  kpiValue: { fontSize: 30, fontWeight: 900, lineHeight: 1.1 },
  kpiHint: { fontSize: 10.5, color: '#8B7355', lineHeight: 1.35, fontWeight: 600, marginTop: 2 },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: 14,
  },
  panel: {
    background: '#FFFFFF',
    borderRadius: 14,
    padding: '16px 18px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    minWidth: 0,
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  panelHeaderText: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    flexWrap: 'wrap',
  },
  panelTitle: { margin: 0, fontSize: 14, fontWeight: 900, color: '#1E3328' },
  panelCaption: { fontSize: 11, fontWeight: 700, color: '#8B7355' },
  panelHelp: {
    margin: 0,
    padding: '6px 10px',
    background: '#F9F4EA',
    borderRadius: 8,
    fontSize: 11.5,
    color: '#5A4A32',
    lineHeight: 1.45,
    fontWeight: 600,
  },
  empty: { margin: 0, fontSize: 12, color: '#8B7355', fontWeight: 700 },

  funnelBlock: { display: 'flex', flexDirection: 'column', gap: 10 },
  funnelRow: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr 90px',
    alignItems: 'center',
    gap: 10,
  },
  funnelLabel: { fontSize: 12, fontWeight: 800, color: '#5A4A32' },
  funnelTrack: {
    height: 30,
    borderRadius: 8,
    background: '#F2EAD6',
    overflow: 'hidden',
    position: 'relative',
  },
  funnelFill: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 10,
    transition: 'width 280ms ease',
  },
  funnelValue: { color: '#FFFFFF', fontWeight: 900, fontSize: 12 },
  funnelHint: { fontSize: 11, fontWeight: 800, color: '#8B7355' },

  typeBarList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  typeBarRow: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr 70px 45px',
    alignItems: 'center',
    gap: 8,
    fontSize: 11.5,
  },
  typeBarName: {
    color: '#1E3328',
    fontWeight: 800,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  typeBarTrack: { height: 14, background: '#F2EAD6', borderRadius: 999, overflow: 'hidden' },
  typeBarFill: { display: 'block', height: '100%', background: '#A0BCA8', borderRadius: 999 },
  typeBarValue: { color: '#5A4A32', fontWeight: 800, textAlign: 'right' },
  typeBarPct: { color: '#8B7355', fontWeight: 700, textAlign: 'right' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '6px 8px',
    color: '#8B7355',
    fontWeight: 800,
    borderBottom: '1px solid #E0D3BA',
    fontSize: 11,
  },
  td: {
    padding: '7px 8px',
    color: '#5A4A32',
    fontWeight: 600,
    borderBottom: '1px solid #F2EAD6',
    fontSize: 12,
    wordBreak: 'break-word',
  },

  streamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    maxHeight: 460,
    overflow: 'auto',
    background: '#FBF7EE',
    borderRadius: 10,
    padding: '6px 8px',
  },
  streamRow: {
    display: 'grid',
    gridTemplateColumns: '90px 220px 100px 1fr',
    gap: 10,
    fontSize: 11.5,
    color: '#5A4A32',
    borderBottom: '1px dashed #E8DFC9',
    padding: '5px 0',
    alignItems: 'baseline',
  },
  streamTime: { color: '#8B7355', fontWeight: 800 },
  streamType: { color: '#1E3328', fontWeight: 800 },
  streamUser: { color: '#8B7355', fontFamily: 'monospace', fontSize: 11 },
  streamProps: {
    color: '#5A4A32',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
    fontSize: 11,
  },

  footer: {
    marginTop: 4,
    fontSize: 11,
    color: '#8B7355',
    fontWeight: 600,
    lineHeight: 1.5,
  },
};
