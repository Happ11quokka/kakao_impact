# 아보하 (Avoha) — 시스템 아키텍처

> 카카오톡 기반 청년 감정인지 서비스의 기술 아키텍처 문서.
> 담당(AI · 백엔드/인프라): 임동현. 본 문서는 **실제 배포된 시스템(Python)** 을 기준으로 기술하며, 초기 설계(Node)와의 차이를 명시합니다.

## 1. 설계(Designed) vs 배포(Shipped)

이 레포에는 **두 개의 아키텍처**가 공존합니다. 포트폴리오/문서는 어느 쪽이 실제인지 정확히 구분합니다.

| | 초기 설계 (README/PRD) | 실제 배포 |
|---|---|---|
| 백엔드 | Node 22 + Fastify + Drizzle | **Python FastAPI + SQLAlchemy 2.0(async) + Alembic** |
| AI | TS BullMQ 워커(`ai/agent`) 4종 + Gemini | **Python 카카오 챗봇(`ai/chatbot/main.py`, ~2,956 LOC) + OpenAI `gpt-4.1-mini`** |
| 큐 | Redis + BullMQ `emotion-queue` | 라이브 경로에 큐 없음 — 챗봇이 동기/콜백으로 분류 |

**근거:** `ai/agent/src/index.ts`는 `./workers/emotion-classifier` 등을 import 하지만 해당 워커 파일들이 존재하지 않습니다(스캐폴드). 반면 backend의 `nixpacks.toml`·`railway.json`·`requirements.txt`·Alembic 마이그레이션은 모두 Python이며, `backend/migrate.py`는 **Drizzle이 만든 DB 위에 Alembic baseline을 stamp**하는 로직을 담고 있어 Node→Python 피벗이 라이브 DB 위에서 일어났음을 증명합니다.

---

## 2. 시스템 구성도

```
        ┌──────────────────────── KakaoTalk 사용자 ────────────────────────┐
        │                                                                   │
        ▼ (채팅: 텍스트/사진)                                  ▼ (모바일 웹, Kakao OAuth)
  Kakao i 오픈빌더                                        frontend (PWA)
        │  POST /webhook                                  Vite6 / React19 / TS / Tailwind4
        ▼                                                        │  HTTP + SSE
  ┌──────────────────────────────┐                       ┌───────┴────────────────────┐
  │ ai/chatbot (FastAPI, Py3.12) │   공유 Postgres        │ backend (FastAPI, Py3.12)  │
  │  - 5초 callback 우회          │◀──────┬──────────────▶│  - REST /records /inventory│
  │  - classify_emotion (GPT)    │       │               │    /crafting /field /me    │
  │  - supervisor_check (GPT)    │       │               │  - /sse/inventory (live)   │
  │  - save_gem() → chatbot+gems │       │               │  - /webhook/kakao (WoZ)    │
  │  - 사진 → Railway Volume      │       │               │  - /ops/* 운영 콘솔         │
  └──────────────────────────────┘       │               └───────────┬────────────────┘
                                          ▼                           │ HTTP (내부, 설계)
                              ┌───────────────────────┐               ▼
                              │ Railway PostgreSQL     │       ┌──────────────────┐
                              │ chatbot, gems, users,  │       │ ai/rembg(FastAPI)│ ← 스캐폴드
                              │ emotions, events, ...  │       │  + rembg u2net   │
                              └───────────────────────┘       └──────────────────┘
                              ┌───────────────────────┐
                              │ Railway Redis          │  ← 분석 pub/sub · 레이트리밋
                              │ (BullMQ는 설계만)       │     (라이브 경로에 BullMQ 없음)
                              └───────────────────────┘
```

라이브 Railway 프로젝트: `intelligent-wholeness` (별칭 **avoha**) — 서비스: **backend / frontend / chatbot / Postgres / Redis**. (rembg · ai/agent는 라이브 서비스 집합에 없음)

---

## 3. 컴포넌트 & 스택

