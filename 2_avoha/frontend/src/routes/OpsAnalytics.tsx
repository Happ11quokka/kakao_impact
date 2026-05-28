// === OpsAnalytics — 운영자 전용 사용자 행동 분석 대시보드 (데스크탑) ===
// phone-frame 밖, full viewport. 각 패널마다 "무엇을 보는가 / 어떻게 읽는가" 캡션.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { humanizeEvent } from '../lib/event-humanize';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

// 페이지 경로 → 한글 라벨 매핑 (비전공자도 한 눈에). BottomNav 정의와 동기화.
const PATH_LABELS: Record<string, string> = {
  '/': '홈',
  '/calendar': '캘린더',
  '/analysis': '감정분석',
  '/settings': '설정',
  '/login': '로그인',
  '/login/callback': '로그인 콜백',
  '/ops/analytics': '운영자 대시보드',
};
function labelForPath(p: string | null | undefined): string {
  if (!p) return '(unknown)';
  const ko = PATH_LABELS[p];
  return ko ? `${ko} (${p})` : p;
}
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

type Range = '24h' | '7d' | '30d';

type Summary = {
  totalEvents: number;
  totalQuestions: number;
  totalErrors: number;
  dau: number;
  activeSessions: number;
  date?: string;
};
type ActiveUsersDay = { date: string; dau: number };
type ActiveUsers = {
  daily: ActiveUsersDay[];
  wau: number;
  mau: number;
  days: number;
};
type Page = { path: string; views: number; uniq: number; avgDwellMs: number; avgScrollPct: number };
type DeviceRow = { device: string; uniq: number; views: number; pct: number };
type NewVsReturning = {
  new: number;
  returning: number;
  newPct: number;
  returningPct: number;
};
type WebVitalRow = {
  metric: string;
  p75: number;
  samples: number;
  rating: 'good' | 'needs' | 'poor' | 'unknown';
};
type Funnel = {
  inbound: number;
  classified: number;
  confirmed: number;
  classifyRate: number;
  confirmRate: number;
  overallRate: number;
};
type FlowEdge = { from: string; to: string; count: number };
type FlowEndpoint = { path: string; sessions: number };
type FlowSequence = { sequence: string; steps: number; sessions: number };
type EmotionItem = {
  code: string;
  nameKo: string;
  hexColor: string;
  count: number;
  pct: number;
};
type EmotionBucket = {
  hour?: number;
  dow?: number;
  code: string;
  nameKo: string;
  hexColor: string;
  count: number;
};
type EmotionByUser = {
  userId: string;
  nickname: string;
  topEmotionCode: string;
  topEmotionLabel: string;
  topEmotionColor: string;
  topEmotionCount: number;
  totalGems: number;
};
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
// ── Chatbot 상세 통계 (ai/chatbot/ 서비스 직접 연동) ──
type ChatbotSummary = {
  inbound: number;
  outbound: number;
  pairedTraces: number;
  avgResponseMs: number;
  p95ResponseMs: number;
};
type ChatbotHourly = { hour: string; inbound: number; outbound: number };
type ChatbotLlmStat = {
  callType: string;
  model: string;
  calls: number;
  ok: number;
  failed: number;
  successRate: number;
  avgMs: number;
  p95Ms: number;
};
type ChatbotErrSrc = { source: string; count: number; lastSeen: string | null };
type ChatbotErrRow = {
  id: number;
  source: string;
  message: string | null;
  userId: string | null;
  traceId: string | null;
  occurredAt: string | null;
};
type ChatbotGem = { gem: string; count: number };
type ChatbotUser = {
  providerUserKey: string;
  nickname: string;
  records: number;
  withPhoto: number;
  lastAt: string | null;
};
// ── 개인별 활동 추적 (드릴다운) ──
type UserDirItem = {
  userId: string;
  nickname: string;
  kakaoId: string;
  joinedAt: string | null;
  eventCount: number;
  lastSeen: string | null;
};
type UserProfile = {
  profile: {
    userId: string;
    nickname: string;
    kakaoId: string;
    joinedAt: string | null;
    profileUrl: string | null;
    lastSeen: string | null;
  };
  summary: {
    totalEvents: number;
    sessionCount: number;
    gemCount: number;
    chatbotRecordCount: number;
  };
  eventTypes: { type: string; count: number }[];
  emotions: { code: string; nameKo: string; hexColor: string; count: number; pct: number }[];
  timeline: { eventType: string; props: Record<string, unknown> | null; occurredAt: string | null }[];
  chatbotRecords: {
    gem: string;
    recordText: string | null;
    hasPhoto: boolean;
    confirmedEmotionCode: string | null;
    createdAt: string | null;
  }[];
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
  const [activeUsers, setActiveUsers] = useState<ActiveUsers | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [recent, setRecent] = useState<EventRow[]>([]);
  // chatbot
  const [cbSummary, setCbSummary] = useState<ChatbotSummary | null>(null);
  const [cbHourly, setCbHourly] = useState<ChatbotHourly[]>([]);
  const [cbLlm, setCbLlm] = useState<ChatbotLlmStat[]>([]);
  const [cbErrSrc, setCbErrSrc] = useState<ChatbotErrSrc[]>([]);
  const [cbErrRecent, setCbErrRecent] = useState<ChatbotErrRow[]>([]);
  const [cbGems, setCbGems] = useState<ChatbotGem[]>([]);
  const [cbUsers, setCbUsers] = useState<ChatbotUser[]>([]);
  // flow + emotions (Phase 2)
  const [flowEntry, setFlowEntry] = useState<FlowEndpoint[]>([]);
  const [flowExit, setFlowExit] = useState<FlowEndpoint[]>([]);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([]);
  const [flowSeq, setFlowSeq] = useState<FlowSequence[]>([]);
  const [emoDist, setEmoDist] = useState<EmotionItem[]>([]);
  const [emoByHour, setEmoByHour] = useState<EmotionBucket[]>([]);
  const [emoByDow, setEmoByDow] = useState<EmotionBucket[]>([]);
  const [emoByUser, setEmoByUser] = useState<EmotionByUser[]>([]);
  // 신규 시각화 4개
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [newRet, setNewRet] = useState<NewVsReturning | null>(null);
  const [webVitals, setWebVitals] = useState<WebVitalRow[]>([]);
  // 개인별 활동 추적 (드릴다운)
  const [userDir, setUserDir] = useState<UserDirItem[]>([]);
  const [userFilter, setUserFilter] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  // 드로어 기간은 대시보드 상단 기간과 분리 — 한 명 추적은 기본 30일로 본다.
  const [drawerRange, setDrawerRange] = useState<Range>('30d');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setLoading(true);
    const [s, au, p, f, t, b, u, e, r,
      cs, ch, cl, ce, cg, cu,
      fEntry, fExit, fEdges, fSeq,
      emD, emH, emW, emU,
      dv, nr, wv,
    ] = await Promise.all([
      get<Summary>('/ops/analytics/summary'),
      get<ActiveUsers>('/ops/analytics/active-users?days=30'),
      get<{ pages: Page[] }>(`/ops/analytics/pages?range=${range}`),
      get<Funnel>(`/ops/analytics/funnels/chatbot?range=${range}`),
      get<{ types: TypeRow[] }>(`/ops/analytics/event-types?range=${range}`),
      get<{ buckets: Bucket[] }>(`/ops/analytics/timeseries?range=${range}`),
      get<{ users: UserRow[] }>(`/ops/analytics/users?range=${range}`),
      get<{ errors: ErrorRow[] }>(`/ops/analytics/errors?range=${range}`),
      get<{ events: EventRow[] }>(`/ops/analytics/events?range=${range}&limit=80`),
      // chatbot endpoints
      get<ChatbotSummary>(`/ops/analytics/chatbot/summary?range=${range}`),
      get<{ buckets: ChatbotHourly[] }>(`/ops/analytics/chatbot/hourly?range=${range}`),
      get<{ stats: ChatbotLlmStat[] }>(`/ops/analytics/chatbot/llm?range=${range}`),
      get<{ bySource: ChatbotErrSrc[]; recent: ChatbotErrRow[] }>(`/ops/analytics/chatbot/errors?range=${range}`),
      get<{ gems: ChatbotGem[] }>(`/ops/analytics/chatbot/gems?range=${range}`),
      get<{ users: ChatbotUser[] }>(`/ops/analytics/chatbot/users?range=${range}`),
      // flow
      get<{ pages: FlowEndpoint[] }>(`/ops/analytics/flow/entry?range=${range}`),
      get<{ pages: FlowEndpoint[] }>(`/ops/analytics/flow/exit?range=${range}`),
      get<{ transitions: FlowEdge[] }>(`/ops/analytics/flow/transitions?range=${range}`),
      get<{ sequences: FlowSequence[] }>(`/ops/analytics/flow/sequences?range=${range}`),
      // emotions
      get<{ items: EmotionItem[] }>(`/ops/analytics/emotions/distribution?range=${range}`),
      get<{ items: EmotionBucket[] }>(`/ops/analytics/emotions/by-hour?range=${range}`),
      get<{ items: EmotionBucket[] }>(`/ops/analytics/emotions/by-dow?range=${range}`),
      get<{ users: EmotionByUser[] }>(`/ops/analytics/emotions/by-user?range=${range}`),
      // 신규 4개
      get<{ items: DeviceRow[] }>(`/ops/analytics/devices?range=${range}`),
      get<NewVsReturning>(`/ops/analytics/new-vs-returning?range=${range}`),
      get<{ items: WebVitalRow[] }>(`/ops/analytics/web-vitals?range=${range}`),
    ]);
    if (s) setSummary(s);
    if (au) setActiveUsers(au);
    setPages(p?.pages ?? []);
    if (f) setFunnel(f);
    setTypes(t?.types ?? []);
    setBuckets(b?.buckets ?? []);
    setUsers(u?.users ?? []);
    setErrors(e?.errors ?? []);
    setRecent(r?.events ?? []);
    if (cs) setCbSummary(cs);
    setCbHourly(ch?.buckets ?? []);
    setCbLlm(cl?.stats ?? []);
    setCbErrSrc(ce?.bySource ?? []);
    setCbErrRecent(ce?.recent ?? []);
    setCbGems(cg?.gems ?? []);
    setCbUsers(cu?.users ?? []);
    setFlowEntry(fEntry?.pages ?? []);
    setFlowExit(fExit?.pages ?? []);
    setFlowEdges(fEdges?.transitions ?? []);
    setFlowSeq(fSeq?.sequences ?? []);
    setEmoDist(emD?.items ?? []);
    setEmoByHour(emH?.items ?? []);
    setEmoByDow(emW?.items ?? []);
    setEmoByUser(emU?.users ?? []);
    setDevices(dv?.items ?? []);
    if (nr) setNewRet(nr);
    setWebVitals(wv?.items ?? []);
    setLoading(false);
    setLastRefreshed(new Date());
  }, [range]);
  refreshRef.current = reload;

  useEffect(() => {
    void reload();
  }, [reload]);

  // 사용자 디렉터리는 전 기간 기준 → 마운트 시 1회만 fetch (range 비의존).
  useEffect(() => {
    void (async () => {
      const d = await get<{ users: UserDirItem[] }>('/ops/analytics/user-list');
      if (d) setUserDir(d.users);
    })();
  }, []);

  // 드로어: 선택된 사용자/기간이 바뀌면 그 사람의 프로필을 fetch.
  useEffect(() => {
    if (!selectedUserId) {
      setUserProfile(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    void (async () => {
      const p = await get<UserProfile>(`/ops/analytics/user/${selectedUserId}?range=${drawerRange}`);
      if (!cancelled) {
        setUserProfile(p);
        setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, drawerRange]);

  // 사용자 선택 시 드로어를 열고 기간을 30일로 리셋 (대시보드 기간과 무관하게 의미 있는 기록부터).
  const openUser = useCallback((id: string) => {
    setDrawerRange('30d');
    setSelectedUserId(id);
  }, []);

  const filteredUserDir = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return userDir;
    return userDir.filter(
      (u) => (u.nickname ?? '').toLowerCase().includes(q) || (u.kakaoId ?? '').includes(q),
    );
  }, [userDir, userFilter]);

  // theme.css 가 전역 overflow:hidden + height:100dvh 라 페이지 스크롤 불가.
  // 두 가지 동시 적용 (어느 한 쪽 실패해도 다른 쪽이 보장):
  //  1) body classList → CSS !important 규칙 (모던 브라우저)
  //  2) html/body/#root 에 inline style 직접 (CSS :has 미지원 인앱 브라우저 대비)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow,
      rootHeight: root?.style.height,
    };
    body.classList.add('ops-analytics-fullscreen');
    html.style.setProperty('overflow', 'auto', 'important');
    html.style.setProperty('height', 'auto', 'important');
    body.style.setProperty('overflow', 'auto', 'important');
    body.style.setProperty('height', 'auto', 'important');
    if (root) {
      root.style.setProperty('overflow', 'visible', 'important');
      root.style.setProperty('height', 'auto', 'important');
    }
    return () => {
      body.classList.remove('ops-analytics-fullscreen');
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      if (root) {
        root.style.overflow = prev.rootOverflow ?? '';
        root.style.height = prev.rootHeight ?? '';
      }
    };
  }, []);

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

  const cbBucketChartData = useMemo(
    () => cbHourly.map((b) => ({
      x: formatBucketLabel(b.hour),
      inbound: b.inbound,
      outbound: b.outbound,
    })),
    [cbHourly, formatBucketLabel],
  );

  const cbTotalLlmCalls = cbLlm.reduce((acc, s) => acc + s.calls, 0);
  const cbAvgSuccessRate = cbTotalLlmCalls > 0
    ? cbLlm.reduce((acc, s) => acc + s.ok, 0) / cbTotalLlmCalls
    : 0;
  const cbTotalGems = cbGems.reduce((acc, g) => acc + g.count, 0) || 1;

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
            label="WAU (최근 7일)"
            value={activeUsers?.wau ?? 0}
            hint="오늘 포함 최근 7일 동안 한 번이라도 활동한 고유 사용자 (HLL union)"
            accent="#3D6050"
          />
          <KpiCard
            label="MAU (최근 30일)"
            value={activeUsers?.mau ?? 0}
            hint="오늘 포함 최근 30일 동안 한 번이라도 활동한 고유 사용자 (HLL union)"
            accent="#5A4A32"
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

        {/* DAU 변화 곡선 — 최근 30일 일별 trend (range 셀렉터와 무관, 항상 30일) */}
        <section style={styles.grid}>
          <Panel
            title="DAU 변화 곡선"
            caption="최근 30일 · 일별"
            help="매일 한 번이라도 활동한 고유 사용자 수의 변화. WAU/MAU 와 함께 보면 일별 들쭉날쭉 속에서도 주·월 단위 활성 사용자 규모 파악. (HyperLogLog 카운트라 ±오차 약 0.81%)"
            span={6}
          >
            <DauTrendChart data={activeUsers} />
          </Panel>
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

          {/* 챗봇 funnel — 3단계: 카카오 inbound → AI 분류 → 사용자 web 확정 */}
          <Panel
            title="챗봇 funnel"
            caption="질문 → 분류 → 확정"
            help="chatbot_messages(inbound) = 카카오에 들어온 질문. chatbot 테이블 row = AI 가 감정 분류 성공. confirmed_emotion_code = 사용자가 웹에서 확정. 각 단계 사이 conversion 비율."
            span={2}
          >
            {funnel ? (
              <div style={styles.funnelBlock}>
                {(() => {
                  const m = Math.max(funnel.inbound, funnel.classified, funnel.confirmed, 1);
                  return (
                    <>
                      <FunnelRow
                        label="질문 수신"
                        value={funnel.inbound}
                        color="#A0BCA8"
                        max={m}
                      />
                      <FunnelRow
                        label="AI 분류"
                        value={funnel.classified}
                        color="#7AA088"
                        max={m}
                        hint={funnel.inbound > 0 ? `분류율 ${Math.round(funnel.classifyRate * 100)}%` : '—'}
                      />
                      <FunnelRow
                        label="사용자 확정"
                        value={funnel.confirmed}
                        color="#1E3328"
                        max={m}
                        hint={funnel.classified > 0 ? `확정률 ${Math.round(funnel.confirmRate * 100)}%` : '—'}
                      />
                    </>
                  );
                })()}
              </div>
            ) : (
              <p style={styles.empty}>데이터 없음</p>
            )}
          </Panel>

          {/* 페이지 표 */}
          <Panel
            title="페이지별 사용"
            caption="PV · 고유 사용자 · 평균 체류 · 스크롤"
            help="어느 페이지가 인기인지, 사용자가 거기서 얼마나 머무는지 + 평균 스크롤 깊이. dwell 0초나 스크롤 0% 면 → 그 페이지를 사실상 거치기만 함."
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
                    <Th align="right">고유</Th>
                    <Th align="right">체류</Th>
                    <Th align="right">스크롤</Th>
                  </tr>
                </thead>
                <tbody>
                  {pages.slice(0, 25).map((p) => (
                    <tr key={p.path}>
                      <Td>{labelForPath(p.path)}</Td>
                      <Td align="right">{p.views.toLocaleString()}</Td>
                      <Td align="right">{p.uniq.toLocaleString()}</Td>
                      <Td align="right">{(p.avgDwellMs / 1000).toFixed(1)}초</Td>
                      <Td align="right">
                        <span style={styles.scrollCell}>
                          <span style={styles.scrollTrack}>
                            <span
                              style={{
                                ...styles.scrollFill,
                                width: `${Math.min(100, Math.max(0, p.avgScrollPct))}%`,
                              }}
                            />
                          </span>
                          <span style={styles.scrollVal}>
                            {Math.round(p.avgScrollPct)}%
                          </span>
                        </span>
                      </Td>
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
                    <tr
                      key={u.userId}
                      onClick={() => openUser(u.userId)}
                      style={{
                        ...styles.clickableRow,
                        ...(selectedUserId === u.userId ? styles.clickableRowActive : null),
                      }}
                    >
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

          {/* 전체 사용자 (드릴다운 진입점) */}
          <Panel
            title="전체 사용자"
            caption={`${userDir.length}명 · 행 클릭 → 상세`}
            help="등록된 모든 사용자(운영자 제외). 행을 클릭하면 오른쪽 패널에서 그 사람의 활동 타임라인·이벤트 유형·감정·챗봇 기록을 봅니다. 목록의 이벤트/마지막 접속은 전 기간 기준."
            span={6}
          >
            <input
              type="text"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="닉네임 또는 카카오ID 검색…"
              style={styles.userSearch}
            />
            {filteredUserDir.length === 0 ? (
              <p style={styles.empty}>{userDir.length === 0 ? '—' : '검색 결과 없음'}</p>
            ) : (
              <div style={styles.userDirList}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <Th>닉네임</Th>
                      <Th>카카오ID</Th>
                      <Th align="right">이벤트</Th>
                      <Th>마지막 접속</Th>
                      <Th>가입</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUserDir.map((u) => (
                      <tr
                        key={u.userId}
                        onClick={() => openUser(u.userId)}
                        style={{
                          ...styles.clickableRow,
                          ...(selectedUserId === u.userId ? styles.clickableRowActive : null),
                        }}
                      >
                        <Td>{u.nickname}</Td>
                        <Td>{u.kakaoId}</Td>
                        <Td align="right">{u.eventCount.toLocaleString()}</Td>
                        <Td>{formatTime(u.lastSeen)}</Td>
                        <Td>{formatTime(u.joinedAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                    <span
                      style={styles.streamProps}
                      title={ev.props ? JSON.stringify(ev.props) : ''}
                    >
                      {humanizeEvent(ev.eventType, ev.props)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </section>

        {/* ─── 👥 방문자 구성 + ⚡ 성능 ─── */}
        <section style={styles.sectionDivider}>
          <h2 style={styles.sectionDividerTitle}>👥 방문자 구성 · 성능</h2>
          <p style={styles.sectionDividerCaption}>
            어떤 디바이스로 접속하는지, 신규/재방문 비율, 그리고 Core Web Vitals 성능 지표. 사용자가 어떤 환경에서 서비스를 경험하는지.
          </p>
        </section>

        <section style={styles.grid}>
          <Panel
            title="디바이스 분포"
            caption="모바일 · 태블릿 · PC"
            help="page.view 의 deviceType 기준 고유 사용자 점유율. 모바일 비중이 높으면 → 모바일 UX 우선 투자."
            span={2}
          >
            <DeviceDonut items={devices} />
          </Panel>

          <Panel
            title="신규 vs 재방문"
            caption="anonId 첫 등장 기준"
            help={`기간(${rangeLabel}) 내 첫 page.view 가 발생한 사용자 = 신규. 이전부터 있던 사용자 = 재방문. 신규가 많을수록 → 마케팅 효과, 재방문이 많을수록 → 리텐션 양호.`}
            span={2}
          >
            <NewVsReturningBar data={newRet} />
          </Panel>

          <Panel
            title="Core Web Vitals"
            caption="p75 · Google 임계값 기준"
            help="LCP/FCP/INP/TTFB/CLS — Google 표준 웹 성능 지표. 신호등 색이 빨갛게 (poor) 떨어지면 → 그 페이지의 UX 가 느리거나 끊김."
            span={2}
          >
            <WebVitalsCards items={webVitals} />
          </Panel>
        </section>

        {/* ─── 🔀 사용자 플로우 섹션 ─── */}
        <section style={styles.sectionDivider}>
          <h2 style={styles.sectionDividerTitle}>🔀 사용자 플로우</h2>
          <p style={styles.sectionDividerCaption}>
            세션 단위로 어디서 들어와 → 어디로 이동 → 어디서 떠나는지. events.page.view 시퀀스를 sessionId 별로 묶어 추출.
          </p>
        </section>

        <section style={styles.grid}>
          <Panel
            title="진입 페이지 Top"
            caption="세션의 첫 화면"
            help="사용자가 처음 도착한 페이지. /login 이 많으면 로그인 직진, / 가 많으면 직접 홈 진입."
            span={3}
          >
            {flowEntry.length === 0 ? (
              <p style={styles.empty}>—</p>
            ) : (
              <ul style={styles.typeBarList}>
                {flowEntry.map((p) => {
                  const max = flowEntry[0]?.sessions || 1;
                  const pct = Math.round((p.sessions / max) * 100);
                  return (
                    <li key={p.path} style={styles.typeBarRow}>
                      <span style={styles.typeBarName} title={p.path}>{labelForPath(p.path)}</span>
                      <span style={styles.typeBarTrack}>
                        <span style={{ ...styles.typeBarFill, width: `${Math.max(pct, 3)}%`, background: '#A0BCA8' }} />
                      </span>
                      <span style={styles.typeBarValue}>{p.sessions.toLocaleString()}</span>
                      <span style={styles.typeBarPct}>세션</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="이탈 페이지 Top"
            caption="세션의 마지막 화면"
            help="사용자가 마지막으로 보고 떠난 페이지. 특정 페이지에서 이탈이 몰리면 → 그 페이지 UX 점검 필요."
            span={3}
          >
            {flowExit.length === 0 ? (
              <p style={styles.empty}>—</p>
            ) : (
              <ul style={styles.typeBarList}>
                {flowExit.map((p) => {
                  const max = flowExit[0]?.sessions || 1;
                  const pct = Math.round((p.sessions / max) * 100);
                  return (
                    <li key={p.path} style={styles.typeBarRow}>
                      <span style={styles.typeBarName} title={p.path}>{labelForPath(p.path)}</span>
                      <span style={styles.typeBarTrack}>
                        <span style={{ ...styles.typeBarFill, width: `${Math.max(pct, 3)}%`, background: '#B23A3A' }} />
                      </span>
                      <span style={styles.typeBarValue}>{p.sessions.toLocaleString()}</span>
                      <span style={styles.typeBarPct}>세션</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="페이지 이동 (from → to)"
            caption={`Top ${flowEdges.length}`}
            help="가장 빈번한 페이지 이동 페어. 예: 캘린더 → 감정분석 12회 = 사용자가 캘린더 보고 분석으로 자주 넘어간다."
            span={3}
          >
            {flowEdges.length === 0 ? (
              <p style={styles.empty}>—</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>from</Th>
                    <Th>→</Th>
                    <Th>to</Th>
                    <Th align="right">횟수</Th>
                  </tr>
                </thead>
                <tbody>
                  {flowEdges.slice(0, 25).map((e, i) => (
                    <tr key={`${e.from}-${e.to}-${i}`}>
                      <Td>{labelForPath(e.from)}</Td>
                      <Td><span style={{ color: '#8B7355' }}>→</span></Td>
                      <Td>{labelForPath(e.to)}</Td>
                      <Td align="right">{e.count.toLocaleString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel
            title="세션 경로 패턴 Top"
            caption="동일한 시퀀스를 묶어서"
            help="한 세션 내 페이지 방문 순서가 같은 그룹. 가장 많은 패턴 = 대표 사용자 여정."
            span={3}
          >
            {flowSeq.length === 0 ? (
              <p style={styles.empty}>2-12 step 짜리 세션이 아직 부족합니다.</p>
            ) : (
              <div style={styles.streamList}>
                {flowSeq.slice(0, 12).map((s, i) => (
                  <div key={i} style={styles.seqRow}>
                    <span style={styles.seqMeta}>
                      <strong>{s.sessions}</strong> 세션 · {s.steps}단계
                    </span>
                    <span style={styles.seqPath}>
                      {s.sequence
                        .split(' → ')
                        .map((p) => PATH_LABELS[p] ?? p)
                        .join(' → ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        {/* ─── 🎭 감정 기록 분석 섹션 ─── */}
        <section style={styles.sectionDivider}>
          <h2 style={styles.sectionDividerTitle}>🎭 감정 기록 분석</h2>
          <p style={styles.sectionDividerCaption}>
            아보하 도메인 핵심 데이터 — gems 테이블에 쌓인 모든 감정 기록을 emotions 표준 한글명·색상으로 풀어 분포·시간·요일·개인별로 분석.
          </p>
        </section>

        <section style={styles.grid}>
          <Panel
            title="전체 감정 분포"
            caption={`${emoDist.length}종 · 총 ${emoDist.reduce((a, x) => a + x.count, 0).toLocaleString()} 개`}
            help="기간 내 모든 사용자가 기록한 감정 원석(gems) 분포. emotions.hex_color 로 색칠."
            span={3}
          >
            {emoDist.length === 0 ? (
              <p style={styles.empty}>아직 감정 기록이 없어요.</p>
            ) : (
              <ul style={styles.typeBarList}>
                {emoDist.map((e) => (
                  <li key={e.code} style={styles.typeBarRow}>
                    <span style={styles.typeBarName} title={e.code}>
                      <span style={{
                        display: 'inline-block',
                        width: 10, height: 10, borderRadius: 999,
                        background: e.hexColor, marginRight: 6,
                        verticalAlign: 'middle',
                      }} />
                      {e.nameKo}
                    </span>
                    <span style={styles.typeBarTrack}>
                      <span style={{ ...styles.typeBarFill, width: `${Math.max(e.pct, 3)}%`, background: e.hexColor }} />
                    </span>
                    <span style={styles.typeBarValue}>{e.count.toLocaleString()}</span>
                    <span style={styles.typeBarPct}>{e.pct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="시간대(시)별 감정 분포"
            caption="KST 0-23시"
            help="언제 어떤 감정이 많이 기록되는지. 새벽=우울/불안 vs 저녁=기쁨/뿌듯 같은 패턴 추출."
            span={3}
          >
            <EmotionHeatmap items={emoByHour} axis="hour" />
          </Panel>

          <Panel
            title="요일별 감정 분포"
            caption="일~토"
            help="주말 vs 평일 감정 분포 차이. 월요일 우울증 / 금요일 기쁨 같은 일주일 리듬."
            span={3}
          >
            <EmotionHeatmap items={emoByDow} axis="dow" />
          </Panel>

          <Panel
            title="사용자별 Top 감정"
            caption={`상위 ${emoByUser.length}명`}
            help="각 사용자가 가장 많이 기록한 감정 1위 + 총 기록 수. 누가 어떤 감정 풍경을 가졌는지."
            span={3}
          >
            {emoByUser.length === 0 ? (
              <p style={styles.empty}>—</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>닉네임</Th>
                    <Th>Top 감정</Th>
                    <Th align="right">해당</Th>
                    <Th align="right">전체</Th>
                  </tr>
                </thead>
                <tbody>
                  {emoByUser.slice(0, 20).map((u) => (
                    <tr key={u.userId}>
                      <Td>{u.nickname}</Td>
                      <Td>
                        <span style={{
                          display: 'inline-block',
                          width: 10, height: 10, borderRadius: 999,
                          background: u.topEmotionColor, marginRight: 6,
                          verticalAlign: 'middle',
                        }} />
                        {u.topEmotionLabel}
                      </Td>
                      <Td align="right">{u.topEmotionCount}</Td>
                      <Td align="right">{u.totalGems}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </section>

        {/* ─── 챗봇 상세 섹션 (ai/chatbot/ 서비스 직접 연동) ─── */}
        <section style={styles.sectionDivider}>
          <h2 style={styles.sectionDividerTitle}>💬 챗봇 상세 (Yulog)</h2>
          <p style={styles.sectionDividerCaption}>
            카카오 webhook → chatbot 서비스 → LLM 호출 → 카카오 응답 흐름. backend 와 같은 Postgres 의 chatbot_* 테이블 직접 SELECT.
          </p>
        </section>

        <section style={styles.kpiRow}>
          <KpiCard
            label="질문 수신 (inbound)"
            value={cbSummary?.inbound ?? 0}
            hint="chatbot_messages WHERE direction='inbound' — 카카오에서 들어온 사용자 발화"
          />
          <KpiCard
            label="응답 송신 (outbound)"
            value={cbSummary?.outbound ?? 0}
            hint="chatbot_messages WHERE direction='outbound' — 사용자에게 보낸 봇 응답"
          />
          <KpiCard
            label="평균 응답시간"
            value={cbSummary ? Math.round(cbSummary.avgResponseMs) : 0}
            hint={`같은 trace 의 inbound→outbound 시차 ms. p95: ${cbSummary?.p95ResponseMs ?? 0}ms`}
          />
          <KpiCard
            label="LLM 호출 (total)"
            value={cbTotalLlmCalls}
            hint={`성공률 ${Math.round(cbAvgSuccessRate * 100)}% — chatbot_llm_calls`}
            accent={cbAvgSuccessRate < 0.9 ? '#B23A3A' : undefined}
          />
          <KpiCard
            label="에러 (chatbot_errors)"
            value={cbErrSrc.reduce((a, e) => a + e.count, 0)}
            hint="source 별 잡힌 예외 합계. 0 이면 좋음"
            accent={cbErrSrc.length > 0 ? '#B23A3A' : undefined}
          />
        </section>

        <section style={styles.grid}>
          {/* 챗봇 트래픽 추이 */}
          <Panel
            title="챗봇 트래픽 추이"
            caption={range === '24h' ? '시간대별' : '일자별'}
            help="inbound(질문) / outbound(응답) 시간대별. 두 라인이 비슷하게 따라가면 정상."
            span={3}
          >
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={cbBucketChartData} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="#E0D3BA" strokeDasharray="3 3" />
                  <XAxis dataKey="x" stroke="#8B7355" fontSize={11} />
                  <YAxis stroke="#8B7355" fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="inbound" stroke="#A0BCA8" strokeWidth={2.5} dot={false} name="질문" />
                  <Line type="monotone" dataKey="outbound" stroke="#1E3328" strokeWidth={2.5} dot={false} name="응답" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* LLM 호출 통계 */}
          <Panel
            title="LLM 호출 통계"
            caption={`${cbLlm.length}종 call_type`}
            help="call_type 별 호출 수·성공률·평균/p95 latency. 응답이 느리면 prompt 길이/모델 변경 검토."
            span={3}
          >
            {cbLlm.length === 0 ? (
              <p style={styles.empty}>아직 LLM 호출 없음</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>type</Th>
                    <Th>model</Th>
                    <Th align="right">호출</Th>
                    <Th align="right">성공률</Th>
                    <Th align="right">avg</Th>
                    <Th align="right">p95</Th>
                  </tr>
                </thead>
                <tbody>
                  {cbLlm.map((s, i) => (
                    <tr key={`${s.callType}-${s.model}-${i}`}>
                      <Td>{s.callType}</Td>
                      <Td><code style={{ fontSize: 10 }}>{s.model}</code></Td>
                      <Td align="right">{s.calls.toLocaleString()}</Td>
                      <Td align="right">
                        <span style={{ color: s.successRate < 0.9 ? '#B23A3A' : '#3D6050', fontWeight: 800 }}>
                          {Math.round(s.successRate * 100)}%
                        </span>
                      </Td>
                      <Td align="right">{s.avgMs}ms</Td>
                      <Td align="right">{s.p95Ms}ms</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 감정 원석 분포 */}
          <Panel
            title="감정 원석 분포"
            caption={`${cbGems.length}종 · 총 ${(cbTotalGems - 1).toLocaleString()}건`}
            help="chatbot 이 분류한 gem 컬럼 분포. 어떤 감정이 가장 많이 분류되는지 = 사용자 감정 풍경."
            span={3}
          >
            {cbGems.length === 0 ? (
              <p style={styles.empty}>아직 분류된 감정 없음</p>
            ) : (
              <ul style={styles.typeBarList}>
                {cbGems.slice(0, 12).map((g) => {
                  const pct = Math.round((g.count / cbTotalGems) * 100);
                  return (
                    <li key={g.gem} style={styles.typeBarRow}>
                      <span style={styles.typeBarName} title={g.gem}>{g.gem}</span>
                      <span style={styles.typeBarTrack}>
                        <span
                          style={{
                            ...styles.typeBarFill,
                            width: `${Math.max(pct, g.count ? 3 : 0)}%`,
                            background: '#D4A574',
                          }}
                        />
                      </span>
                      <span style={styles.typeBarValue}>{g.count.toLocaleString()}</span>
                      <span style={styles.typeBarPct}>{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* 챗봇 Top 사용자 */}
          <Panel
            title="챗봇 사용 Top"
            caption="기록 수 기준"
            help="가장 많이 챗봇에 기록한 사용자. (unmapped) 는 users 테이블에 provider_user_key 매핑 안 된 카카오 ID."
            span={3}
          >
            {cbUsers.length === 0 ? (
              <p style={styles.empty}>—</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>닉네임</Th>
                    <Th align="right">기록</Th>
                    <Th align="right">사진</Th>
                    <Th>마지막</Th>
                  </tr>
                </thead>
                <tbody>
                  {cbUsers.slice(0, 20).map((u) => (
                    <tr key={u.providerUserKey}>
                      <Td>{u.nickname}</Td>
                      <Td align="right">{u.records.toLocaleString()}</Td>
                      <Td align="right">{u.withPhoto.toLocaleString()}</Td>
                      <Td>{formatTime(u.lastAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 챗봇 에러 source 별 */}
          <Panel
            title="챗봇 에러 source 별"
            caption={`${cbErrSrc.length}종`}
            help="chatbot_errors 테이블의 source 컬럼 (webhook.json / save_gem / classify_emotion 등). 1건이라도 있으면 봐야 함."
            span={3}
          >
            {cbErrSrc.length === 0 ? (
              <p style={{ ...styles.empty, color: '#3D6050' }}>✓ 에러 없음</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <Th>source</Th>
                    <Th align="right">횟수</Th>
                    <Th>마지막</Th>
                  </tr>
                </thead>
                <tbody>
                  {cbErrSrc.map((e) => (
                    <tr key={e.source}>
                      <Td>{e.source}</Td>
                      <Td align="right">{e.count}</Td>
                      <Td>{formatTime(e.lastSeen)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* 최근 챗봇 에러 raw */}
          <Panel
            title="최근 챗봇 에러"
            caption="최신 raw"
            help="실제 message + trace_id. 디버깅용. trace_id 로 chatbot_messages 와 join 가능."
            span={3}
          >
            {cbErrRecent.length === 0 ? (
              <p style={{ ...styles.empty, color: '#3D6050' }}>✓ 깨끗</p>
            ) : (
              <div style={styles.streamList}>
                {cbErrRecent.slice(0, 20).map((e) => (
                  <div key={e.id} style={styles.streamRow}>
                    <span style={styles.streamTime}>{formatTime(e.occurredAt)}</span>
                    <span style={{ ...styles.streamType, color: '#B23A3A' }}>{e.source}</span>
                    <span style={styles.streamUser}>{e.userId ? e.userId.slice(0, 10) : '—'}</span>
                    <span style={styles.streamProps}>{e.message}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <footer style={styles.footer}>
          <span>이벤트 카탈로그: page.view · page.dwell · click · perf.web_vitals · error.client · error.api · chatbot.question.sent · record_emotion_confirmed</span>
        </footer>
      </div>
      {selectedUserId && (
        <UserDetailDrawer
          profile={userProfile}
          loading={profileLoading}
          range={drawerRange}
          onRangeChange={setDrawerRange}
          onClose={() => setSelectedUserId(null)}
          formatTime={formatTime}
        />
      )}
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

// === 개인별 활동 추적 드로어 — 한 사용자를 골라 활동을 시간순으로 추적 ===
function UserDetailDrawer({
  profile,
  loading,
  range,
  onRangeChange,
  onClose,
  formatTime,
}: {
  profile: UserProfile | null;
  loading: boolean;
  range: Range;
  onRangeChange: (r: Range) => void;
  onClose: () => void;
  formatTime: (iso: string | null) => string;
}) {
  const rangeKo = range === '24h' ? '24시간' : range === '7d' ? '7일' : '30일';
  const maxType = Math.max(1, ...(profile?.eventTypes.map((t) => t.count) ?? [1]));
  return (
    <>
      <div style={styles.drawerBackdrop} onClick={onClose} />
      <aside style={styles.drawer}>
        <header style={styles.drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <p style={styles.kicker}>개인 활동 추적</p>
            <h2 style={styles.drawerTitle}>{profile?.profile.nickname ?? '사용자'}</h2>
            <p style={styles.drawerSub}>
              카카오ID {profile?.profile.kakaoId ?? '—'} · 가입 {formatTime(profile?.profile.joinedAt ?? null)}
            </p>
            <div style={styles.drawerRangeRow}>
              {(['24h', '7d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onRangeChange(r)}
                  style={{
                    ...styles.drawerRangeBtn,
                    background: range === r ? '#1E3328' : '#FFFFFF',
                    color: range === r ? '#FFFFFF' : '#5A4A32',
                  }}
                >
                  {r === '24h' ? '24시간' : r === '7d' ? '7일' : '30일'}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.drawerClose} aria-label="닫기">
            ✕
          </button>
        </header>

        {loading ? (
          <p style={styles.empty}>불러오는 중…</p>
        ) : !profile ? (
          <p style={styles.empty}>데이터를 불러오지 못했습니다.</p>
        ) : (
          <div style={styles.drawerBody}>
            <div style={styles.drawerStatRow}>
              <DrawerStat label="이벤트" value={profile.summary.totalEvents} />
              <DrawerStat label="세션" value={profile.summary.sessionCount} />
              <DrawerStat label="원석" value={profile.summary.gemCount} />
              <DrawerStat label="챗봇 기록" value={profile.summary.chatbotRecordCount} />
            </div>

            <section style={styles.drawerSection}>
              <h3 style={styles.drawerSectionTitle}>이벤트 유형</h3>
              {profile.eventTypes.length === 0 ? (
                <p style={styles.empty}>최근 {rangeKo} 활동이 없어요</p>
              ) : (
                <ul style={styles.typeBarList}>
                  {profile.eventTypes.map((t) => (
                    <li key={t.type} style={styles.drawerTypeRow}>
                      <span style={styles.typeBarName}>{t.type}</span>
                      <span style={styles.typeBarTrack}>
                        <span style={{ ...styles.typeBarFill, width: `${(t.count / maxType) * 100}%` }} />
                      </span>
                      <span style={styles.typeBarValue}>{t.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={styles.drawerSection}>
              <h3 style={styles.drawerSectionTitle}>감정 분포</h3>
              {profile.emotions.length === 0 ? (
                <p style={styles.empty}>아직 기록한 감정이 없어요</p>
              ) : (
                <div style={styles.emoChipRow}>
                  {profile.emotions.map((e) => (
                    <span key={e.code} style={styles.emoChip}>
                      <span style={{ ...styles.emoDot, background: e.hexColor }} />
                      {e.nameKo} <strong>{e.count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {profile.chatbotRecords.length > 0 && (
              <section style={styles.drawerSection}>
                <h3 style={styles.drawerSectionTitle}>챗봇 기록</h3>
                <div style={styles.streamList}>
                  {profile.chatbotRecords.map((c, i) => (
                    <div key={i} style={styles.drawerCbRow}>
                      <span style={styles.streamTime}>{formatTime(c.createdAt)}</span>
                      <span style={styles.streamType}>
                        {c.gem}
                        {c.hasPhoto ? ' 📷' : ''}
                      </span>
                      <span style={styles.streamProps}>{c.recordText ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={styles.drawerSection}>
              <h3 style={styles.drawerSectionTitle}>활동 타임라인</h3>
              {profile.timeline.length === 0 ? (
                <p style={styles.empty}>최근 {rangeKo} 활동이 없어요</p>
              ) : (
                <div style={styles.streamList}>
                  {profile.timeline.map((ev, i) => (
                    <div key={`${ev.occurredAt}-${i}`} style={styles.drawerTimelineRow}>
                      <span style={styles.streamTime}>{formatTime(ev.occurredAt)}</span>
                      <span style={styles.drawerTimelineText}>{humanizeEvent(ev.eventType, ev.props)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </>
  );
}

function DrawerStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.drawerStat}>
      <span style={styles.drawerStatValue}>{value.toLocaleString()}</span>
      <span style={styles.drawerStatLabel}>{label}</span>
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

// === 감정 × (시간|요일) heatmap ===
// 행 = 감정 (count 내림차순 Top 10), 열 = 0-23시 또는 일-토.
// 셀 색 = 해당 감정 hexColor + opacity (count / 전체 최댓값) — 진할수록 빈도 높음.
// 비어있는 셀도 옅은 회색으로 표시해서 "데이터 없음"을 시각적으로 인지 가능.
function EmotionHeatmap({
  items,
  axis,
}: {
  items: EmotionBucket[];
  axis: 'hour' | 'dow';
}) {
  if (items.length === 0) {
    return (
      <p style={styles.empty}>
        {axis === 'hour' ? '아직 시간대 데이터 부족' : '아직 요일 데이터 부족'}
      </p>
    );
  }

  const colSize = axis === 'hour' ? 24 : 7;
  const colKeys = Array.from({ length: colSize }, (_, i) => i);
  const colLabel = (i: number) => (axis === 'hour' ? `${i}` : DOW_KO[i]);
  // 시간 축은 24개 빼곡하면 잘 안 보이니 3시간 간격만 표시.
  const showColLabel = (i: number) =>
    axis === 'hour' ? i % 3 === 0 : true;

  // 감정별 총합 계산 → Top 10
  const totalByCode = new Map<string, number>();
  const metaByCode = new Map<string, { nameKo: string; hexColor: string }>();
  for (const it of items) {
    totalByCode.set(it.code, (totalByCode.get(it.code) ?? 0) + it.count);
    if (!metaByCode.has(it.code)) {
      metaByCode.set(it.code, { nameKo: it.nameKo, hexColor: it.hexColor });
    }
  }
  const topCodes = Array.from(totalByCode.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code]) => code);

  // (code, colIdx) → count lookup
  const cellCount = new Map<string, number>();
  for (const it of items) {
    const k = axis === 'hour' ? it.hour : it.dow;
    if (k == null) continue;
    if (!topCodes.includes(it.code)) continue;
    cellCount.set(`${it.code}|${k}`, (cellCount.get(`${it.code}|${k}`) ?? 0) + it.count);
  }
  const maxCell = Math.max(...Array.from(cellCount.values()), 1);

  return (
    <div style={styles.heatmapWrap}>
      <div
        style={{
          ...styles.heatmapGrid,
          gridTemplateColumns: `64px repeat(${colSize}, 1fr)`,
        }}
      >
        {/* Top-left corner */}
        <div style={styles.heatmapCorner} />
        {/* Column labels (top row) */}
        {colKeys.map((i) => (
          <div key={`th-${i}`} style={styles.heatmapColHeader}>
            {showColLabel(i) ? colLabel(i) : ''}
          </div>
        ))}
        {/* Body rows */}
        {topCodes.map((code) => {
          const meta = metaByCode.get(code);
          if (!meta) return null;
          return (
            <Fragment key={code}>
              <div style={styles.heatmapRowLabel}>
                <span
                  style={{
                    ...styles.heatmapRowDot,
                    background: meta.hexColor,
                  }}
                />
                <span>{meta.nameKo}</span>
              </div>
              {colKeys.map((i) => {
                const cnt = cellCount.get(`${code}|${i}`) ?? 0;
                const alpha = cnt === 0 ? 0 : 0.18 + 0.82 * (cnt / maxCell);
                const tooltipBucket =
                  axis === 'hour' ? `${i}시` : `${DOW_KO[i]}요일`;
                return (
                  <div
                    key={`${code}-${i}`}
                    title={`${tooltipBucket} · ${meta.nameKo} · ${cnt}건`}
                    style={{
                      ...styles.heatmapCell,
                      background:
                        cnt === 0
                          ? '#F2EAD6'
                          : hexWithAlpha(meta.hexColor, alpha),
                    }}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </div>
      <div style={styles.heatmapLegend}>
        <span style={styles.heatmapLegendLabel}>덜 자주</span>
        <span style={styles.heatmapLegendBar} />
        <span style={styles.heatmapLegendLabel}>자주</span>
      </div>
    </div>
  );
}

// "#A0BCA8" + alpha(0~1) → "#A0BCA8XX" (CSS rgba 호환 8자리 hex).
function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hh = Math.round(a * 255).toString(16).padStart(2, '0');
  return `${hex}${hh}`;
}

// === 디바이스 분포 도넛 (자체 SVG, recharts 없이) ===
const DEVICE_COLORS: Record<string, string> = {
  mobile: '#A0BCA8',
  tablet: '#D6A63A',
  desktop: '#5A4A32',
  '(unknown)': '#C8B89D',
};
const DEVICE_LABELS: Record<string, string> = {
  mobile: '모바일',
  tablet: '태블릿',
  desktop: 'PC',
  '(unknown)': '미상',
};
function DeviceDonut({ items }: { items: DeviceRow[] }) {
  if (items.length === 0)
    return <p style={styles.empty}>—</p>;
  const total = items.reduce((acc, d) => acc + d.uniq, 0);
  if (total === 0) return <p style={styles.empty}>—</p>;

  // SVG donut — 라이브러리 의존 줄이려고 stroke-dasharray 트릭.
  const R = 38;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = items.map((d) => {
    const frac = d.uniq / total;
    const len = C * frac;
    const arc = {
      color: DEVICE_COLORS[d.device] ?? '#7B95A8',
      length: len,
      offset: offset,
    };
    offset += len;
    return arc;
  });

  return (
    <div style={styles.donutWrap}>
      <div style={styles.donutChart}>
        <svg viewBox="0 0 100 100" width="120" height="120">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="#F2EAD6"
            strokeWidth="16"
          />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="16"
              strokeDasharray={`${a.length} ${C - a.length}`}
              strokeDashoffset={-a.offset}
              transform="rotate(-90 50 50)"
            />
          ))}
          <text
            x="50"
            y="48"
            textAnchor="middle"
            fontSize="9"
            fill="#8B7355"
            fontWeight="700"
          >
            고유 사용자
          </text>
          <text
            x="50"
            y="60"
            textAnchor="middle"
            fontSize="14"
            fill="#1E3328"
            fontWeight="800"
          >
            {total}
          </text>
        </svg>
      </div>
      <ul style={styles.donutLegend}>
        {items.map((d) => (
          <li key={d.device} style={styles.donutLegendRow}>
            <span
              style={{
                ...styles.donutLegendDot,
                background: DEVICE_COLORS[d.device] ?? '#7B95A8',
              }}
            />
            <span style={styles.donutLegendName}>
              {DEVICE_LABELS[d.device] ?? d.device}
            </span>
            <span style={styles.donutLegendVal}>{d.uniq}명</span>
            <span style={styles.donutLegendPct}>{d.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// === 신규 vs 재방문 막대 ===
function NewVsReturningBar({ data }: { data: NewVsReturning | null }) {
  if (!data) return <p style={styles.empty}>—</p>;
  const total = data.new + data.returning;
  if (total === 0)
    return <p style={styles.empty}>아직 page.view 데이터 부족</p>;
  return (
    <div style={styles.newRetWrap}>
      <div style={styles.newRetBar}>
        {data.new > 0 && (
          <div
            style={{
              ...styles.newRetSegment,
              width: `${data.newPct}%`,
              background: '#B23A3A',
            }}
            title={`신규 ${data.new}명 (${data.newPct}%)`}
          >
            {data.newPct >= 12 ? `신규 ${data.newPct}%` : ''}
          </div>
        )}
        {data.returning > 0 && (
          <div
            style={{
              ...styles.newRetSegment,
              width: `${data.returningPct}%`,
              background: '#A0BCA8',
              color: '#1E3328',
            }}
            title={`재방문 ${data.returning}명 (${data.returningPct}%)`}
          >
            {data.returningPct >= 12 ? `재방문 ${data.returningPct}%` : ''}
          </div>
        )}
      </div>
      <div style={styles.newRetLegend}>
        <span style={styles.newRetLegendItem}>
          <span style={{ ...styles.newRetLegendDot, background: '#B23A3A' }} />
          신규 <strong>{data.new}</strong>명
        </span>
        <span style={styles.newRetLegendItem}>
          <span style={{ ...styles.newRetLegendDot, background: '#A0BCA8' }} />
          재방문 <strong>{data.returning}</strong>명
        </span>
      </div>
    </div>
  );
}

// === Web Vitals 카드 (LCP/FCP/INP/TTFB/CLS p75) ===
const WV_LABEL: Record<string, string> = {
  LCP: '최대 콘텐츠 표시',
  FCP: '첫 콘텐츠 표시',
  INP: '상호작용 응답',
  TTFB: '서버 응답',
  CLS: '레이아웃 안정성',
};
const WV_UNIT: Record<string, (v: number) => string> = {
  LCP: (v) => (v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(1)}초`),
  FCP: (v) => (v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(1)}초`),
  INP: (v) => `${Math.round(v)}ms`,
  TTFB: (v) => `${Math.round(v)}ms`,
  CLS: (v) => v.toFixed(3),
};
const WV_THRESH_DESC: Record<string, string> = {
  LCP: 'good ≤ 2.5초',
  FCP: 'good ≤ 1.8초',
  INP: 'good ≤ 200ms',
  TTFB: 'good ≤ 800ms',
  CLS: 'good ≤ 0.1',
};
const WV_RATING_COLOR: Record<string, string> = {
  good: '#A0BCA8',
  needs: '#D6A63A',
  poor: '#B23A3A',
  unknown: '#C8B89D',
};
const WV_RATING_KO: Record<string, string> = {
  good: '좋음',
  needs: '개선 필요',
  poor: '나쁨',
  unknown: '데이터 없음',
};
const WV_ORDER = ['LCP', 'FCP', 'INP', 'TTFB', 'CLS'];

function WebVitalsCards({ items }: { items: WebVitalRow[] }) {
  if (items.length === 0)
    return <p style={styles.empty}>아직 web-vitals 데이터 없음</p>;
  const byMetric = new Map(items.map((it) => [it.metric, it]));
  return (
    <div style={styles.wvGrid}>
      {WV_ORDER.map((m) => {
        const it = byMetric.get(m);
        const ratingColor = WV_RATING_COLOR[it?.rating ?? 'unknown'];
        return (
          <div key={m} style={{ ...styles.wvCard, borderColor: ratingColor }}>
            <div style={styles.wvCardHeader}>
              <span style={styles.wvCardMetric}>{m}</span>
              <span
                style={{
                  ...styles.wvCardDot,
                  background: ratingColor,
                }}
              />
            </div>
            <div style={styles.wvCardValue}>
              {it ? WV_UNIT[m](it.p75) : '—'}
            </div>
            <div style={styles.wvCardLabel}>{WV_LABEL[m]}</div>
            <div style={styles.wvCardRating}>
              {it ? WV_RATING_KO[it.rating] : '—'} · {WV_THRESH_DESC[m]}
            </div>
            {it && <div style={styles.wvCardSamples}>{it.samples}회 측정</div>}
          </div>
        );
      })}
    </div>
  );
}

// === DAU 변화 곡선 (최근 30일 일별) ===
// MM/DD 라벨 + DAU 라인. 비어있으면 안내. WAU/MAU 평균 reference line 은 noise 라
// 일부러 안 그림 — 곡선 자체로 충분히 trend 보이고, 위 카드에 절대값 있음.
function DauTrendChart({ data }: { data: ActiveUsers | null }) {
  if (!data || data.daily.length === 0) {
    return (
      <p style={styles.empty}>
        아직 일별 DAU 데이터가 없어요. (HyperLogLog 키가 35일 보관됩니다)
      </p>
    );
  }
  const chartData = data.daily.map((d) => {
    const dt = new Date(d.date);
    return {
      x: `${dt.getMonth() + 1}/${dt.getDate()}`,
      dau: d.dau,
    };
  });
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="#E0D3BA" strokeDasharray="3 3" />
          <XAxis dataKey="x" stroke="#8B7355" fontSize={11} />
          <YAxis stroke="#8B7355" fontSize={11} allowDecimals={false} />
          <Tooltip
            formatter={(v: number) => [`${v.toLocaleString()}명`, 'DAU']}
            labelFormatter={(l) => `${l}`}
          />
          <Line
            type="monotone"
            dataKey="dau"
            stroke="#1E3328"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: '#1E3328' }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  viewport: {
    minHeight: '100dvh',
    width: '100%',
    background: '#F4EDDF',
    color: '#5A4A32',
    // overflowY: auto 를 두면 페이지 스크롤이 이 컨테이너 내부로 갇힘.
    // body 가 스크롤되도록 visible 로 둔다.
    overflow: 'visible',
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

  // 전체 사용자 목록 + 드릴다운
  userSearch: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #E0D3BA',
    background: '#FBF7EE',
    fontSize: 13,
    fontWeight: 600,
    color: '#5A4A32',
    marginBottom: 2,
  },
  userDirList: { maxHeight: 360, overflow: 'auto', borderRadius: 8 },
  clickableRow: { cursor: 'pointer' },
  clickableRowActive: { background: '#EFE7D5' },

  drawerBackdrop: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    background: 'rgba(30,51,40,0.28)',
    zIndex: 50,
  },
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100dvh',
    width: 'min(480px, 100vw)',
    background: '#F4EDDF',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
    zIndex: 51,
    overflowY: 'auto',
    padding: '20px 22px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  drawerTitle: { margin: '2px 0 2px', fontSize: 22, fontWeight: 900, color: '#1E3328' },
  drawerSub: { margin: 0, fontSize: 12, color: '#8B7355', fontWeight: 700 },
  drawerClose: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 999,
    border: '1px solid #E0D3BA',
    background: '#FFFFFF',
    color: '#5A4A32',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
  },
  drawerRangeRow: { display: 'flex', gap: 5, marginTop: 8 },
  drawerRangeBtn: {
    height: 26,
    padding: '0 11px',
    borderRadius: 999,
    border: '1px solid #E0D3BA',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  drawerBody: { display: 'flex', flexDirection: 'column', gap: 18 },
  drawerStatRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  drawerStat: {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  drawerStatValue: { fontSize: 22, fontWeight: 900, color: '#1E3328', lineHeight: 1.1 },
  drawerStatLabel: { fontSize: 11, fontWeight: 800, color: '#8B7355' },
  drawerSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  drawerSectionTitle: { margin: 0, fontSize: 13, fontWeight: 900, color: '#1E3328' },
  drawerTypeRow: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr 50px',
    alignItems: 'center',
    gap: 8,
    fontSize: 11.5,
  },
  emoChipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  emoChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: '#FFFFFF',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700,
    color: '#5A4A32',
  },
  emoDot: { width: 10, height: 10, borderRadius: 999, display: 'inline-block', flexShrink: 0 },
  drawerCbRow: {
    display: 'grid',
    gridTemplateColumns: '78px 96px 1fr',
    gap: 8,
    fontSize: 11.5,
    color: '#5A4A32',
    padding: '6px 4px',
    borderBottom: '1px solid #F2EAD6',
    alignItems: 'baseline',
  },
  drawerTimelineRow: {
    display: 'grid',
    gridTemplateColumns: '78px 1fr',
    gap: 10,
    fontSize: 12,
    color: '#5A4A32',
    padding: '6px 4px',
    borderBottom: '1px solid #F2EAD6',
    alignItems: 'baseline',
  },
  drawerTimelineText: { color: '#1E3328', fontWeight: 600, wordBreak: 'break-word' },

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
  sectionDivider: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: '2px solid #E0D3BA',
  },
  sectionDividerTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: '#1E3328',
  },
  sectionDividerCaption: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#5A4A32',
    fontWeight: 600,
    maxWidth: 820,
  },
  // 세션 경로 패턴
  seqRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '6px 0',
    borderBottom: '1px dashed #E8DFC9',
  },
  seqMeta: {
    fontSize: 11,
    color: '#8B7355',
    fontWeight: 700,
  },
  seqPath: {
    fontSize: 12,
    color: '#1E3328',
    fontWeight: 700,
    lineHeight: 1.4,
    wordBreak: 'keep-all',
  },
  // 감정 heatmap (감정 × 시간|요일)
  heatmapWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  heatmapGrid: {
    display: 'grid',
    gap: 2,
    fontSize: 10,
  },
  heatmapCorner: {
    background: 'transparent',
  },
  heatmapColHeader: {
    textAlign: 'center',
    fontSize: 9,
    fontWeight: 700,
    color: '#8B7355',
    minHeight: 14,
    lineHeight: '14px',
  },
  heatmapRowLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    color: '#5A4A32',
    paddingRight: 4,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  heatmapRowDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  heatmapCell: {
    height: 18,
    borderRadius: 3,
    transition: 'transform 80ms',
  },
  heatmapLegend: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    fontSize: 10,
    color: '#8B7355',
    fontWeight: 700,
    justifyContent: 'flex-end',
  },
  heatmapLegendLabel: {
    fontSize: 9,
  },
  heatmapLegendBar: {
    display: 'inline-block',
    width: 80,
    height: 8,
    borderRadius: 2,
    background:
      'linear-gradient(90deg, #F2EAD6 0%, #5A4A32 100%)',
  },
  // 페이지 테이블 스크롤 깊이 셀
  scrollCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 90,
    justifyContent: 'flex-end',
  },
  scrollTrack: {
    display: 'inline-block',
    width: 50,
    height: 6,
    background: '#F2EAD6',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  scrollFill: {
    display: 'block',
    height: '100%',
    background: '#7AA088',
    borderRadius: 3,
  },
  scrollVal: {
    fontSize: 11,
    color: '#5A4A32',
    fontWeight: 700,
    minWidth: 32,
    textAlign: 'right',
  },
  // 디바이스 도넛
  donutWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  donutChart: {
    flexShrink: 0,
  },
  donutLegend: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    listStyle: 'none',
    padding: 0,
    margin: 0,
    flex: 1,
  },
  donutLegendRow: {
    display: 'grid',
    gridTemplateColumns: '12px 1fr auto auto',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#5A4A32',
  },
  donutLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  donutLegendName: {
    fontWeight: 700,
  },
  donutLegendVal: {
    color: '#8B7355',
    fontVariantNumeric: 'tabular-nums',
  },
  donutLegendPct: {
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 36,
    textAlign: 'right',
  },
  // 신규 vs 재방문 막대
  newRetWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 8,
  },
  newRetBar: {
    display: 'flex',
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    background: '#F2EAD6',
  },
  newRetSegment: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontWeight: 800,
    fontSize: 12,
    transition: 'width 200ms',
  },
  newRetLegend: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: '#5A4A32',
  },
  newRetLegendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  newRetLegendDot: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  // Web Vitals 카드
  wvGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 8,
  },
  wvCard: {
    border: '2px solid',
    borderRadius: 10,
    padding: '10px 8px',
    background: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: 110,
  },
  wvCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wvCardMetric: {
    fontSize: 11,
    fontWeight: 800,
    color: '#8B7355',
    letterSpacing: 0.5,
  },
  wvCardDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  wvCardValue: {
    fontSize: 20,
    fontWeight: 800,
    color: '#1E3328',
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
  },
  wvCardLabel: {
    fontSize: 10,
    color: '#5A4A32',
    fontWeight: 700,
  },
  wvCardRating: {
    fontSize: 9,
    color: '#8B7355',
    marginTop: 'auto',
  },
  wvCardSamples: {
    fontSize: 9,
    color: '#A89779',
  },
};
