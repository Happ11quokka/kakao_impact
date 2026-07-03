# Findings — 아보하 사용자 행동 분석 시스템

## 기존 인프라 (재사용 가능)
- **`events` 테이블** (`2_avoha/backend/migrations/versions/0001_initial.py:50-56`) — UUID PK, event_type text, props JSONB, occurred_at, user_id UUID nullable. 인덱스: `(event_type, occurred_at)`, `props GIN`. 스키마 변경 없이 그대로 사용 가능.
- **`POST /events` 라우터** (`2_avoha/backend/app/routes/events.py`) — 배치 100개 ingest. `require_user` 강제 → optional로 변경 필요.
- **`api.events()` 프론트 래퍼** (`2_avoha/frontend/src/lib/api.ts:525-526`) — 호출하는 곳 0개. SDK 만들어 적극 호출 필요.
- **Redis** (`2_avoha/backend/app/services/redis.py`) — `get_app_redis()` 싱글톤 + `redis.asyncio.Redis`. 현재 lifespan close만 처리, 실질적 사용 없음.
- **SSE 패턴** (`2_avoha/backend/app/routes/sse.py`) — 기존 `/sse/inventory` 구조 모방 가능.
- **ops 권한** — `OPS_ALLOWED_KAKAO_IDS` env, 기존 ops 라우터 패턴 있음.

## 외부 상태
- Railway CLI: `railway whoami` → **Unauthorized** (v4.58.0 설치됨). 사용자가 `! railway login` 직접 실행 필요. 대화형 OAuth라 에이전트 불가.
- Railway 프로젝트명: `intelligent-wholeness` (별칭 avoha). 서비스: backend/frontend/chatbot/Postgres/Redis.
- backend startCommand는 이미 `python migrate.py && python -m app.seed && uvicorn ...` → 0010 마이그레이션 자동 적용됨.

## 결정 사항
- **익명 추적**: sessionStorage `avoha_anon_id` (UUID v4). 로그인 콜백 시 `POST /auth/link-anon` → `anon_user_links` 테이블에 매핑.
- **권한**: 운영자만 (`OPS_ALLOWED_KAKAO_IDS` 재사용). `/ops/analytics`.
- **갱신**: Redis Pub/Sub 기반 SSE (인스턴스 경계 안전).
- **수집 범위**: 페이지뷰/체류/클릭/챗봇 질문/에러 + form/modal/web-vitals (최대한 자세히).
- **이벤트 폭주 대응**: Redis rate limit 분당 300개.
- **프라이버시**: 챗봇 utterance 원문은 events.props에 저장 안 함(길이만), IP 저장 안 함, deviceType만 user-agent에서 추출.