| 컴포넌트 | 경로 | 스택 (정확) |
|---|---|---|
| 프론트엔드 | `2_Ulog/frontend/` | Vite 6, React 19, TS ~5.7, Tailwind v4, Zustand 5, React Router 7, Framer Motion 12, Recharts 2.15, web-vitals 4, PWA. 테스트: Vitest 3 + Testing Library + Playwright |
| 백엔드 | `2_Ulog/backend/` | FastAPI 0.115, Uvicorn 0.34, SQLAlchemy 2.0.36[asyncio], asyncpg 0.30, Alembic 1.14, Pydantic 2.10, sse-starlette 2.2, redis 5.2(async), Starlette SessionMiddleware, structlog, sentry-sdk |
| AI 챗봇 (라이브) | `2_Ulog/ai/chatbot/` | FastAPI, Uvicorn, requests, psycopg2-binary(raw SQL), python-dotenv. 모델: OpenAI `gpt-4.1-mini` |
| AI 에이전트 (설계) | `2_Ulog/ai/agent/` | Node 22 + TS, BullMQ 5, openai 4, @google/generative-ai, Zod, Pino, ioredis, pg — *미배포* |
| AI 누끼 (스캐폴드) | `2_Ulog/ai/rembg/` | Python, FastAPI, rembg(u2net_lite, CPU), Pillow, boto3 — *미배포* |
| 디자인 | `2_Ulog/design/` | Figma, Kenney 1-Bit/RPG 스프라이트, 커스텀 픽셀 원석(PNG 16×16/32×32) |
| 운영 | `2_Ulog/ops/`, `2_Ulog/ai/ops/scripts/` | 운영 콘솔(웹) + TS 스크립트(`export-training-data.ts` 등), 라이브 운영은 backend `/ops/*` Basic-Auth |

---

## 4. AI 감정분류 파이프라인

### 4.1 택소노미 — 25 → 5 → 10

**챗봇 어휘(UX): 25감정 / 5계열** (`ai/chatbot/main.py:520` `EMOTION_CATEGORIES`, `:472` `EMOTION_TO_GEM`)

| 계열 | 25감정 |
|---|---|
| 슬픔 | 우울함, 외로움, 상실감, 서러움, 실망감 |
| 불안/두려움 | 걱정, 긴장감, 위축감, 초조, 공포 |
| 분노 | 짜증, 억울함, 화남, 적대감, 경멸 |
| 기쁨/긍정 | 즐거움, 감사함, 설렘, 뿌듯함, 편안함 |
| 복잡/모호 | 무기력함, 공허함, 후회, 부끄러움, 혼란스러움 |

**표준 감정코드(데이터): 10코드** (`backend/app/seeds/emotions.py`, PK=`code`, 3 카테고리)

- `calm`: untroubled, serenity
- `happy`: pride, joy, satisfaction, flutter
- `negative`: sadness, annoyance, regret, solace

**브릿지:** `CHATBOT_GEM_TO_EMOTION_CODE` (`main.py:487`) — 25개 챗봇 조각이 10코드로 collapse (예: 외로움/상실감/서러움/실망감 → `sadness`, 분노 계열 → `annoyance`, 걱정/긴장감/공포 → `solace`). 챗봇은 25감정으로 말하지만 `gems` 인벤토리엔 10코드만 기록 = **크로스 컴포넌트 공유 계약**.

### 4.2 분류 흐름 (2단계, 둘 다 gpt-4.1-mini)

`classify_emotion_with_supervisor()` (`main.py:1010`):

1. **`classify_emotion()`** (`:825`) — 단일 프롬프트 LLM 호출. `기록아님`(NOT_RECORD) / `일상기록`(DAILY_RECORD) / 최대 3개 감정 중 결정. 수작업 튜닝된 뉘앙스 규칙(울컥→서러움, 억울함은 불공정 단서일 때만 등) + `normalize_text_for_classification` 오타 보정.
2. **`supervisor_check_classification()`** (`:923`, `SUPERVISOR_ENABLED` 게이트) — 2차 검증 노드. 시나리오 목표와 대조해 과분류(사실의 감정 오태깅)를 교정. 예외/타임아웃 시 **1차 결과로 폴백**(graceful degradation).
3. 반환: `list[str]`(gem 이름 ≤3) | `NOT_RECORD` | `DAILY_RECORD` | `TIMEOUT` | `None`.

