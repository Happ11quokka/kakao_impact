# 04 · BE-4~BE-8·BE-12 · API 표면 일괄 구현

- **날짜**: 2026-04-18
- **파트**: Backend (BE-4 webhook, BE-6 ops/SSE, BE-7 inventory/crafting, BE-8 events/field, BE-12 health)
- **상태**: 완료 (로컬 컴파일·모듈 로드 OK / DB·Redis 통합 수동검증 대기)

## 목표

WoZ 5일 플레이에 필요한 유저용·운영자용 API 전면 오픈. FE(인벤토리·세공·필드·SSE)와 AI 워커(큐 소비)가 바로 붙을 수 있는 계약 수립.

## 핵심 결정

| 결정 | 내용 | 이유 |
|---|---|---|
| Webhook dedup 전략 | `kakao_messages.provider_message_id` UNIQUE + 사전 SELECT | Kakao 재시도 대비. UNIQUE 하나로 race condition 도 커버. Redis 기반 SETNX 대안 검토 후 DB 단일 진실 유지를 위해 UNIQUE 채택. |
| Webhook 시크릿 | `X-Avoha-Webhook-Secret` 헤더 timingSafeEqual. ENV 미설정 시 생략 | Kakao Biz 콘솔의 실제 서명 규격이 확정 전이라 최소 방어(공유 비밀). 후속 교체 여지 남김. |
| Provider ↔ User 매핑 | 웹훅 수신 시 `user_id=null` 저장, 운영자가 confirm 시 매핑 | OAuth `kakao_id` 와 채널 `userKey` 는 별개 식별자. WoZ 5일간 운영자가 직접 매핑하는 게 가장 안전·빠름. |
| Redis 연결 2종 분리 | `getBullRedis()` (maxRetries null, noReadyCheck) / `getAppRedis()` (lazy) | BullMQ 는 blocking 명령 때문에 `maxRetriesPerRequest:null` 강제. 앱용은 health ping·dedup 등 재시도 허용. 두 커넥션을 혼용하면 BullMQ 가 경고. |
| 세공 트랜잭션 | 재료 `SELECT ... FOR UPDATE` + 결과 insert + events 로그 모두 단일 TX | 동일 gem 을 두 탭에서 동시 세공 시 한쪽만 성공 보장. `consumed_at` + FOR UPDATE 결합. |
| 이종 합성 | `recipes.ingredient_codes @> ARRAY[...]` 로 매칭 (MVP; 레시피 재설계 후 확장) | PRD v1.1 감정 재정의에 따라 recipes 시드 대기. emotion 정렬 후 매칭 쿼리로 카탈로그만 채우면 동작. |
| SSE 버스 | 인메모리 Map<userId, Set<subscriber>> | 단일 인스턴스 MVP 전제. 다중 인스턴스/Railway 오토스케일 시 Redis Pub/Sub 로 1파일만 교체하도록 `sse-bus.ts` 캡슐화. |
| Fastify SSE 구현 | `reply.hijack()` + raw 스트림 직접 작성 | fastify-sse 플러그인 v5 호환 불명. 25s 하트비트 `: ping` + `retry: 5000` 프로토콜 정석. `req.raw.on('close')` 로 unsubscribe. |
| 채집권 차감 | `UPDATE ... WHERE remaining > 0 RETURNING remaining` 단일 원자 | 경합에서도 절대 음수 안 만들고, RETURNING 으로 잔량 즉시 반환. `decremented.length === 0` 이면 `NO_TICKETS`. |
| Ops 가드 | `OPS_ALLOWED_KAKAO_IDS` env 리스트에 kakaoId 포함 | Kakao OAuth kakaoId 는 숫자 고정값이라 이메일 기반보다 변조 위험 낮음. env 쉼표 구분 → 배열로 transform. |
| 필드 드롭 좌표 | gem.id 해시 → 0.08~0.92(x) / 0.25~0.80(y) 결정적 | `field_drop_positions` 별도 테이블 불필요. 서버 재시작해도 위치 유지, FE는 뷰포트 비율로 곱하기만. |
| 확정 시 AI 제안 병합 | `aiSuggestion = coalesce(ai_suggestion, '{}') \|\| {final:{...}}` | 원본 AI 제안 유지 + 최종 라벨을 `.final` 로 덧씌움. 학습 데이터 export(BE-? 후속) 에서 diff 계산용. |

