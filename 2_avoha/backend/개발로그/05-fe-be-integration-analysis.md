# 05 · FE↔BE↔AI Chatbot 최신 통합 현황

- **최종 업데이트**: 2026-05-17 11:10 KST
- **파트**: Frontend + Backend + AI Chatbot + Railway 운영
- **상태**: 최신화 완료. 이 문서는 현재 배포/코드 기준의 통합 현황을 보는 기준 문서다.
- **기준 소스**:
  - Railway production 상태: `intelligent-wholeness`
  - backend Swagger: `https://backend-production-3172.up.railway.app/docs`
  - frontend: `https://frontend-production-09f81.up.railway.app`
  - chatbot assets/docs: `https://chatbot-production-367e8.up.railway.app/docs`

## 이 문서의 목적

이전 버전의 05번 문서는 2026-05-07 시점의 FE↔BE 진단 문서였다. 이후 FE 복구, chatbot 기능 확장, FastAPI Swagger 개선, Railway 재배포가 이어져 현재 상태와 맞지 않는 내용이 많아졌다.

이 문서는 지금 기준으로 다음을 한 곳에서 확정한다.

1. Railway production에 떠 있는 서비스와 각 서비스의 역할
2. FE가 실제로 호출하는 Backend API
3. AI chatbot이 어떤 테이블을 쓰고 Backend/Frontend와 어떻게 이어지는지
4. 현재 문서/코드/배포 사이에 남아 있는 불일치와 다음 우선순위

## Railway production 서비스

`railway service status --all --environment production` 기준:

| 서비스 | 상태 | 최신 deployment | 역할 |
|---|---:|---|---|
| `frontend` | SUCCESS | `0c4f9ba9-bf26-495b-8dac-8f9b5f3aa0a1` | Vite/React 사용자 앱 |
| `backend` | SUCCESS | `9df259d5-cfde-4fcb-b98f-91cc18cea083` | FastAPI REST/SSE API, OAuth, inventory, field, crafting, ops |
| `chatbot` | SUCCESS | `bc6e253e-69fc-4bce-9f18-71d6c8ca0a54` | 카카오 오픈빌더 스킬 서버, OpenAI 분류, 기록 저장 |
| `Postgres` | SUCCESS | `4430cf1b-4588-48a0-8322-baf94ce77c29` | 공용 DB |
| `Redis` | SUCCESS | `ec5d66d5-eb65-45a6-b7a3-45fb3ff52203` | backend readiness/SSE·큐 인프라용 |

현재 production 프로젝트 상태만 보면 `ai/agent`와 `ai/rembg`는 별도 Railway 서비스로 떠 있지 않다. 로컬 문서에는 `avoha-agent`, `avoha-rembg` 계획/구현 흔적이 있지만, 현재 production의 실제 서비스 목록은 위 5개다.

## 한 장 아키텍처

```text
카카오톡 사용자
  -> 카카오 i 오픈빌더
  -> chatbot FastAPI POST /webhook
     -> OpenAI 분류 + supervisor 검증
     -> chatbot / chatbot_messages / chatbot_llm_calls / chatbot_errors 저장
     -> users.provider_user_key 매핑이 있으면 gems에도 동기화
     -> 사진은 Railway Volume /photos로 영구화 시도

웹 사용자
  -> frontend React
  -> backend FastAPI
     -> Kakao OAuth 로그인
     -> /me, /inventory/*, /field/today, /crafting/*, /events
     -> Postgres에서 users/gems/chatbot/collection_tickets 조회
```

핵심 연결 키는 `users.provider_user_key`다.

- 카카오 OAuth 사용자 식별자: `users.kakao_id`
- 카카오 오픈빌더 사용자 해시: `provider_user_key`
- chatbot 원본 기록: `chatbot.user_id == users.provider_user_key`
- 웹 인벤토리 보석: `gems.user_id == users.id`

## 인증과 사용자 연결

### OAuth 로그인

현재 Backend는 Kakao OAuth 콜백 성공 시 FE를 아래 URL로 보낸다.

```text
{FRONTEND_URL}/login/callback#token={jwt}
```

FE는 fragment의 token을 `localStorage.avoha_token`에 저장하고 이후 모든 REST API에 Bearer 헤더를 붙인다.

