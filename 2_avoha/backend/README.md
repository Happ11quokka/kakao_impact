# 아보하 · Backend

Kakao 웹훅 수신, 인벤토리·세공·이벤트 API, AI 큐 오케스트레이션. Railway 배포.

## 스택
- **런타임**: Python 3.12
- **웹**: FastAPI + uvicorn, pydantic v2 스키마
- **DB**: PostgreSQL (Railway managed) + SQLAlchemy 2.x (async) + Alembic
- **큐**: Redis (arq 도입 예정 · 현재는 미도입)
- **로깅**: structlog (JSON 프로덕션 / 콘솔 개발) → stdout → Railway logs
- **세션**: Starlette `SessionMiddleware` (itsdangerous 서명 쿠키, `avoha_sid`)
- **Kakao**: 상담톡 API + 알림톡 (사업자 + 채널 개설 완료)

## 서비스 구성 (Railway)
| 서비스 | 스펙 | 역할 |
|---|---|---|
| `avoha-api` | 1 vCPU / 1 GB | 본 서비스 |
| `postgres` | managed | 데이터 |
| `redis` | managed | 큐 + SSE pub/sub |

## 데이터 모델
9 테이블: `users`, `collection_tickets`, `kakao_messages`, `emotions`, `gems`, `stickers`, `recipes`, `crafting_events`, `events`. 상세 스키마는 [PRD 4.3](../../docs/avoha/2026-04-17-avoha-prd.md).

### 감정 카탈로그 (10종 · 3 카테고리) — PRD v1.1
`emotions.category` 컬럼 추가 (`calm` | `happy` | `negative`):
- **평온**: `untroubled`(무탈), `serenity`(평온)
- **행복**: `pride`(뿌듯), `joy`(기쁨), `satisfaction`(만족), `flutter`(설렘)
- **부정**: `sadness`(슬픔), `annoyance`(짜증), `regret`(후회), `solace`(위로)

### 광물 등급 (4단계)
`gems.tier` 정수 1~4 → UI 표기: **[돌멩이] ▸ [반짝이는 원석] ▸ [영롱한 보석] ▸ [마법의 크리스탈]**.
- 동종 합성: tier N × 2 → tier N+1 (자동 판정)
- 이종 합성: `recipes` 카드 매칭 시 tier 3·4 결과

### 메시지 소스 구분
`kakao_messages.content_type` 확장: `text` | `image` | `mixed`(사진+텍스트). 사진·혼합 메시지로 얻은 원석은 `gems.source='photo'` 태깅 → 세공소 **특수 조합 재료** (PRD 사용자흐름 2.3).

### 레시피 (재설계 대기)
> PRD v1.1 감정 재정의에 따라 기존 6 레시피 재설계 필요. 확정 전까지 동종 합성만 지원.

## API 엔드포인트
| 유저용 | 운영자용 |
|---|---|
| `GET /auth/kakao/login` · `/callback` | `POST /webhook/kakao` |
| `GET /me` | `GET /ops/queue?status=pending` |
| `GET /inventory/gems?emotion=&tier=` | `POST /ops/messages/:id/confirm` |
| `GET /inventory/stickers` | `POST /ops/messages/:id/reject` |
| `POST /crafting/combine` | `GET /ops/dashboard-metrics` |
| `GET /crafting/recipes` | |
| `GET /field/today` | |
| `GET /sse/inventory` | |
| `POST /events` | |
| `GET /health` · `/health/ready` | |

## 인접 파트 인터페이스
- **Frontend**: REST + SSE (위 표)
- **AI agent**: Redis 큐 `emotion-queue` 에 메시지 push, worker 결과는 `kakao_messages.ai_suggestion` 컬럼으로 회수
- **AI rembg**: HTTP `POST http://avoha-rembg:8000/remove-bg` (Railway 내부 네트워크)
- **Ops console**: 동일 API, `/ops/*` 네임스페이스 + 세션 쿠키
- **Kakao Biz**: webhook 수신 엔드포인트 `/webhook/kakao` (서명 검증 필수)

## 첫 실행
```bash
cd 2_avoha/backend
cp .env.example .env
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
docker compose up -d postgres redis     # 로컬 dev 전용
python migrate.py                       # alembic upgrade head (또는 drizzle DB 면 stamp)
python -m app.seed                      # emotions 10종 idempotent upsert
uvicorn app.main:app --reload --port 8000
```

## 환경변수
```
ENV=development
DATABASE_URL=postgresql+asyncpg://avoha:avoha_dev@localhost:5432/avoha
REDIS_URL=redis://localhost:6379
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=http://localhost:8000/auth/kakao/callback
SESSION_SECRET=<openssl rand -hex 32>
FRONTEND_URL=http://localhost:5173
# KAKAO_WEBHOOK_SECRET=
OPS_ALLOWED_KAKAO_IDS=
# DISCORD_OPS_WEBHOOK=
```

## 작업 리스트 (PRD 4.6)
- [ ] **BE-1** Railway 프로젝트 + 서비스 6개 프로비저닝 + 도메인
- [x] **BE-2** Postgres 스키마 마이그레이션 + seed
- [x] **BE-3** Fastify 스캐폴드 + Kakao OAuth
- [x] **BE-4** Kakao webhook + Redis 큐 publish *(BullMQ `emotion-queue`)*
- [ ] **BE-5** (→ ai/agent) 워커 연동 확인
- [x] **BE-6** 운영 콘솔 API (`/ops/*`) + SSE *(인메모리 버스, 분산 대비 Redis Pub/Sub 교체 여지)*
- [x] **BE-7** 인벤토리·세공 API + 트랜잭션 안전 *(FOR UPDATE 재료 락)*
- [x] **BE-8** 이벤트 로깅 (`POST /events`, `GET /field/today`) · Metabase는 별도
- [ ] **BE-9** rembg 연결 + 폴라로이드 폴백
- [ ] **BE-10** 알림톡 템플릿 승인·발송 (08/18시)
- [ ] **BE-11** 관리자 재지급·데이터 삭제 스크립트
- [x] **BE-12** 헬스체크 (`/health/ready` = DB+Redis ping) · Discord notify 헬퍼

## 트랜잭션 주의 포인트
- **세공**: 재료 gem의 `consumed_at` 업데이트 + 신규 gem insert + `crafting_events` insert 를 **한 트랜잭션** 내. 재료가 이미 소모됐는지 `FOR UPDATE` 로 체크
- **채집권 차감**: `UPDATE ... WHERE remaining > 0 RETURNING remaining` 단일 원자 연산
- **중복 웹훅**: Kakao 재시도 대비 `message_id` unique 제약
