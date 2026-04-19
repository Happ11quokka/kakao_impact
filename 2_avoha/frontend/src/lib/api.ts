// === API 클라이언트 (FastAPI 백엔드 연동, Bearer 토큰) ===
// 쿠키는 Public Suffix List(`up.railway.app`) 때문에 cross-site fetch 에 실리지
// 않음 → Authorization: Bearer <token> 방식. 토큰은 OAuth 콜백의 URL fragment
// 로 받아 localStorage 에 저장.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
const TOKEN_KEY = 'avoha_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: unknown,
  ) {
    super(`${status} ${code}`);
  }
}

let _token: string | null = null;
try {
  _token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
} catch {
  _token = null;
}

function setToken(token: string | null): void {
  _token = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Safari private mode 등 localStorage 사용 불가 시 메모리만 */
  }
}

function getToken(): string | null {
  return _token;
}

type JsonInit = Omit<RequestInit, 'body'> & { json?: unknown };

async function request<T>(path: string, init: JsonInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include', // 같은 도메인 운영 시에도 대비
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : (init as RequestInit).body,
  });
  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : undefined;
  if (!res.ok) {
    const code = (payload as { error?: { code?: string } } | undefined)?.error?.code ?? 'HTTP_ERROR';
    throw new ApiError(res.status, code, payload);
  }
  return payload as T;
}

// ── 응답 타입 ──

export interface MeResponse {
  user: {
    id: string;
    kakaoId: number;
    nickname: string;
    profileUrl: string | null;
  };
  tickets: { date: string; remaining: number };
}

export interface GemDto {
  id: string;
  emotionCode: string;
  tier: 1 | 2 | 3 | 4;
  source: string | null;
  sourceMessageId: string | null;
  craftedFrom: string[];
  createdAt: string;
}

export interface StickerDto {
  id: string;
  imageUrl: string;
  polaroidFallback: boolean;
  placedOnField: boolean;
  sourceMessageId: string | null;
  createdAt: string;
}

export interface FieldDropDto extends GemDto {
  position: { x: number; y: number };
}

export const api = {
  base: API_URL,

  setToken,
  getToken,

  loginUrl(): string {
    return `${API_URL}/auth/kakao/login`;
  },

  me: () => request<MeResponse>('/me'),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  gems: (params?: { emotion?: string; tier?: number }) => {
    const qs = new URLSearchParams();
    if (params?.emotion) qs.set('emotion', params.emotion);
    if (params?.tier) qs.set('tier', String(params.tier));
    const suffix = qs.toString();
    return request<{ gems: GemDto[] }>(`/inventory/gems${suffix ? `?${suffix}` : ''}`);
  },

  stickers: () => request<{ stickers: StickerDto[] }>('/inventory/stickers'),

  fieldToday: () => request<{ drops: FieldDropDto[] }>('/field/today'),

  recipes: () =>
    request<{
      recipes: Array<{
        id: string;
        slug: string;
        nameKo: string;
        ingredientCodes: string[];
        resultTier: number;
        unlockedBy: string | null;
      }>;
    }>('/crafting/recipes'),

  combine: (ingredientIds: string[]) =>
    request<{
      gem: GemDto;
      recipeSlug: string | null;
      kind: 'homogeneous' | 'recipe';
    }>('/crafting/combine', { method: 'POST', json: { ingredientIds } }),

  events: (events: Array<{ eventType: string; props?: Record<string, unknown> }>) =>
    request<{ ok: boolean; count: number }>('/events', { method: 'POST', json: { events } }),
};
