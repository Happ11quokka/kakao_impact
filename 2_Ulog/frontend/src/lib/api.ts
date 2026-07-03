// === API 클라이언트 (FastAPI 백엔드 연동, Bearer 토큰) ===
// 쿠키는 Public Suffix List(`up.railway.app`) 때문에 cross-site fetch 에 실리지
// 않음 → Authorization: Bearer <token> 방식. 토큰은 OAuth 콜백의 URL fragment
// 로 받아 localStorage 에 저장.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
const TOKEN_KEY = 'avoha_token';

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export const DEV_AUTH_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true' && isLocalhost();

const MOCK_API_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_API === 'true' && isLocalhost();

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

  if (MOCK_API_ENABLED) {
    const mocked = mockRequest<T>(path, init);
    if (mocked !== undefined) return mocked;
  }

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
    // /events 자체 실패는 트래킹하지 말 것 (재귀 폭주 방지).
    if (path !== '/events') {
      try {
        const { track } = await import('./analytics');
        track('error.api', { path, status: res.status, code });
      } catch {
        /* silent */
      }
    }
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
  sourceChatbotId?: number | null;
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

export interface ChatbotRecordDto {
  id: number;
  gem: string;
  recordText: string | null;
  hasPhoto: boolean;
  imageUrl: string | null;
  aiGems: string | null;
  questionId?: string | null;
  questionText?: string | null;
  answerText?: string | null;
  linkedDate?: string | null;
  createdAt: string;
}

export type RecordEntryMode = 'emotion_classification' | 'plain_record';
export type RecordClassificationStatus =
  | 'needs_confirmation'
  | 'user_confirmed'
  | 'reclassified';

export type DetailedEmotionBadgeDto = {
  code: string;
  label: string;
  gem: string;
};

export interface RecordDto extends ChatbotRecordDto {
  entryMode: RecordEntryMode;
  classificationStatus: RecordClassificationStatus;
  aiEmotionCode: string | null;
  confirmedEmotionCode: string | null;
  confirmedEmotionCodes: string[];
  detailedEmotionBadges?: DetailedEmotionBadgeDto[];
  confirmedAt: string | null;
  webReviewedAt: string | null;
  updatedAt: string;
  gemId: string | null;
  gemEmotionCode: string | null;
}

const mockPlainRecordTime = new Date(Date.now() - 1000 * 60 * 80).toISOString();
const mockEmotionRecordTime = new Date(Date.now() - 1000 * 60 * 25).toISOString();
const mockDailyRecordTime = new Date(Date.now() - 1000 * 60 * 10).toISOString();
const mockDailyRecordTime2 = new Date(Date.now() - 1000 * 60 * 40).toISOString();
const mockCollectedTime = new Date(Date.now() - 1000 * 60 * 55).toISOString();
const mockYesterday = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