```http
Authorization: Bearer <token>
```

Railway의 `*.up.railway.app` 도메인 분리에서는 쿠키 인증이 안정적이지 않다. 현재 FE의 기본 인증 경로는 Bearer token이다.

### chatbot 연결

챗봇에서 웹으로 넘어올 때 `?kakao_hash=`가 붙는다.

- 토큰이 이미 있으면 `Login.tsx`가 `POST /me/provider-user-key`를 호출해 즉시 연결한다.
- 토큰이 없으면 로그인 버튼의 `GET /auth/kakao/login?kakao_hash=...` URL에 해시를 실어 보낸다.
- Backend는 OAuth `state`에 서명된 해시를 담고, 콜백에서 `users.provider_user_key`를 설정한다.

`LoginCallback.tsx` 자체는 token 저장 후 `fetchMe()`만 수행한다. provider key 연결은 `Login.tsx` 또는 Backend OAuth callback 쪽이 맡는다.

## FE가 실제로 쓰는 Backend API

| 화면/흐름 | API | 현재 상태 | 비고 |
|---|---|---|---|
| 로그인 진입 | `GET /auth/kakao/login?kakao_hash=` | 사용 중 | 브라우저 redirect 전용 |
| 로그인 콜백 | `GET /me` | 사용 중 | fragment token 저장 후 사용자 확인 |
| AuthGate | `GET /me` | 사용 중 | token 없으면 `/login` |
| Home 상단 채집권 | `GET /me` | 사용 중 | `collection_tickets.remaining` 표시 |
| Home 필드 원석 | `GET /field/today` | 사용 중 | 오늘 생성된 미소모 `gems` + 0..1 좌표 |
| Home 카테고리 카드 먹이기 | FE local state | 사용 중 | `consumeGem()`은 서버 동기화 없음 |
| Calendar | `GET /inventory/gems`, `GET /inventory/chatbot-records?limit=200` | 사용 중 | 기록은 provider key 연결 필요 |
| Analysis | `GET /inventory/gems`, `GET /inventory/chatbot-records?limit=200` | 사용 중 | 기록 텍스트는 날짜 기준 매칭 |
| Inventory/Workshop | `GET /inventory/gems`, `GET /inventory/stickers`, `GET /crafting/recipes`, `POST /crafting/combine` | 사용 중 | 세공 성공 후 인벤토리 reload |
| Settings | `GET /me`, `POST /auth/logout` | 사용 중 | logout 후 local token 삭제 |
| SSE | `GET /sse/inventory` | 클라이언트 함수만 있음 | 실제 호출 지점 없음. EventSource는 Bearer 헤더를 못 보냄 |
| Events | `POST /events` | API client 있음 | 화면별 호출은 제한적 |

상세 API 계약은 Markdown 문서가 아니라 Swagger/OpenAPI가 기준이다.

## Backend 현재 상태

### 배포 검증

2026-05-17 배포 후 확인:

| 체크 | 결과 |
|---|---|
| `/health` | 200, `{"status":"ok"}` |
| `/health/ready` | 200, DB OK, Redis OK |
| `/docs` | 200 |
| `/openapi.json` | `Avoha Backend API`, 20 paths, 41 schemas, `BearerAuth` 노출 |
| 최신 deployment 로그 | migration, seed, uvicorn startup 정상 |

### Swagger/FastAPI 문서

2026-05-17에 Swagger 문서를 프론트가 읽기 쉬운 형태로 개선했다.

- `app/schemas.py`: 요청/응답 Pydantic schema 추가
- 각 route: `response_model`, `summary`, `description`, error response 추가
- `app/deps.py`: Swagger `Authorize`용 `BearerAuth` security scheme 추가
- `app/main.py`: FE 연동 기준, 화면별 API 매핑, 태그 설명 추가
- Swagger/OpenAPI: 프론트용 계약과 통합 설명을 Swagger 상단/태그/엔드포인트 설명에 직접 반영

배포 URL:

```text
https://backend-production-3172.up.railway.app/docs
```

## AI chatbot 현재 상태

### 서비스 역할

`2_avoha/ai/chatbot/main.py`는 독립 FastAPI 앱이다. Railway `chatbot` 서비스에서 `Procfile` 기반으로 실행된다.

