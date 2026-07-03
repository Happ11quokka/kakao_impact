// === analytics-stream — 운영자 대시보드용 SSE 클라이언트 ===
// EventSource 는 헤더 못 보냄 → ?u=&p= 쿼리로 Basic Auth 자격 전달.
// 백엔드 require_admin_basic 이 query 폴백을 받아줌.

import { getOpsBasicAuth } from '../components/RequireOpsUser';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

export type StreamEvent = {
  type?: string; // 'hello' | 'ping' (server) | undefined (보통의 analytics 이벤트)
  eventType?: string;
  userId?: string | null;
  props?: Record<string, unknown>;
};

export function openAnalyticsStream(onMessage: (ev: StreamEvent) => void): () => void {
  const basic = getOpsBasicAuth();
  if (!basic) return () => {};
  let username = '';
  let password = '';
  try {
    const decoded = atob(basic);
    const idx = decoded.indexOf(':');
    if (idx === -1) return () => {};
    username = decoded.slice(0, idx);
    password = decoded.slice(idx + 1);
  } catch {
    return () => {};
  }
  const url = `${API_URL}/ops/analytics/sse?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`;
  const es = new EventSource(url);
  es.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as StreamEvent;
      onMessage(parsed);
    } catch {
      /* ignore malformed */
    }
  };
  es.onerror = () => {
    // 브라우저가 자동 재연결 시도 — 별도 처리 안 함.
  };
  return () => es.close();
}
