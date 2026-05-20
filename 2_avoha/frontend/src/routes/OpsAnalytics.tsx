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
type Page = { path: string; views: number; uniq: number; avgDwellMs: number };
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
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setLoading(true);
    const [s, p, f, t, b, u, e, r,
      cs, ch, cl, ce, cg, cu,
      fEntry, fExit, fEdges, fSeq,
      emD, emH, emW, emU,
    ] = await Promise.all([
      get<Summary>('/ops/analytics/summary'),
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
    ]);
    if (s) setSummary(s);
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
    setLoading(false);
    setLastRefreshed(new Date());
  }, [range]);
  refreshRef.current = reload;

  useEffect(() => {
    void reload();
  }, [reload]);

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
                      <Td>{labelForPath(p.path)}</Td>
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
            <HourEmotionChart items={emoByHour} />
          </Panel>

          <Panel
            title="요일별 감정 분포"
            caption="일~토"
            help="주말 vs 평일 감정 분포 차이. 월요일 우울증 / 금요일 기쁨 같은 일주일 리듬."
            span={3}
          >
            <DowEmotionChart items={emoByDow} />
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

// === 감정 × 시간 / 요일 stacked bar (Recharts 대신 자체 SVG) ===
function HourEmotionChart({ items }: { items: EmotionBucket[] }) {
  // 24시간 × 감정 stacked bar
  const codes = Array.from(new Set(items.map((it) => it.code)));
  const colors: Record<string, string> = {};
  codes.forEach((c) => {
    const found = items.find((it) => it.code === c);
    if (found) colors[c] = found.hexColor;
  });
  const labels: Record<string, string> = {};
  codes.forEach((c) => {
    const found = items.find((it) => it.code === c);
    if (found) labels[c] = found.nameKo;
  });

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const byHour = hours.map((h) => {
    const row: Record<string, number> = {};
    let total = 0;
    for (const c of codes) {
      const v = items.find((it) => it.hour === h && it.code === c)?.count ?? 0;
      row[c] = v;
      total += v;
    }
    return { hour: h, row, total };
  });
  const maxTotal = Math.max(...byHour.map((b) => b.total), 1);

  if (items.length === 0) return <p style={styles.empty}>아직 시간대 데이터 부족</p>;

  return (
    <div>
      <div style={styles.hourChart}>
        {byHour.map((b) => (
          <div key={b.hour} style={styles.hourCol}>
            <div style={styles.hourStackTrack}>
              <div style={styles.hourStackInner}>
                {codes.map((c) => {
                  const v = b.row[c];
                  if (!v) return null;
                  const h = (v / maxTotal) * 100;
                  return (
                    <div
                      key={c}
                      title={`${b.hour}시 · ${labels[c]} · ${v}`}
                      style={{
                        height: `${h}%`,
                        background: colors[c],
                        width: '100%',
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <span style={styles.hourLabel}>{b.hour}</span>
          </div>
        ))}
      </div>
      <div style={styles.legend}>
        {codes.map((c) => (
          <span key={c} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: colors[c] }} />
            {labels[c]}
          </span>
        ))}
      </div>
    </div>
  );
}

function DowEmotionChart({ items }: { items: EmotionBucket[] }) {
  const codes = Array.from(new Set(items.map((it) => it.code)));
  const colors: Record<string, string> = {};
  codes.forEach((c) => {
    const found = items.find((it) => it.code === c);
    if (found) colors[c] = found.hexColor;
  });
  const labels: Record<string, string> = {};
  codes.forEach((c) => {
    const found = items.find((it) => it.code === c);
    if (found) labels[c] = found.nameKo;
  });

  // 일=0~토=6
  const dows = [0, 1, 2, 3, 4, 5, 6];
  const byDow = dows.map((d) => {
    const row: Record<string, number> = {};
    let total = 0;
    for (const c of codes) {
      const v = items.find((it) => it.dow === d && it.code === c)?.count ?? 0;
      row[c] = v;
      total += v;
    }
    return { dow: d, row, total };
  });
  const maxTotal = Math.max(...byDow.map((b) => b.total), 1);

  if (items.length === 0) return <p style={styles.empty}>아직 요일 데이터 부족</p>;

  return (
    <div>
      <div style={styles.dowChart}>
        {byDow.map((b) => (
          <div key={b.dow} style={styles.dowCol}>
            <div style={styles.dowTotal}>{b.total || ''}</div>
            <div style={styles.dowStackTrack}>
              <div style={styles.hourStackInner}>
                {codes.map((c) => {
                  const v = b.row[c];
                  if (!v) return null;
                  const h = (v / maxTotal) * 100;
                  return (
                    <div
                      key={c}
                      title={`${DOW_KO[b.dow]} · ${labels[c]} · ${v}`}
                      style={{
                        height: `${h}%`,
                        background: colors[c],
                        width: '100%',
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <span style={styles.dowLabel}>{DOW_KO[b.dow]}</span>
          </div>
        ))}
      </div>
      <div style={styles.legend}>
        {codes.map((c) => (
          <span key={c} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: colors[c] }} />
            {labels[c]}
          </span>
        ))}
      </div>
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
  // 시간대별 stacked bar
  hourChart: {
    display: 'grid',
    gridTemplateColumns: 'repeat(24, 1fr)',
    gap: 2,
    height: 180,
    alignItems: 'flex-end',
  },
  hourCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    height: '100%',
    justifyContent: 'flex-end',
  },
  hourStackTrack: {
    width: '100%',
    flex: 1,
    background: '#F2EAD6',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  hourStackInner: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column-reverse',
  },
  hourLabel: {
    fontSize: 9,
    color: '#8B7355',
    fontWeight: 700,
  },
  // 요일별 stacked bar
  dowChart: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 8,
    height: 180,
    alignItems: 'flex-end',
  },
  dowCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    height: '100%',
    justifyContent: 'flex-end',
  },
  dowStackTrack: {
    width: '100%',
    flex: 1,
    background: '#F2EAD6',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  dowTotal: {
    fontSize: 11,
    fontWeight: 800,
    color: '#5A4A32',
    minHeight: 14,
  },
  dowLabel: {
    fontSize: 11,
    color: '#8B7355',
    fontWeight: 800,
  },
  // 범례
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    fontSize: 10,
    color: '#5A4A32',
    fontWeight: 700,
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: 999,
  },
};