모델은 라이브에서 OpenAI `gpt-4.1-mini` 단일 (Gemini 2.5 Flash는 `ai/agent` 설계에만). temperature 0.

### 4.3 비동기/콜백

카카오 웹훅은 **5초 응답 제한**. `callbackUrl` 존재 시 즉시 `{"version":"2.0","useCallback":true}` 반환 → FastAPI `BackgroundTasks`로 분류 → 최종 카드를 `callbackUrl`로 POST. 콜백 없으면 동기 분류. **라이브에 BullMQ 없음** (PRD의 `emotion-queue` 등은 미배포).

### 4.4 confirmed vs reviewed (정확도 측정)

- `save_gem()` (`main.py:1066`)이 `chatbot`을 INSERT 할 때 **`ai_emotion_code`와 `confirmed_emotion_code`를 같은 값으로 prefill** → `confirmed_emotion_code`는 사람 확정의 증거가 아님.
- 진짜 신호는 **`web_reviewed_at`** (PWA에서 리뷰 전엔 NULL). 웹 리뷰 `POST /records/{id}/confirm-emotion` (`backend/app/routes/records.py:183`)이 `confirmed_emotion_code(s)` 갱신 + `classification_status` → `user_confirmed`/`reclassified` + `web_reviewed_at = now` 스탬프 후 `sse_bus.publish`.
- **진짜 재분류율** = `web_reviewed_at IS NOT NULL` AND `classification_status='reclassified'`. 분석: [`chatbot-accuracy-analysis.md`](chatbot-accuracy-analysis.md).

### 4.5 전수 관측성 & 안전

- **관측성:** `chatbot_messages`(웹훅 턴, `trace_id`) / `chatbot_llm_calls`(프롬프트·raw 응답 JSONB·파싱결과·status·latency_ms·call_type ∈ classify|supervisor|emotion_analysis) / `chatbot_errors`(traceback). `trace_id`로 3 테이블 상관.
- **안전:** `DANGER_KEYWORDS`(자해) → 위기 핫라인(자살예방 1393, 1577-0199) + 운영자 메일 알림; `HARMFUL_KEYWORDS` → 거부. 키워드 사전 필터를 웹훅 경로에 인라인.

---

## 5. 백엔드 · 인프라

### 5.1 앱 와이어링 (`backend/app/main.py`)
FastAPI 0.115, async lifespan(엔진·Redis 정리). `SessionMiddleware` 쿠키 `avoha_sid`(prod: SameSite=None+Secure 크로스도메인). CORS는 `FRONTEND_URL` 한정 + credentials. 통일된 에러 envelope `{"error":{"message","code"}}`. 라우터: health, auth, me, webhook, inventory, crafting, ops, records, sse, events, field, ops_analytics. Pydantic-Settings 검증(`SESSION_SECRET`=64 hex), `DEMO_RECORDS_FALLBACK` 게이트.

### 5.2 데이터 모델 (`backend/app/db/models.py`, Alembic 0001~0010)
Postgres, UUID PK(`gen_random_uuid()`), JSONB, ARRAY, `events.props` GIN 인덱스.

