// === analytics-stream — 운영자 대시보드용 SSE 클라이언트 ===
// EventSource 는 커스텀 헤더 불가 → query string ?token=... 으로 인증.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

export type StreamEvent = {
  type?: string; // 'hello' | 'ping' (server) | undefined (보통의 analytics 이벤트)
  eventType?: string;
  userId?: string | null;
  props?: Record<string, unknown>;
};

export function openAnalyticsStream(onMessage: (ev: StreamEvent) => void): () => void {
  const token = localStorage.getItem('avoha_token');
  if (!token) return () => {};
  const url = `${API_URL}/ops/analytics/sse?token=${encodeURIComponent(token)}`;
  // withCredentials 는 표준 미지원 / 브라우저별 차이 큼. 토큰을 query 로 이미
  // 넘기고 있으므로 쿠키 없이 동작. cross-origin 도 CORS Allow-Origin 만 있으면 OK.
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
    // 브라우저가 자동 재연결 시도 — 우리도 별도 처리 안 함.
  };
  return () => es.close();
}
