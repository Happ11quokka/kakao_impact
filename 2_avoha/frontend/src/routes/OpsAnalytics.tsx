// === OpsAnalytics — 운영자 전용 사용자 행동 분석 대시보드 ===
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Bar,
  BarChart,
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
      // 비밀번호가 만료/변경된 상태 → 입력 화면으로 돌려보내기.
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
      get<{ events: EventRow[] }>(`/ops/analytics/events?range=${range}&limit=50`),
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
  }, [range]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [autoRefresh, reload]);

  // 실시간 SSE: 새 이벤트가 들어오면 스트림 prepend + KPI 카운터 즉시 증가.
  useEffect(() => {
    if (!autoRefresh) return;
    const close = openAnalyticsStream((ev: StreamEvent) => {
      if (!ev.eventType) return; // hello/ping 같은 메타는 무시
      setRecent((prev) => [
        {
          eventType: ev.eventType ?? 'unknown',
          userId: ev.userId ?? null,
          props: ev.props ?? null,
          occurredAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 50));
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

  return (
    <div style={styles.screen}>
      <header style={styles.header}>
        <div>
          <p style={styles.kicker}>운영자 · 사용자 행동 분석</p>
          <h1 style={styles.title}>대시보드</h1>
        </div>
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
              {r}
            </button>
          ))}
          <label style={styles.autoLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(ev) => setAutoRefresh(ev.target.checked)}
            />
            라이브
          </label>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            data-track="ops.refresh"
            style={styles.refreshBtn}
          >
            {loading ? '…' : '새로고침'}
          </button>
        </div>
      </header>

      {/* KPI 카드 */}
      <section style={styles.kpiRow}>
        <KpiCard label="오늘 DAU" value={summary?.dau ?? 0} />
        <KpiCard label="오늘 이벤트" value={summary?.totalEvents ?? 0} />
        <KpiCard label="오늘 챗봇 질문" value={summary?.totalQuestions ?? 0} />
        <KpiCard label="오늘 에러" value={summary?.totalErrors ?? 0} accent="#B23A3A" />
        <KpiCard label="활성 세션 (30m)" value={summary?.activeSessions ?? 0} />
      </section>

      <section style={styles.grid}>
        {/* 시간대별 이벤트 추이 */}
        <Panel title="이벤트 추이" caption={range === '24h' ? '시간대별' : '일자별'}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={bucketChartData}>
                <CartesianGrid stroke="#E0D3BA" strokeDasharray="3 3" />
                <XAxis dataKey="x" stroke="#8B7355" fontSize={10} />
                <YAxis stroke="#8B7355" fontSize={10} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#1E3328" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* 이벤트 타입 분포 */}
        <Panel title="이벤트 타입 분포" caption={`${types.length}종`}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={types.slice(0, 10)} layout="vertical">
                <CartesianGrid stroke="#E0D3BA" strokeDasharray="3 3" />
                <XAxis type="number" stroke="#8B7355" fontSize={10} allowDecimals={false} />
                <YAxis type="category" dataKey="type" stroke="#8B7355" fontSize={10} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#A0BCA8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* 챗봇 funnel */}
        <Panel title="챗봇 funnel" caption="질문 → 감정 확정">
          {funnel ? (
            <div style={styles.funnelBlock}>
              <FunnelRow label="질문 수신" value={funnel.questions} color="#A0BCA8" />
              <FunnelRow
                label="감정 확정"
                value={funnel.confirmations}
                color="#1E3328"
                hint={`확정률 ${Math.round(funnel.confirmRate * 100)}%`}
              />
            </div>
          ) : (
            <p style={styles.empty}>데이터 없음</p>
          )}
        </Panel>

        {/* 페이지 표 */}
        <Panel title="페이지별 사용" caption="PV · 고유 · 평균 체류">
          {pages.length === 0 ? (
            <p style={styles.empty}>아직 페이지뷰 없음</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th>path</Th>
                  <Th align="right">PV</Th>
                  <Th align="right">uniq</Th>
                  <Th align="right">avg dwell</Th>
                </tr>
              </thead>
              <tbody>
                {pages.slice(0, 20).map((p) => (
                  <tr key={p.path}>
                    <Td>{p.path}</Td>
                    <Td align="right">{p.views}</Td>
                    <Td align="right">{p.uniq}</Td>
                    <Td align="right">{(p.avgDwellMs / 1000).toFixed(1)}s</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* 사용자 랭킹 */}
        <Panel title="활동 Top 사용자" caption="익명도 stitching 포함">
          {users.length === 0 ? (
            <p style={styles.empty}>—</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th>nickname</Th>
                  <Th align="right">events</Th>
                  <Th align="right">sessions</Th>
                  <Th>last seen</Th>
                </tr>
              </thead>
              <tbody>
                {users.slice(0, 20).map((u) => (
                  <tr key={u.userId}>
                    <Td>{u.nickname}</Td>
                    <Td align="right">{u.eventCount}</Td>
                    <Td align="right">{u.sessionCount}</Td>
                    <Td>{formatTime(u.lastSeen)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* 에러 */}
        <Panel title="에러 Top" caption="client / api">
          {errors.length === 0 ? (
            <p style={styles.empty}>에러 없음</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th>type</Th>
                  <Th>message</Th>
                  <Th align="right">count</Th>
                  <Th>last</Th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={`${e.eventType}-${i}`}>
                    <Td>{e.eventType}</Td>
                    <Td>{e.message}</Td>
                    <Td align="right">{e.count}</Td>
                    <Td>{formatTime(e.lastSeen)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* 최근 이벤트 스트림 */}
        <Panel title="최근 이벤트" caption={`최신 ${recent.length}건`} wide>
          <div style={styles.streamList}>
            {recent.length === 0 ? (
              <p style={styles.empty}>—</p>
            ) : (
              recent.map((ev, i) => (
                <div key={`${ev.occurredAt}-${i}`} style={styles.streamRow}>
                  <span style={styles.streamTime}>{formatTime(ev.occurredAt)}</span>
                  <span style={styles.streamType}>{ev.eventType}</span>
                  <span style={styles.streamUser}>{ev.userId ? ev.userId.slice(0, 8) : 'anon'}</span>
                  <span style={styles.streamProps}>{JSON.stringify(ev.props ?? {}).slice(0, 120)}</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={styles.kpiCard}>
      <span style={styles.kpiLabel}>{label}</span>
      <strong style={{ ...styles.kpiValue, color: accent ?? '#1E3328' }}>{value.toLocaleString()}</strong>
    </div>
  );
}

function Panel({
  title,
  caption,
  children,
  wide,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section style={{ ...styles.panel, gridColumn: wide ? '1 / -1' : undefined }}>
      <header style={styles.panelHeader}>
        <h2 style={styles.panelTitle}>{title}</h2>
        {caption && <span style={styles.panelCaption}>{caption}</span>}
      </header>
      {children}
    </section>
  );
}

function FunnelRow({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number;
  color: string;
  hint?: string;
}) {
  return (
    <div style={styles.funnelRow}>
      <span style={styles.funnelLabel}>{label}</span>
      <div style={{ ...styles.funnelBar, background: color, flex: Math.max(value, 1) }}>
        <span style={styles.funnelValue}>{value}</span>
      </div>
      {hint && <span style={styles.funnelHint}>{hint}</span>}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{ ...styles.th, textAlign: align ?? 'left' }}>{children}</th>
  );
}
function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td style={{ ...styles.td, textAlign: align ?? 'left' }}>{children}</td>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    background: '#F4EDDF',
    color: '#5A4A32',
    padding: '20px 16px 80px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  kicker: { margin: 0, color: '#8B7355', fontSize: 11, fontWeight: 700 },
  title: { margin: '2px 0 0', fontSize: 22, fontWeight: 900, color: '#1E3328' },
  controls: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  rangeBtn: {
    height: 30,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid #E0D3BA',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  autoLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 700,
    color: '#5A4A32',
  },
  refreshBtn: {
    height: 30,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid #1E3328',
    background: '#1E3328',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 8,
  },
  kpiCard: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  kpiLabel: { fontSize: 10, fontWeight: 800, color: '#8B7355' },
  kpiValue: { fontSize: 22, fontWeight: 900, lineHeight: 1 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 10,
  },
  panel: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: '12px 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  panelTitle: { margin: 0, fontSize: 13, fontWeight: 900, color: '#1E3328' },
  panelCaption: { fontSize: 10, fontWeight: 700, color: '#8B7355' },
  empty: { margin: 0, fontSize: 12, color: '#8B7355', fontWeight: 700 },
  funnelBlock: { display: 'flex', flexDirection: 'column', gap: 8 },
  funnelRow: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 },
  funnelLabel: { fontSize: 11, fontWeight: 800, color: '#5A4A32', width: 80 },
  funnelBar: {
    height: 24,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 8,
    color: '#FFFFFF',
    fontWeight: 800,
    fontSize: 11,
  },
  funnelValue: { color: '#FFFFFF', fontWeight: 900, fontSize: 11 },
  funnelHint: { fontSize: 10, fontWeight: 800, color: '#8B7355' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    padding: '4px 6px',
    color: '#8B7355',
    fontWeight: 800,
    borderBottom: '1px solid #E0D3BA',
    fontSize: 10,
  },
  td: {
    padding: '5px 6px',
    color: '#5A4A32',
    fontWeight: 600,
    borderBottom: '1px solid #F2EAD6',
    fontSize: 11,
    wordBreak: 'break-word',
  },
  streamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    maxHeight: 320,
    overflow: 'auto',
  },
  streamRow: {
    display: 'grid',
    gridTemplateColumns: '70px 180px 90px 1fr',
    gap: 8,
    fontSize: 11,
    color: '#5A4A32',
    borderBottom: '1px solid #F2EAD6',
    padding: '3px 0',
  },
  streamTime: { color: '#8B7355', fontWeight: 800 },
  streamType: { color: '#1E3328', fontWeight: 800 },
  streamUser: { color: '#8B7355', fontFamily: 'monospace' },
  streamProps: { color: '#5A4A32', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
