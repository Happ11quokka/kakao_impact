// === Analytics SDK — events 배치 전송, anon_id 관리, web-vitals 측정 ===
// 핵심 원칙:
// - 실패해도 silent. 분석이 앱을 죽이면 안 됨.
// - 큐 + 디바운스(5s) / 20개 도달 / pagehide 에서 자동 flush.
// - 인증 토큰 있으면 자동 부착, 없으면 X-Anon-Id 헤더로 익명 처리.

import { api } from './api';

const ANON_KEY = 'avoha_anon_id';
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 20;
const MAX_QUEUE = 100;

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

type QueueItem = {
  eventType: string;
  props?: Record<string, unknown>;
  occurredAt?: string;
};

let anonId: string | null = null;
let queue: QueueItem[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let sessionId: string | null = null;

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function loadAnonId(): string {
  try {
    const existing = localStorage.getItem(ANON_KEY);
    if (existing) return existing;
    const fresh = uuid();
    localStorage.setItem(ANON_KEY, fresh);
    return fresh;
  } catch {
    return uuid();
  }
}

function loadSessionId(): string {
  try {
    const existing = sessionStorage.getItem('avoha_session_id');
    if (existing) return existing;
    const fresh = uuid();
    sessionStorage.setItem('avoha_session_id', fresh);
    return fresh;
  } catch {
    return uuid();
  }
}

function detectDevice(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function commonProps(): Record<string, unknown> {
  return {
    sessionId,
    anonId,
    path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    deviceType: detectDevice(),
  };
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, FLUSH_BATCH_SIZE);
  try {
    // api.events() 는 토큰을 자동 부착해 줌. 토큰이 없으면 백엔드가 X-Anon-Id
    // 헤더 / body.anonId 로 익명 처리.
    await fetchEventsWithAnon(batch);
  } catch {
    // 실패한 배치는 버린다. 재시도 큐를 만들면 무한 폭주 위험.
  }
  if (queue.length > 0) scheduleFlush();
}

async function fetchEventsWithAnon(batch: QueueItem[]): Promise<void> {
  const token = api.getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (anonId) headers['X-Anon-Id'] = anonId;
  const body = JSON.stringify({ events: batch, anonId });
  // sendBeacon 은 헤더 커스터마이즈 불가 → 일반 fetch 사용. pagehide 에서만
  // sendBeacon fallback (body 만 보냄, 백엔드가 body.anonId 로 식별).
  const res = await fetch(`${API_BASE}/events`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body,
    keepalive: true,
  });
  if (!res.ok && res.status !== 401) {
    // 401 (만료 토큰) 은 무시. 다른 에러도 silent.
  }
}

function flushOnHide(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    const body = JSON.stringify({ events: batch, anonId });
    // pagehide 에서는 sendBeacon 이 가장 안전 (브라우저 닫혀도 전송 완료).
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/events`, blob);
      return;
    }
    void fetch(`${API_BASE}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(anonId ? { 'X-Anon-Id': anonId } : {}) },
      body,
      keepalive: true,
    });
  } catch {
    /* silent */
  }
}

async function reportWebVitals(): Promise<void> {
  try {
    const { onCLS, onLCP, onINP, onTTFB, onFCP } = await import('web-vitals');
    onCLS((m) => track('perf.web_vitals', { name: 'CLS', value: m.value }));
    onLCP((m) => track('perf.web_vitals', { name: 'LCP', value: m.value }));
    onINP((m) => track('perf.web_vitals', { name: 'INP', value: m.value }));
    onTTFB((m) => track('perf.web_vitals', { name: 'TTFB', value: m.value }));
    onFCP((m) => track('perf.web_vitals', { name: 'FCP', value: m.value }));
  } catch {
    /* web-vitals 로드 실패는 silent */
  }
}

// 운영자 전용 경로 — 자기 자신의 사용을 통계에 넣으면 데이터 오염. 트래킹 제외.
const TRACKING_EXCLUDE_PATH_PREFIXES = ['/ops/'];
function isExcludedPath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return TRACKING_EXCLUDE_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export function track(eventType: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  // /ops/* 페이지에서의 자동 트래킹 (page.view, click, perf.web_vitals 등) 제외.
  // 운영자가 대시보드 자체를 사용한 행동이 KPI/플로우/감정 분석을 오염시킴.
  if (isExcludedPath()) return;
  // props.path 가 /ops/ 면 dwell 같이 이동 직후 발사 케이스도 차단.
  const pp = props?.path;
  if (typeof pp === 'string' && TRACKING_EXCLUDE_PATH_PREFIXES.some((px) => pp.startsWith(px))) {
    return;
  }
  if (queue.length >= MAX_QUEUE) queue.shift(); // 오래된 거 버림
  queue.push({
    eventType,
    props: { ...commonProps(), ...(props ?? {}) },
    occurredAt: new Date().toISOString(),
  });
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flush();
  } else {
    scheduleFlush();
  }
}

export function getAnonId(): string | null {
  return anonId;
}

export async function linkUser(): Promise<void> {
  // 로그인 콜백 직후 호출. 백엔드가 require_user 로 식별하므로 토큰이 이미
  // 부착되어 있어야 함.
  if (!anonId) return;
  try {
    const token = api.getToken();
    if (!token) return;
    await fetch(`${API_BASE}/auth/link-anon`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ anonId }),
    });
  } catch {
    /* silent */
  }
}

export function init(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  anonId = loadAnonId();
  sessionId = loadSessionId();
  initialized = true;

  window.addEventListener('pagehide', flushOnHide);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide();
  });
  window.addEventListener('error', (ev) => {
    track('error.client', {
      message: ev.message,
      filename: ev.filename,
      lineno: ev.lineno,
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    track('error.client', {
      message: reason instanceof Error ? reason.message : String(reason),
      kind: 'unhandledrejection',
    });
  });

  void reportWebVitals();
}

export const analytics = { init, track, linkUser, getAnonId, flush };