let mockRecords: RecordDto[] = [
  {
    id: 101,
    gem: '후회 조각',
    recordText: '오늘 회의에서 내 의견을 제대로 말하지 못한 게 계속 마음에 남았어. 다음엔 조금 더 또렷하게 말해보고 싶어.',
    hasPhoto: false,
    imageUrl: null,
    aiGems: '후회 조각',
    createdAt: mockPlainRecordTime,
    entryMode: 'emotion_classification',
    classificationStatus: 'needs_confirmation',
    aiEmotionCode: 'regret',
    confirmedEmotionCode: null,
    confirmedEmotionCodes: [],
    confirmedAt: null,
    webReviewedAt: null,
    updatedAt: mockPlainRecordTime,
    gemId: null,
    gemEmotionCode: null,
  },
  {
    id: 102,
    gem: '즐거움 조각',
    recordText: '퇴근길에 좋아하는 노래를 들으면서 걷는데, 오늘 하루가 괜찮았다는 안도감과 스스로 챙겼다는 뿌듯함, 내일에 대한 설렘이 같이 있었어.',
    hasPhoto: false,
    imageUrl: null,
    aiGems: '즐거움 조각,뿌듯함 조각,설렘 조각',
    createdAt: mockEmotionRecordTime,
    entryMode: 'emotion_classification',
    classificationStatus: 'user_confirmed',
    aiEmotionCode: 'joy',
    confirmedEmotionCode: 'joy',
    confirmedEmotionCodes: ['joy', 'pride', 'flutter'],
    confirmedAt: mockEmotionRecordTime,
    webReviewedAt: null,
    updatedAt: mockEmotionRecordTime,
    gemId: 'mock-gem-102',
    gemEmotionCode: 'joy',
  },
  {
    // 챗봇 '일상기록'(감정 미지정) — DB 기본값 그대로: entry_mode/classification_status 디폴트,
    // 감정 코드 전부 없음, web_reviewed_at 없음 → 홈에서 미분류(흐릿한) 원석으로 떠야 함.
    id: 103,
    gem: '일상기록',
    recordText: '특별한 일은 없었지만 따뜻한 커피 한 잔과 함께 창밖을 바라본 평범한 오후였어.',
    hasPhoto: false,
    imageUrl: null,
    aiGems: null,
    createdAt: mockDailyRecordTime,
    entryMode: 'emotion_classification',
    classificationStatus: 'user_confirmed',
    aiEmotionCode: null,
    confirmedEmotionCode: null,
    confirmedEmotionCodes: [],
    confirmedAt: null,
    webReviewedAt: null,
    updatedAt: mockDailyRecordTime,
    gemId: null,
    gemEmotionCode: null,
  },
  {
    // 채집 완료(웹 검토됨) 색상 원석 — 점선 없이 원 안에 유지되는 상태 데모
    id: 104,
    gem: '슬픔 조각',
    recordText: '오랜만에 옛 사진을 보다가 조금 먹먹해졌어. 그래도 그 시절이 좋았지.',
    hasPhoto: false,
    imageUrl: null,
    aiGems: '슬픔 조각',
    createdAt: mockCollectedTime,
    entryMode: 'emotion_classification',
    classificationStatus: 'user_confirmed',
    aiEmotionCode: 'sadness',
    confirmedEmotionCode: 'sadness',
    confirmedEmotionCodes: ['sadness'],
    confirmedAt: mockCollectedTime,
    webReviewedAt: mockCollectedTime,
    updatedAt: mockCollectedTime,
    gemId: 'mock-gem-104',
    gemEmotionCode: 'sadness',
  },
  {
    // 두 번째 일상기록(감정 미지정) — 4개 이상에서도 전부 lake에 뜨는지 데모
    id: 105,
    gem: '일상기록',
    recordText: '점심으로 김밥을 먹고 잠깐 햇볕을 쬐었다. 그냥 그런 하루.',
    hasPhoto: false,
    imageUrl: null,
    aiGems: null,
    createdAt: mockDailyRecordTime2,
    entryMode: 'emotion_classification',
    classificationStatus: 'user_confirmed',
    aiEmotionCode: null,
    confirmedEmotionCode: null,
    confirmedEmotionCodes: [],
    confirmedAt: null,
    webReviewedAt: null,
    updatedAt: mockDailyRecordTime2,
    gemId: null,
    gemEmotionCode: null,
  },
  {
    id: 100,
    gem: '기쁨',
    recordText: '점심시간에 산책을 했더니 생각보다 기분이 좋아졌다.',
    hasPhoto: false,
    imageUrl: null,
    aiGems: '기쁨',
    questionId: 'q-joy-1',
    questionText: '그 순간 마음에 가장 오래 남은 장면은 무엇이었나요?',
    answerText: '햇빛이 좋았고 몸이 조금 가벼워졌어요.',
    linkedDate: mockYesterday.slice(0, 10),
    createdAt: mockYesterday,
    entryMode: 'emotion_classification',
    classificationStatus: 'user_confirmed',
    aiEmotionCode: 'joy',
    confirmedEmotionCode: 'joy',
    confirmedEmotionCodes: ['joy', 'pride'],
    confirmedAt: mockYesterday,
    webReviewedAt: mockYesterday,
    updatedAt: mockYesterday,
    gemId: 'mock-gem-100',
    gemEmotionCode: 'joy',
  },
];