- **`users`** — kakao_id, nickname, `provider_user_key`(Kakao 오픈빌더 해시 = 챗봇 조인키), consent_version, soft-delete.
- **`emotions`** — 10코드 카탈로그(code PK, name_ko, category, gem_name, hex_color, trigger_keywords[]).
- **`gems`**(원석) — emotion_code FK, tier, source(`chatbot`), `source_chatbot_id`, `crafted_from` UUID[].
- **`kakao_messages`** — PRD WoZ ingestion: content_type, body, media_url, status(pending→proposed→confirmed), `ai_suggestion` JSONB, `provider_message_id`(unique dedupe).
- **`chatbot`** — 라이브 챗봇 전용 테이블(raw-SQL): user_id=provider_user_key, gem, record_text, image_url(S3)+kakao_image_url(CDN 백업), ai_gems, `entry_mode`(default `emotion_classification`), `classification_status`, `ai_emotion_code`, `confirmed_emotion_code(s)`, `web_reviewed_at`, `trace_id`, reflection Q/A, `linked_date`.
- **`chatbot_messages` / `chatbot_llm_calls` / `chatbot_errors`** — 감사 로그(§4.5).
- **`stickers`** — image_url, polaroid_fallback (rembg 출력 대상).
- **`recipes` / `crafting_events`** — 세공 시스템(`RECIPES_SEED` 현재 비어있음, PRD v1.1 대기).
- **`events`** — 분석(event_type, props JSONB+GIN, occurred_at). 프라이버시: `bodyLength`·`hasMedia`만 저장, 원문 비저장.
- **`collection_tickets`** — 일 5 채집권. **`anon_user_links`** — 익명→유저 매핑.

### 5.3 SSE (`routes/sse.py` + `services/sse_bus.py`)
`GET /sse/inventory`(sse-starlette `EventSourceResponse`), 쿼리 `token` 또는 세션 쿠키 인증. **인프로세스 pub/sub**(`defaultdict[user_id → set[Queue]]`, `put_nowait` maxsize=256, QueueFull 시 drop — 인벤토리는 pull로 복구 가능). 25s heartbeat. 단일 프로세스 fan-out(수평 확장 시 Redis pub/sub 필요).

### 5.4 Redis (`services/redis.py`)
단일 async `Redis.from_url`(lazy singleton). 분석 카운터/pub-sub + 레이트리밋. **라이브 경로에서 BullMQ 브로커 아님.**

### 5.5 Kakao webhook — 2경로
1. **라이브(chatbot):** Kakao 오픈빌더 → `ai/chatbot` `POST /webhook` → 콜백 패턴 → `chatbot` 테이블(+provider_user_key 해석 시 `gems`).
2. **설계(backend WoZ):** `backend/routes/webhook.py` `POST /webhook/kakao` — HMAC(`hmac.compare_digest`), Kakao Biz 페이로드 정규화, `provider_message_id` 멱등 dedupe, `kakao_messages(status=pending)` + `events('chatbot.question.sent')`(프라이버시 props). 운영 `/ops/*` 콘솔 + AI-suggestion = PRD WoZ 설계.

---

## 6. 데이터 흐름 (end-to-end, 라이브)

```
1. 사용자가 카카오톡으로 텍스트/사진 전송
2. Kakao 오픈빌더 → POST /webhook (ai/chatbot)
3. 챗봇이 5초 내 {useCallback:true} 반환 + inbound를 chatbot_messages(trace_id)에 기록
4. BackgroundTask: classify_emotion(gpt-4.1-mini) → supervisor_check(gpt-4.1-mini)
     → 각 호출을 chatbot_llm_calls에 기록
5. 결과 분기: NOT_RECORD / DAILY_RECORD / ≤3 감정
     → basicCard + quick-replies를 callbackUrl로 POST ("이 원석으로 저장?")
6. 사진은 pending_photo(10분 TTL)에 보관 → 저장 시 Railway Volume 업로드, 실패 시 Kakao CDN URL 폴백
7. 사용자 확정 → save_gem():
     INSERT chatbot(ai_emotion_code = confirmed_emotion_code = <code>, trace_id, ...)
     provider_user_key → users.id 해석되면 INSERT gems(emotion_code, tier=1, source='chatbot')
8. 사용자가 PWA 진입(Kakao OAuth) → backend REST:
     GET /records, /inventory/gems, /field/today  +  GET /sse/inventory (실시간)
9. 웹 리뷰: POST /records/{id}/confirm-emotion (confirm|reclassify)
     → confirmed_emotion_code(s), classification_status, web_reviewed_at=now
     → sse_bus.publish → PWA 인벤토리 실시간 갱신
10. events 테이블 + 분석(Redis pub/sub, GIN props) → 운영 대시보드(/ops/analytics)
```