## 파일 트리 (추가·수정분)

```
2_avoha/backend/
├── .env.example                     수정: KAKAO_WEBHOOK_SECRET, OPS_ALLOWED_KAKAO_IDS
├── package.json                     수정: bullmq, ioredis 의존
├── src/
│   ├── env.ts                       수정: WEBHOOK_SECRET, OPS_ALLOWED_KAKAO_IDS, DISCORD
│   ├── server.ts                    수정: 라우트 7종 등록 + onClose 정리
│   ├── db/
│   │   ├── schema.ts                수정: kakao_messages provider_*, raw, 인덱스 2개
│   │   └── migrations/
│   │       └── 0001_kakao_messages_provider_fields.sql   신규
│   ├── lib/
│   │   ├── auth-guard.ts            신규: requireSession(req, reply) → userId | null
│   │   ├── ops-guard.ts             신규: requireOps(req, reply) → {userId, kakaoId} | null
│   │   ├── redis.ts                 신규: getBullRedis / getAppRedis / closeRedis
│   │   ├── queue.ts                 신규: EMOTION_QUEUE_NAME, getEmotionQueue
│   │   ├── sse-bus.ts               신규: publish / subscribe / subscriberCount
│   │   ├── crafting.ts              신규: combineGems(userId, ids) + CraftingError
│   │   └── notify.ts                신규: notifyOps(message) Discord 웹훅
│   └── routes/
│       ├── webhook.ts               신규: POST /webhook/kakao
│       ├── inventory.ts             신규: GET /inventory/gems, /inventory/stickers
│       ├── crafting.ts              신규: POST /crafting/combine, GET /crafting/recipes
│       ├── ops.ts                   신규: /ops/queue, confirm, reject, dashboard-metrics
│       ├── sse.ts                   신규: GET /sse/inventory
│       ├── events.ts                신규: POST /events (batch 1~100)
│       ├── field.ts                 신규: GET /field/today
│       ├── health.ts                수정: + GET /health/ready (DB·Redis ping)
│       └── me.ts                    수정: requireSession 가드 사용
```

## API 추가/변경 요약

| 메서드 | 경로 | 인증 | 주요 동작 |
|---|---|---|---|
| POST | `/webhook/kakao` | 시크릿 헤더 | `kakao_messages` insert(pending) + `emotion-queue` add. 재시도 dedup |
| GET | `/inventory/gems?emotion=&tier=` | 세션 | 본인 `consumed_at IS NULL` gem 목록 |
| GET | `/inventory/stickers` | 세션 | 본인 스티커 전체 |
| GET | `/crafting/recipes` | 세션 | 레시피 카탈로그 전체 (해금 로직은 후속) |
| POST | `/crafting/combine` | 세션 | `{ingredientIds:[uuid,uuid]}` → 상위 gem. 동종/이종 TX 처리 |
| GET | `/sse/inventory` | 세션 | text/event-stream. `ping`/`gem_added` 등 |
| POST | `/events` | 세션 | 이벤트 배치 로깅 (1~100건) |
| GET | `/field/today` | 세션 | 오늘(KST) 드롭 목록 + 결정적 (x,y) |
| GET | `/ops/queue?status=&limit=` | ops | 상태별 대기 큐 (기본 pending) |
| POST | `/ops/messages/:id/confirm` | ops | `{userId, emotionCode, reactionText?, source?}` → gem 발급 + 채집권 -1 + SSE push |
| POST | `/ops/messages/:id/reject` | ops | `{reason?}` → status=rejected |
| GET | `/ops/dashboard-metrics` | ops | pending/confirmed today/active gems/active users 카운트 |
| GET | `/health/ready` | 공개 | DB select1 + Redis ping. 실패 503 |

## 완료 상태 (자동 검증됨)

- `npm run typecheck` — 0 errors
- `npm run build` — `dist/` 생성, tsc 0 errors
- 더미 env 로 `node -e "import('./dist/server.js')"` → LOADED_OK (모든 모듈 초기화 통과)