let mockGems: GemDto[] = [
  {
    id: 'mock-gem-102-joy',
    emotionCode: 'joy',
    tier: 1,
    source: 'chatbot_emotion_classification',
    sourceMessageId: '102',
    craftedFrom: [],
    createdAt: mockRecords[1].createdAt,
  },
  {
    id: 'mock-gem-102-pride',
    emotionCode: 'pride',
    tier: 1,
    source: 'chatbot_emotion_classification',
    sourceMessageId: '102',
    craftedFrom: [],
    createdAt: mockRecords[1].createdAt,
  },
  {
    id: 'mock-gem-102-flutter',
    emotionCode: 'flutter',
    tier: 1,
    source: 'chatbot_emotion_classification',
    sourceMessageId: '102',
    craftedFrom: [],
    createdAt: mockRecords[1].createdAt,
  },
  {
    id: 'mock-gem-100',
    emotionCode: 'joy',
    tier: 1,
    source: 'chatbot_record',
    sourceMessageId: '100',
    craftedFrom: [],
    createdAt: mockRecords[2].createdAt,
  },
];

function mockRequest<T>(path: string, init: JsonInit): T | undefined {
  const [pathname, rawQuery = ''] = path.split('?');
  const params = new URLSearchParams(rawQuery);
  const method = init.method?.toUpperCase() ?? 'GET';

  if (pathname === '/me') {
    return {
      user: {
        id: 'dev-user',
        kakaoId: 0,
        nickname: '개발 사용자',
        profileUrl: null,
      },
      tickets: { date: new Date().toISOString().slice(0, 10), remaining: 5 },
    } as T;
  }

  if (pathname === '/auth/logout' && method === 'POST') {
    return { ok: true } as T;
  }

  if (pathname === '/me/provider-user-key' && method === 'POST') {
    return { ok: true, prev_user_id: null, backfilled_messages: 0 } as T;
  }

  if (pathname === '/inventory/gems') {
    const emotion = params.get('emotion');
    const tier = params.get('tier');
    const gems = mockGems.filter((gem) => {
      if (emotion && gem.emotionCode !== emotion) return false;
      if (tier && String(gem.tier) !== tier) return false;
      return true;
    });
    return { gems } as T;
  }

  if (pathname === '/inventory/stickers') {
    return { stickers: [] } as T;
  }

  if (pathname === '/field/today') {
    const today = new Date();
    const isToday = (iso: string) => {
      const date = new Date(iso);
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    };
    const todayGems = mockGems.filter((gem) => isToday(gem.createdAt));
    return {
      drops: todayGems.map((gem, index) => ({
        ...gem,
        position: {
          x: [0.26, 0.74, 0.5, 0.2, 0.8][index % 5],
          y: [0.62, 0.62, 0.22, 0.42, 0.42][index % 5],
        },
      })),
    } as T;
  }

  if (pathname === '/inventory/chatbot-records') {
    return {
      records: mockRecords.map(
        ({ id, gem, recordText, hasPhoto, imageUrl, aiGems, questionId, questionText, answerText, linkedDate, createdAt }) => ({
          id,
          gem,
          recordText,
          hasPhoto,
          imageUrl,
          aiGems,
          questionId,
          questionText,
          answerText,
          linkedDate,
          createdAt,
        }),
      ),
    } as T;
  }

  if (pathname === '/records') {
    const status = params.get('status');
    const limit = Number(params.get('limit') ?? 200);
    const records = mockRecords
      .filter((record) => !status || record.classificationStatus === status)
      .slice(0, Number.isFinite(limit) ? limit : 200);
    return { records } as T;
  }

  const confirmMatch = pathname.match(/^\/records\/(\d+)\/confirm-emotion$/);
  if (confirmMatch && method === 'POST') {
    const recordId = Number(confirmMatch[1]);
    const body = init.json as {
      emotionCode?: string;
      emotionCodes?: string[];
      interaction?: 'confirm' | 'reclassify';
      reflectionAnswer?: string;
    };
    const target = mockRecords.find((record) => record.id === recordId);
    if (!target || !body?.emotionCode) {
      throw new ApiError(404, 'RECORD_NOT_FOUND', { error: { code: 'RECORD_NOT_FOUND' } });
    }
    const codes = body.emotionCodes && body.emotionCodes.length > 0
      ? body.emotionCodes
      : [body.emotionCode];
    const primary = codes[0];

    const now = new Date().toISOString();
    const status: RecordClassificationStatus =
      body.interaction === 'reclassify' ? 'reclassified' : 'user_confirmed';
    const gemId = target.gemId ?? `mock-gem-${target.id}-${primary}`;
    target.classificationStatus = status;
    target.confirmedEmotionCode = primary;
    target.confirmedEmotionCodes = codes;
    target.confirmedAt = now;
    target.webReviewedAt = now;
    target.updatedAt = now;
    target.gemId = gemId;
    target.gemEmotionCode = primary;
    if (body.reflectionAnswer?.trim()) {
      target.questionText = '그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?';
      target.answerText = body.reflectionAnswer.trim();
    }

    const gems: GemDto[] = codes.map((code) => ({
      id: code === primary ? gemId : `mock-gem-${target.id}-${code}`,
      emotionCode: code,
      tier: 1,
      source: 'chatbot_record',
      sourceMessageId: String(target.id),
      craftedFrom: [],
      createdAt: now,
    }));
    const nextGemIds = new Set(gems.map((gem) => gem.id));
    mockGems = [...gems, ...mockGems.filter((item) => item.sourceMessageId !== String(target.id) && !nextGemIds.has(item.id))];
    mockRecords = [...mockRecords];

    return {
      ok: true,
      record: {
        id: target.id,
        classificationStatus: target.classificationStatus,
        confirmedEmotionCode: target.confirmedEmotionCode,
        confirmedEmotionCodes: target.confirmedEmotionCodes,
        confirmedAt: target.confirmedAt,
        webReviewedAt: target.webReviewedAt,
        updatedAt: target.updatedAt,
      },
      gem: {
        id: gems[0].id,
        emotionCode: gems[0].emotionCode,
        tier: gems[0].tier,
        createdAt: gems[0].createdAt,
      },
    } as T;
  }

  if (pathname === '/crafting/recipes') {
    return { recipes: [] } as T;
  }

  if (pathname === '/crafting/combine' && method === 'POST') {
    throw new ApiError(400, 'MOCK_RECIPE_UNAVAILABLE', {
      error: { code: 'MOCK_RECIPE_UNAVAILABLE' },
    });
  }

  if (pathname === '/events' && method === 'POST') {
    const body = init.json as { events?: unknown[] };
    return { ok: true, count: body.events?.length ?? 0 } as T;
  }

  return undefined;
}