(PRD 설계 확장, 미배포: kakao_messages → emotion-queue → ai/agent → ai_suggestion → 운영자 1-click 확정 → gems + 채집권−1 → rembg 스티커)

---

## 7. 배포 (Railway)

### 7.1 3중 Python 3.12 핀
두 Python 서비스 모두 Python 3.12를 **3중으로 핀**: (1) `.python-version`, (2) `NIXPACKS_PYTHON_VERSION="3.12"`, (3) `nixPkgs=["python312","gcc"]` (`[phases.setup]`), + `railway.json`의 `"builder":"NIXPACKS"`.

**이유:** Railway 기본 railpack+mise 빌더가 Python을 최신 패치로 floating → 프리빌드 바이너리 없는 패치(예: 3.13.x)에서 빌드가 깨지고, Railway가 이를 **"Deploy failed"로 표시하지만 실은 build 실패**. 백엔드 시작: `python migrate.py && python -m app.seed && uvicorn app.main:app`. Healthcheck `/health`, 300s 타임아웃, ON_FAILURE×3.

### 7.2 마이그레이션 스토리 (`backend/migrate.py`)
DB는 원래 Drizzle(폐기된 Node 설계)이 생성. `migrate.py`가 Drizzle DB를 감지(`__drizzle_migrations__` / `alembic_version` 없는 `users` 테이블)하면 **Alembic head를 stamp**, 아니면 `alembic upgrade head`. `app/seed.py`가 emotions/recipes를 idempotent upsert. **라이브 DB 위 무중단 ORM 스왑.**

---

## 8. 주요 엔지니어링 결정

1. **Railway 3중 Python 3.12 핀** — floating 빌더가 일으킨 build 실패 진단·해결 (`524d5f8`).
2. **라이브 ORM 스왑** — Drizzle 생성 DB를 Python/SQLAlchemy가 무중단·무손실 인수.
3. **confirmed_emotion_code prefill 함정** — `web_reviewed_at` 기반 정직한 정확도 측정.
4. **2단계 LLM + Supervisor + graceful degradation** — 단일 저가 모델 temp0.
5. **trace_id 전수 관측성** — WoZ 실행을 라벨 코퍼스로.
6. **모드 이분화** — `entry_mode`(대화/단순), 다중 감정(≤3), 재분류, 회고 후속 질문.
7. **카카오 5초 callback 아키텍처** — pending 캐시로 "오늘 n번째" 넘버링 유지.
8. **정직한 데모 시딩** — `seed_demo_records.py`가 실제 분류기를 통과, `uuid5` trace_id, `--clean`.
9. **분석 프라이버시** — 웹훅 이벤트에 `bodyLength`/`hasMedia`만, 원문은 감사 테이블에만.

---

## 9. 핵심 파일 레퍼런스

- **AI 파이프라인:** `2_Ulog/ai/chatbot/main.py` (`:472` 택소노미, `:487` 코드 브릿지, `:825` classify, `:923` supervisor, `:1066` save_gem), `ai/chatbot/persist.py`, `ai/chatbot/seed_demo_records.py`
- **백엔드:** `2_Ulog/backend/app/main.py`, `app/config.py`, `app/db/models.py`, `app/routes/{webhook,sse,records,ops}.py`, `app/services/{sse_bus,redis}.py`, `app/seeds/emotions.py`, `migrate.py`, `nixpacks.toml`, `railway.json`
- **설계(미배포):** `2_Ulog/ai/agent/` (TS BullMQ 스캐폴드), `2_Ulog/ai/rembg/`
- **문서:** `docs/avoha/2026-04-17-avoha-prd.md`, `docs/chatbot-accuracy-analysis.md`, `docs/chatbot-experience-analysis.md`
