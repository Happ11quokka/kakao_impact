// === 실시간 이벤트 스트림 — raw JSON props 를 비전공자도 읽을 수 있는 한 줄 한글로 ===
// 모든 분기는 props 가 unknown 일 수 있다는 전제로 type guard 후 사용.

import { EMOTIONS } from '../data/emotions';

const PATH_LABELS: Record<string, string> = {
  '/': '홈',
  '/calendar': '캘린더',
  '/analysis': '감정분석',
  '/settings': '설정',
  '/login': '로그인',
  '/login/callback': '로그인 콜백',
  '/ops/analytics': '운영자 대시보드',
};
function pathKo(p: unknown): string {
  if (typeof p !== 'string') return '(unknown)';
  return PATH_LABELS[p] ?? p;
}

const EMOTION_KO = new Map(EMOTIONS.map((e) => [e.code, e.nameKo]));
function emotionKo(code: unknown): string {
  if (typeof code !== 'string') return '(unknown)';
  return EMOTION_KO.get(code) ?? code;
}

const DEVICE_KO: Record<string, string> = {
  mobile: '모바일',
  tablet: '태블릿',
  desktop: 'PC',
};
function deviceKo(d: unknown): string {
  if (typeof d !== 'string') return '';
  return DEVICE_KO[d] ?? d;
}

function pickStr(props: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!props) return null;
  const v = props[key];
  return typeof v === 'string' ? v : null;
}
function pickNum(props: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!props) return null;
  const v = props[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function viewportLabel(props: Record<string, unknown> | null | undefined): string {
  if (!props) return '';
  const vp = props['viewport'];
  if (vp && typeof vp === 'object' && vp !== null) {
    const w = (vp as Record<string, unknown>)['w'];
    const h = (vp as Record<string, unknown>)['h'];
    if (typeof w === 'number' && typeof h === 'number') {
      return `${w}×${h}`;
    }
  }
  return '';
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}초`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}분 ${rs}초`;
}

// Web Vitals 단위 + 임계값 평가 (텍스트만, 색상은 호출측이).
const WV_UNITS: Record<string, (v: number) => string> = {
  LCP: (v) => formatMs(v),
  FCP: (v) => formatMs(v),
  INP: (v) => formatMs(v),
  TTFB: (v) => formatMs(v),
  CLS: (v) => v.toFixed(3),
};

export function humanizeEvent(
  eventType: string,
  props: Record<string, unknown> | null | undefined,
): string {
  const path = pickStr(props, 'path');
  const device = deviceKo(pickStr(props, 'deviceType'));
  const pathLabel = path ? pathKo(path) : null;

  switch (eventType) {
    case 'page.view': {
      const vp = viewportLabel(props);
      const where = pathLabel ?? '(unknown)';
      const dev = device ? ` · ${device}${vp ? `(${vp})` : ''}` : '';
      return `${where} 페이지 진입${dev}`;
    }
    case 'page.dwell': {
      const dur = pickNum(props, 'durationMs');
      const scroll = pickNum(props, 'scrollDepthPct');
      const where = pathLabel ?? '(unknown)';
      const durStr = dur != null ? ` ${formatMs(dur)} 머무름` : '';
      const sc = scroll != null && scroll > 0 ? ` · 스크롤 ${Math.round(scroll)}%` : '';
      return `${where}에서${durStr}${sc}`;
    }
    case 'click': {
      const text = (pickStr(props, 'text') ?? '').trim().slice(0, 30);
      const trackId = pickStr(props, 'trackId');
      const where = pathLabel ?? '';
      const label = text ? `'${text}' 클릭` : '버튼 클릭';
      const meta = trackId ? ` (${trackId})` : '';
      return where ? `${where} — ${label}${meta}` : `${label}${meta}`;
    }
    case 'error.client': {
      const msg = (pickStr(props, 'message') ?? '(메시지 없음)').slice(0, 80);
      const where = pathLabel ?? '(unknown)';
      const kind = pickStr(props, 'kind');
      const kindLabel = kind === 'unhandledrejection' ? '미처리 Promise' : 'JS 런타임';
      return `${kindLabel} 에러: ${msg} (${where})`;
    }
    case 'error.api': {
      const status = pickNum(props, 'status') ?? 0;
      const code = pickStr(props, 'code');
      const apiPath = pickStr(props, 'path') ?? '(unknown)';
      const codePart = code ? ` [${code}]` : '';
      return `API 에러 ${status}${codePart}: ${apiPath}`;
    }
    case 'perf.web_vitals': {
      const name = pickStr(props, 'name') ?? '?';
      const value = pickNum(props, 'value') ?? 0;
      const fmt = WV_UNITS[name];
      const where = pathLabel ?? '';
      const valStr = fmt ? fmt(value) : `${value}`;
      return where ? `성능 ${name}: ${valStr} (${where})` : `성능 ${name}: ${valStr}`;
    }
    case 'chatbot.question.sent': {
      const ct = pickStr(props, 'contentType') ?? 'text';
      const len = pickNum(props, 'bodyLength') ?? 0;
      const hasMedia = props && props['hasMedia'] === true;
      const typeKo = ct === 'image' ? '이미지' : ct === 'mixed' ? '텍스트+이미지' : '텍스트';
      const lenPart = len > 0 ? ` ${len}자` : '';
      const mediaPart = hasMedia && ct === 'text' ? ' (사진 첨부)' : '';
      return `카카오 챗봇 질문 수신 · ${typeKo}${lenPart}${mediaPart}`;
    }
    case 'record_emotion_confirmed': {
      const code = pickStr(props, 'emotionCode');
      const interaction = pickStr(props, 'interaction');
      const interactionKo = interaction === 'reclassify' ? '재분류' : '확정';
      const reflectionType = pickStr(props, 'reflectionType');
      const refKo =
        reflectionType === 'question'
          ? ' · 자기성찰 질문'
          : reflectionType === 'meditation'
            ? ' · 명상'
            : '';
      return `감정 ${interactionKo}: ${emotionKo(code)}${refKo}`;
    }
    case 'self_reflection_created': {
      const linkedDate = pickStr(props, 'linkedDate') ?? '';
      const datePart = linkedDate ? ` (${linkedDate})` : '';
      return `자기성찰 답변 작성${datePart}`;
    }
    case 'provider_user_key_linked': {
      const source = pickStr(props, 'source') ?? '';
      const backfilled = pickNum(props, 'backfilled_messages');
      const bf = backfilled && backfilled > 0 ? ` (이전 챗봇 메시지 ${backfilled}건 연결)` : '';
      return `카카오 계정 연결${source ? ` · ${source}` : ''}${bf}`;
    }
    case 'craft': {
      const tier = pickNum(props, 'resultTier');
      const result = emotionKo(pickStr(props, 'resultEmotion'));
      const kind = pickStr(props, 'kind');
      const kindKo = kind === 'recipe' ? '레시피' : '동일감정';
      return `보석 조합: ${result}${tier ? ` (티어 ${tier})` : ''} · ${kindKo}`;
    }
    case 'collect': {
      return '운영자 챗봇 메시지 검수';
    }
    default: {
      // deploy.* / 알 수 없는 타입: 짧게 path 만이라도.
      if (eventType.startsWith('deploy.')) {
        const tag = eventType.slice('deploy.'.length);
        return `배포 마커: ${tag || '(unknown)'}`;
      }
      if (pathLabel) return `${eventType} · ${pathLabel}`;
      return eventType;
    }
  }
}