**수동 검증 대기**:
- [ ] `docker compose up -d` 후 `npm run db:push` 으로 0001 마이그레이션 반영 확인
- [ ] `curl -XPOST localhost:3000/webhook/kakao -d '{"userKey":"u1","content":{"text":"버스 타이밍 맞았어"}}'` → `{ok:true, id}` + DB 확인
- [ ] Redis CLI `XLEN bull:emotion-queue:wait` 또는 BullMQ UI 에서 대기 작업 확인
- [ ] Kakao 로그인한 세션으로 `/inventory/gems` → 200
- [ ] `OPS_ALLOWED_KAKAO_IDS` 에 내 kakaoId 넣고 `/ops/queue` → 200
- [ ] 두 개의 tier 1 같은 감정 gem 세팅 → `/crafting/combine` 성공 / 중복 ID 차단
- [ ] `/sse/inventory` 연결 → ops confirm 시 FE 에 `gem_added` 이벤트 1초 이내 도달

## 삽질 로그

### 1. `ioredis` default import 가 생성자 아님

**증상**:
```
src/lib/redis.ts(11,20): error TS2351: This expression is not constructable.
  Type 'typeof import(".../ioredis/built/index")' has no construct signatures.
```

**원인**: ioredis v5 의 `built/index.d.ts` 는 `export { default as Redis } from "./Redis"` 형태로 named 만 export 구조가 드러나 있고, TS NodeNext + strict 조합에서 default import 의 `new` 호출이 막힘.

**해결**: `import { Redis } from "ioredis"` 로 named import 로 전환.

**교훈**: NodeNext 에서 CJS 패키지의 default import 는 esModuleInterop 이 있어도 `new` 구문에 실패할 수 있음. 가능하면 named import 사용.

### 2. `db.transaction` 내부에서 Drizzle `for('update')` 가능 여부

**증상**: 없음(예상). Drizzle v0.36 에서 `.for("update")` 는 postgres-js 드라이버 대상 정식 지원.

**주의**: 같은 TX 안에서 후속 UPDATE/INSERT 가 락을 유지하도록, SELECT 와 같은 `tx` 핸들을 반드시 사용. 바깥 `db` 로 쓰면 다른 커넥션이라 락 효과 없음. 본 구현에서는 `tx` 만 사용.

### 3. SSE 응답에서 Fastify 가 자동 종료하는 문제

**증상**: (예상) SSE 연결이 첫 응답 후 즉시 닫히거나, Fastify 로그에 "Reply already sent" 가 뜸.

**원인**: Fastify 는 핸들러 리턴 직후 `reply.send()` 를 자동 호출. SSE 는 long-lived 여야 함.

**해결**: `reply.hijack()` 으로 Fastify 라이프사이클에서 hand-off. 이후 `reply.raw.write(...)` 수동. `req.raw.on("close")` 에서 unsubscribe + clearInterval.

**교훈**: Fastify 5 에서 SSE·WebSocket 류는 hijack 패턴이 표준. 플러그인 없어도 단순.

## 남은 BE 작업

- **BE-1**: Railway 프로비저닝 (도메인, volume, env 주입)
- **BE-5**: `avoha-agent` 워커가 `emotion-queue` 에서 consume → OpenAI 호출 → `kakao_messages.ai_suggestion` 업데이트 + status='proposed' (AI 파트 담당)
- **BE-9**: rembg 컨테이너 연결 — 사진 메시지 confirm 시 업스트림 호출, 실패하면 `polaroid_fallback=true`
- **BE-10**: 알림톡 템플릿 승인 + 08:00/18:00 cron
- **BE-11**: 관리자 스크립트 — 재지급·데이터 삭제·시트 동기화(PRD §7.6)

## 다음 단계 (FE 협업 포인트)

- FE `services/api-client.ts` 가 쿠키 기반이라 `credentials: 'include'` 필수
- SSE 는 EventSource 가 기본으로 쿠키 전달하지만, 크로스도메인이면 `withCredentials: true` (폴리필 필요)
- `/crafting/combine` 응답 `{ gem, recipeSlug, kind }` 로 확정. FE 세공소는 `kind==='recipe'` 일 때 특수 파티클·도감 카드 뒤집기 애니 트리거