export const api = {
  base: API_URL,

  setToken,
  getToken,

  loginUrl(kakaoHash?: string | null): string {
    const base = `${API_URL}/auth/kakao/login`;
    return kakaoHash ? `${base}?kakao_hash=${encodeURIComponent(kakaoHash)}` : base;
  },

  me: () => request<MeResponse>('/me'),

  setProviderUserKey: (key: string) =>
    request<{ ok: boolean; prev_user_id: string | null; backfilled_messages: number }>(
      '/me/provider-user-key',
      { method: 'POST', json: { providerUserKey: key } },
    ),

  chatbotRecords: (limit = 50) =>
    request<{ records: ChatbotRecordDto[] }>(
      `/inventory/chatbot-records?limit=${limit}`,
    ),

  records: (params?: { limit?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    const suffix = qs.toString();
    return request<{ records: RecordDto[] }>(`/records${suffix ? `?${suffix}` : ''}`);
  },

  createSelfReflection: (body: {
    questionText: string;
    answerText: string;
    linkedDate?: string;
  }) =>
    request<{ ok: boolean; record: RecordDto }>('/records/reflection', {
      method: 'POST',
      json: body,
    }),

  confirmRecordEmotion: (
    recordId: number,
    body: {
      emotionCode: string;
      emotionCodes?: string[];
      interaction?: 'confirm' | 'reclassify';
      reflectionType?: 'question' | 'meditation' | 'none';
      reflectionAnswer?: string;
    },
  ) =>
    request<{
      ok: boolean;
      record: RecordDto;
      gem: { id: string; emotionCode: string; tier: 1 | 2 | 3 | 4; createdAt: string };
    }>(`/records/${recordId}/confirm-emotion`, { method: 'POST', json: body }),

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