```text
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

주요 route:

| Method | Path | 용도 |
|---|---|---|
| `POST` | `/webhook` | 카카오 오픈빌더 메인 스킬 URL |
| `POST` | `/skill/check-question` | 회고 질문 필요 여부 판단 |
| `POST` | `/skill/save-reflection` | 회고 답변 저장 |
| `GET` | `/docs` | FastAPI 자동 문서 |
| `GET` | `/gems/*` | 원석 카드 이미지 정적 제공 |
| `GET` | `/photos/*` | Railway Volume 사진 정적 제공 |

### 입력 처리 흐름

```text
POST /webhook
  -> trace_id 생성
  -> inbound raw body를 chatbot_messages에 저장
  -> 위험/유해 키워드 즉시 처리
  -> 사진/텍스트/pending 상태 해석
  -> classify_emotion()
  -> supervisor_check_classification()
  -> 카카오 응답 생성
  -> 저장 확정 시 save_gem()
```

콜백 모드에서는 카카오 5초 제한을 피하기 위해 먼저 `useCallback: true`를 반환하고, `BackgroundTasks`에서 최종 응답을 callback URL로 보낸다.

### 저장 모델

chatbot은 현재 여러 테이블에 직접 쓴다.

| 테이블 | 쓰는 주체 | 용도 |
|---|---|---|
| `chatbot` | chatbot | 사용자 확정 기록 원본. `user_id`는 provider user key |
| `gems` | chatbot, backend | 웹 인벤토리에서 보는 보석. provider key가 users row와 매핑될 때 chatbot이 insert |
| `chatbot_messages` | chatbot | webhook inbound/outbound raw body 영구 로그 |
| `chatbot_llm_calls` | chatbot | classify/supervisor/emotion_analysis LLM 호출 로그 |
| `chatbot_errors` | chatbot | 잡힌 예외와 context 로그 |
| `collection_tickets` | backend | `/me`의 채집권 표시. 현재 chatbot은 직접 차감하지 않음 |

### 사진 저장

사진 URL은 저장 확정 시 `volume_uploader.upload_kakao_photo()`를 거친다.

- `PHOTO_VOLUME_PATH`와 `PHOTO_PUBLIC_BASE_URL`이 있으면 Railway Volume에 다운로드 후 `/photos/...` URL로 저장
- 실패하거나 Volume 미설정이면 카카오 CDN URL을 fallback으로 저장
- `chatbot.image_url`: 앱/캘린더가 쓰는 URL
- `chatbot.kakao_image_url`: 원본 카카오 CDN 백업
- `chatbot.trace_id`: `chatbot_messages`, `chatbot_llm_calls`, `chatbot_errors`와 추적 연결

### 오늘 기록 횟수와 채집권

중요: 06번 로그의 “chatbot이 `collection_tickets`를 직접 차감한다”는 설명은 현재 코드 기준으로는 최신이 아니다.

현재 `main.py`에는 `collection_tickets` 차감 헬퍼가 없다. 대신 `_db_get_today_count(user_id)`가 `chatbot` 테이블에서 오늘(KST) 저장된 원석 수를 계산한다.

```sql
SELECT COUNT(*) FROM chatbot
WHERE user_id = %s
  AND gem != '일상기록'
  AND (created_at AT TIME ZONE 'Asia/Seoul')::date = %s
```

따라서 현재 의미는 다음과 같다.

| 항목 | 현재 source of truth |
|---|---|
| 챗봇 응답의 “오늘 N번째 원석” | `chatbot` 테이블 count |
| 웹 Home의 “채집권 X/5” | `collection_tickets.remaining` |
| 실제 원석 획득 제한 | chatbot 코드에서 채집권 차감 방식이 아니라 기록 횟수 안내 중심 |

즉 “채집권”이라는 제품 언어는 FE/BE에 남아 있지만, chatbot 최신 흐름은 채집권 차감보다 오늘 기록 횟수 카운터에 가깝다. 이 부분은 다음 제품 결정이 필요하다.

## 감정 코드 매핑 현황

Backend seed의 emotion code는 10개다.

| Backend category | code |
|---|---|
| calm | `untroubled`, `serenity` |
| happy | `pride`, `joy`, `satisfaction`, `flutter` |
| negative | `sadness`, `annoyance`, `regret`, `solace` |

chatbot은 20개 원석 이름을 쓴다. `CHATBOT_GEM_TO_EMOTION_CODE`가 이를 Backend 10개 code로 압축 매핑한다.

예:

| chatbot 원석 | Backend emotion code |
|---|---|
| `뿌듯함 조각` | `pride` |
| `즐거움 조각` | `joy` |
| `감사함 조각` | `satisfaction` |
| `걱정 조각`, `긴장감 조각`, `위축감 조각` | `solace` |
| `짜증 조각`, `억울함 조각`, `화남 조각`, `적대감 조각` | `annoyance` |
| `우울함 조각`, `외로움 조각`, `상실감 조각`, `서러움 조각`, `실망감 조각` | `sadness` |

FE는 5대 카테고리 UI를 쓴다.

| FE category | 대표 의미 |
|---|---|
| `sadness` | 슬픔 |
| `anxiety` | 불안 |
| `anger` | 분노 |
| `joy` | 기쁨 |
| `complex` | 복잡 |

주의할 점:

- Backend seed에는 `anxiety` code가 없다.
- FE의 `emotion-category.ts`가 Backend code를 5대 UI 카테고리로 재분류한다.
- chatbot 20개 원석과 Backend 10개 emotion code, FE 5대 category는 1:1 구조가 아니다.
- CollectionBook 도감이 “진짜 도감”이 되려면 `GET /catalog/emotions` 또는 별도 catalog contract가 필요하다.

## 현재 동작하는 통합 시나리오

### 1. 카카오 챗봇에서 기록 저장

1. 사용자가 카카오톡에 텍스트/사진을 보낸다.
2. chatbot `/webhook`이 OpenAI 분류와 supervisor 검증을 수행한다.
3. 사용자가 저장을 확정하면 `chatbot` 테이블에 원본 기록을 저장한다.
4. `users.provider_user_key`가 연결돼 있으면 같은 DB의 `gems`에도 tier 1 보석을 추가한다.
5. FE의 Calendar/Analysis/Home은 Backend API를 통해 `gems`와 `chatbot` 기록을 조회한다.

### 2. 챗봇에서 웹으로 연결

1. 챗봇 카드/버튼이 FE 로그인 URL로 보낸다.
2. URL에 `kakao_hash`가 있으면 FE/Backend가 provider key 연결을 처리한다.
3. 연결 후 `GET /inventory/chatbot-records`가 빈 배열이 아니라 사용자의 기록을 반환한다.

### 3. 웹에서 원석 확인

1. AuthGate가 token을 확인한다.
2. `GET /me`로 사용자와 `tickets.remaining`을 로드한다.
3. `GET /inventory/gems`로 보석 목록을 로드한다.
4. `GET /field/today`로 오늘 보석의 필드 좌표를 로드한다.
5. Calendar/Analysis는 `GET /inventory/chatbot-records?limit=200`도 함께 읽는다.

## 현재 주의해야 할 불일치

### 1. 채집권 product contract가 흔들린다

현재 코드 기준:

- Backend `/me`는 `collection_tickets.remaining`을 반환한다.
- Home은 이를 “채집권 X/5”로 표시한다.
- chatbot은 `collection_tickets`를 차감하지 않고 `chatbot` 테이블 count로 “오늘 N번째 원석”을 말한다.

결정 필요:

| 선택 | 의미 |
|---|---|
| A. 채집권 유지 | chatbot이 다시 `collection_tickets`를 원자적으로 차감해야 함 |
| B. 오늘 기록 횟수로 전환 | FE/BE의 `tickets` UI와 API 이름을 정리해야 함 |
| C. 웹은 채집권, 챗봇은 기록 횟수 | 사용자에게 서로 다른 개념임을 명확히 표시해야 함 |

### 2. Home의 먹이기/소비는 로컬 전용

Home 카테고리 카드 탭은 `useInventoryStore.consumeGem()`과 `usePetStore.feedGem()`을 호출한다. 이 소비는 현재 FE local state에만 반영된다.

- `gems.consumed_at` 서버 반영 없음
- 새로고침/재조회 시 서버 미소모 보석이 다시 보일 수 있음
- pet 상태는 `localStorage`의 `avoha-pet`으로만 유지됨

서버 영구화가 필요하면 `PATCH /inventory/gems/{id}/consume` 또는 pet sync API가 필요하다.

### 3. SSE는 contract만 있고 실사용이 약하다

Backend에는 `/sse/inventory`가 있고 FE에는 `subscribeInventory()`가 있다. 그러나 현재 FE에서 해당 함수를 호출하는 지점이 없다.

또한 브라우저 기본 `EventSource`는 `Authorization` 헤더를 보낼 수 없다. 현재 구현은 `withCredentials: true`에 의존하는데, Railway 도메인 분리에서는 쿠키 인증이 막힐 수 있다.

사용하려면 다음 중 하나가 필요하다.

- fetch 기반 SSE polyfill로 Bearer token 전송
- 같은 도메인 프록시 구성
- SSE token query contract 명시

### 4. AI agent/rembg 문서는 production 상태와 다르다

`2_avoha/ai/README.md`, `agent/README.md`, `rembg/README.md`에는 `avoha-agent`, `avoha-rembg` 배포 계획/구현 설명이 있다. 하지만 현재 Railway production 서비스 목록에는 해당 서비스가 없다.

현재 실제 AI production 경로는 `ai/chatbot` 단독이다. agent/rembg를 다시 살릴 경우 Railway 서비스 생성, env, backend 호출 경로, 헬스체크를 별도 갱신해야 한다.

### 5. 06번 로그는 세션 기록이지 최신 상태 문서가 아니다

06번은 당시 작업 기록으로 보존한다. 다만 현재 코드 기준으로는 이후 commit들이 들어와 일부 설명이 맞지 않는다.

특히 다음 항목은 05번 문서를 기준으로 본다.

- 채집권 DB 직접 차감 여부
- 현재 Railway production 서비스 목록
- FastAPI Swagger 개선 및 배포 상태
- chatbot full log/Volume 저장 흐름

## 남은 작업 우선순위

| 우선순위 | 작업 | 이유 |
|---:|---|---|
| 1 | 채집권/오늘 기록 횟수 product contract 결정 | FE Home, Backend `/me`, chatbot 응답이 같은 개념을 써야 함 |
| 2 | `GET /catalog/emotions` 또는 도감 contract 추가 | FE 5대 카테고리, Backend 10개 code, chatbot 20개 원석의 간극을 줄여야 함 |
| 3 | provider key 연결 검증 스크립트 | `users.provider_user_key` 누락이면 챗봇 기록/보석 동기화가 끊김 |
| 4 | Home 먹이기 서버 동기화 여부 결정 | 현재는 로컬 UX. 영구 소비/펫 성장이 필요하면 API 필요 |
| 5 | SSE 인증 방식 결정 | 실시간 업데이트를 쓸 계획이면 Bearer 문제를 해결해야 함 |
| 6 | agent/rembg production 편입 여부 결정 | 문서에는 있으나 현재 Railway에는 없음 |

## 운영 검증 체크리스트

### Backend

```bash
curl -sS https://backend-production-3172.up.railway.app/health
curl -sS https://backend-production-3172.up.railway.app/health/ready
curl -sS -o /dev/null -w '%{http_code}' https://backend-production-3172.up.railway.app/docs
```

기대값:

- `/health`: 200
- `/health/ready`: `status=ready`, `db.ok=true`, `redis.ok=true`
- `/docs`: 200

### Chatbot

```bash
curl -sS -o /dev/null -w '%{http_code}' https://chatbot-production-367e8.up.railway.app/docs
curl -sS -o /dev/null -w '%{http_code}' https://chatbot-production-367e8.up.railway.app/gems/all_gems.png
```

기대값:

- `/docs`: 200
- `/gems/all_gems.png`: 200

### Railway

```bash
cd 2_avoha/backend
railway service status --all --environment production
railway deployment list --service backend --environment production
railway logs --service backend --environment production --latest --lines 80
```

## 참조

- Backend Swagger: `https://backend-production-3172.up.railway.app/docs`
- Backend README: [`../README.md`](../README.md)
- Chatbot README: [`../../ai/chatbot/README.md`](../../ai/chatbot/README.md)
- AI README: [`../../ai/README.md`](../../ai/README.md)
- 직후 세션 기록: [`./06-fe-be-ai-integration-cleanup.md`](./06-fe-be-ai-integration-cleanup.md)
