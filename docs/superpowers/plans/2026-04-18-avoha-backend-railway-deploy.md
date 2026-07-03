# 아보하 백엔드 Railway 최소 배포 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `avoha-backend`(Fastify + Drizzle, Kakao OAuth + `/me`)을 Railway 에 배포하고 `git push main` 자동 재배포 파이프라인을 활성화한다.

**Architecture:** Railway 프로젝트에 `avoha-api` 서비스 + Postgres managed plugin 만 구성. GitHub 연동으로 Nixpacks 자동 빌드/배포. 마이그레이션은 첫 배포 이후 `railway run`으로 1회 수동 실행.

**Tech Stack:** Railway, Nixpacks, Node.js 22, Fastify 5, Drizzle ORM, PostgreSQL (managed), GitHub

**Spec:** `docs/superpowers/specs/2026-04-18-avoha-backend-railway-deploy-design.md`

---

## 사전 전제

- Railway 계정 있음, `railway` CLI 설치·로그인 완료
- 기존 Railway 프로젝트 존재 (이번에 새로 만들지 않음)
- Kakao 개발자 콘솔에서 REST API Key / Client Secret 이 발급돼 있음 (로컬 `.env` 에 값 있음)
- 프론트엔드는 아직 없음 → OAuth 실제 콜백 E2E 는 검증하지 않음

## 테스트 접근

이번 배포 작업은 **config/infra 변경**이 대부분이다. 현재 `2_Ulog/backend` 에는 테스트 러너(`vitest`/`jest`)가 설치돼 있지 않고, MVP 범위에서 테스트 인프라를 새로 들이는 건 over-engineering 이다. 따라서:

- **코드 변경(Task 1)**: 로컬에서 `npm run build` 성공 + `npm run dev` 성공으로 회귀 확인
- **env.ts 변경**: 로컬 환경변수 조작 실험으로 `REDIS_URL` 없어도 부팅되는지 직접 확인
- **배포 검증(Task 8)**: 실제 Railway 엔드포인트에 `curl` 로 기대 응답 확인

테스트 러너를 도입할 가치가 있는 시점은 BE-7(세공 트랜잭션) 같은 비즈니스 로직이 들어올 때.

---

## File Structure

### 수정 파일
- `2_Ulog/backend/package.json` — `start` 스크립트에서 `--env-file=.env` 제거
- `2_Ulog/backend/src/env.ts` — `REDIS_URL` optional 로 변경

### 신규 파일
- 없음 (Dockerfile/railway.json/nixpacks.toml 전부 불필요 — Nixpacks 자동 감지)

### Railway 측 설정 (코드 아님)
- Railway 콘솔: 서비스 `avoha-api` 의 Source (GitHub) / Variables / Healthcheck
- Railway Postgres plugin

---

## Task 1: 코드 변경 — `start` 스크립트와 `REDIS_URL` optional

**Files:**
- Modify: `2_Ulog/backend/package.json:12`
- Modify: `2_Ulog/backend/src/env.ts:7`

- [ ] **Step 1.1: `package.json` 의 `start` 스크립트에서 `--env-file=.env` 제거**

변경 전 (package.json:12):
```json
"start": "node --env-file=.env dist/server.js",
```

변경 후:
```json
"start": "node dist/server.js",
```

**왜**: Railway 컨테이너에 `.env` 파일이 존재하지 않는다. Railway 는 콘솔에 설정된 환경변수를 `process.env` 로 직접 주입하므로 Node 의 `--env-file` 플래그는 오히려 ENOENT 를 일으킨다. `dev` 스크립트(`tsx --env-file=.env --watch ...`)는 로컬 전용이라 그대로 둔다.

- [ ] **Step 1.2: `src/env.ts` 의 `REDIS_URL` 을 optional 로**

변경 전 (env.ts:7):
```ts
REDIS_URL: z.string().url(),
```

변경 후:
```ts
REDIS_URL: z.string().url().optional(),
```

**왜**: 현재 코드에서 Redis 를 전혀 사용하지 않는다. BE-4 부터 필요해질 때 다시 required 로 돌린다. 이 변경 없이 Railway 에 REDIS_URL 을 설정하지 않으면 Zod 검증에서 부팅 실패한다.

- [ ] **Step 1.3: 로컬 build 회귀 확인**

Run:
```bash
cd /Users/imdonghyeon/kakaoimpact/2_Ulog/backend
npm run build
```

Expected: `dist/server.js` 가 생성되고 에러 없이 종료.

실패 시: tsc 오류 메시지 확인. 주로 타입 관련이면 `env.ts` 에서 `z.optional()` 의 반환 타입 추론 (undefined 가능) 이 다른 파일에서 사용처가 있는지 확인. 현재 codebase 에서 `env.REDIS_URL` 사용처는 없으므로 문제 없을 것.

- [ ] **Step 1.4: 로컬 dev 회귀 확인**

Run:
```bash
cd /Users/imdonghyeon/kakaoimpact/2_Ulog/backend
docker compose up -d postgres
npm run dev
```

Expected: 로그에 `listening on 0.0.0.0:3000` 출력되고 에러 없음. 다른 터미널에서:

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

확인 후 `Ctrl+C` 로 종료.

- [ ] **Step 1.5: REDIS_URL 없이도 부팅되는지 확인**

로컬 `.env` 를 임시로 수정해 `REDIS_URL` 행을 주석처리한 뒤:
```bash
npm run dev
```

Expected: 부팅 성공. `환경변수 검증 실패` 에러 없음.

확인 후 `.env` 원복.

- [ ] **Step 1.6: 커밋**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_Ulog/backend/package.json 2_Ulog/backend/src/env.ts
git commit -m "|CHORE| Railway 배포용 설정 변경 — start 스크립트 + REDIS_URL optional"
```

> 주의: 이 커밋은 아직 push 하지 않는다. Task 5 에서 Railway 설정이 끝난 뒤 push 한다. 그렇지 않으면 env vars 가 비어있는 상태에서 Railway 가 빌드를 시작해 부팅 실패한다.

---

## Task 2: Railway CLI 로 프로젝트 연결

**Files:** (코드 변경 없음, CLI 작업만)

- [ ] **Step 2.1: Railway 로그인 상태 확인**

Run:
```bash
railway whoami
```

Expected: 이메일/유저명 출력.

실패 시: `railway login` 실행 후 브라우저 인증.

- [ ] **Step 2.2: 기존 Railway 프로젝트 연결**

```bash
cd /Users/imdonghyeon/kakaoimpact/2_Ulog/backend
railway link
```

인터랙티브 프롬프트가 뜨면 기존 프로젝트 선택. 프로젝트가 여러 개면 아보하 관련 프로젝트 선택. 서비스는 이후에 설정하므로 기본값.

Expected: `Project <name> linked` 같은 메시지 + `.railway/` 디렉토리 또는 루트 설정 파일 생성.

- [ ] **Step 2.3: 프로젝트 상태 확인**

```bash
railway status
```

Expected: 프로젝트명 / 환경(`production`) / 서비스 목록 출력. `avoha-api` 서비스가 없다면 다음 단계에서 만든다.

- [ ] **Step 2.4: `avoha-api` 서비스 존재 확인**

Railway 콘솔(웹) 에서 프로젝트 열기 → 서비스 목록 확인.

- 서비스 이미 있음 → Task 3 으로 진행
- 서비스 없음 → 콘솔 `+ Create` → `Empty Service` → 이름 `avoha-api` 로 생성

**왜 콘솔에서**: `railway service create` CLI 명령은 버전에 따라 동작이 다르고, GitHub 연동 설정은 어차피 콘솔에서 해야 하므로 일관성을 위해.

- [ ] **Step 2.5: Postgres plugin 존재 확인 및 추가**

Railway 콘솔에서 프로젝트의 Postgres 서비스 유무 확인.

- 이미 있음 → Task 3 으로 진행
- 없음 → 콘솔 `+ Create` → `Database` → `Add PostgreSQL`

Expected: Postgres 서비스가 실행되고 Variables 탭에 `DATABASE_URL`, `PGHOST`, ... 자동 생성.

---

## Task 3: `avoha-api` 서비스 Source/Healthcheck 설정

**Files:** (Railway 콘솔 작업)

- [ ] **Step 3.1: GitHub repo 연동**

Railway 콘솔 → `avoha-api` 서비스 → `Settings` 탭 → `Source` 섹션:

- `Connect Repo` → GitHub 계정 인증 → 리포지토리 `imdonghyeon/kakaoimpact` (정확한 이름은 실제 GitHub 리포 확인) 선택
- `Branch`: `main`

- [ ] **Step 3.2: Root Directory 설정**

같은 Source 섹션에서:
- `Root Directory`: `2_Ulog/backend`

**왜**: 모노리포 루트에서 백엔드만 빌드하려면 Railway 에게 빌드 컨텍스트를 좁혀줘야 한다. 이게 없으면 Nixpacks 가 레포 루트에서 Node 프로젝트를 못 찾아서 빌드 실패한다.

- [ ] **Step 3.3: Build/Start 커맨드 확인 (기본값 그대로)**

`Settings` 탭의 `Deploy` 섹션에서:
- `Build Command`: 비워둠 (Nixpacks 가 `npm ci && npm run build` 자동 실행)
- `Start Command`: 비워둠 (Nixpacks 가 `package.json` 의 `start` 스크립트 자동 실행)
- `Watch Paths`: 비워둠 (전체 감지 — Root Directory 범위만 감지됨)

- [ ] **Step 3.4: Healthcheck 경로 설정**

`Settings` 탭의 `Deploy` 섹션:
- `Healthcheck Path`: `/health`
- `Healthcheck Timeout`: 기본값 (100s) 유지

**왜**: 새 배포가 헬스체크에 실패하면 Railway 가 이전 버전으로 자동 롤백한다. `/health` 는 이미 구현돼 있다(`src/routes/health.ts`).

- [ ] **Step 3.5: 자동 배포 비활성화 확인 (첫 배포 전)**

이 시점에는 GitHub 연동만 하고 **아직 배포하지 않는다** — env vars 를 먼저 설정해야 부팅이 된다.

콘솔에 자동 배포 토글이 있다면 off 로. 또는 이 시점에 `main` 이 이미 Railway 배포용 커밋보다 뒤에 있으므로 (Task 1 커밋은 아직 push 안 함) 자동 배포가 트리거되지 않는다. 확인만.

---

## Task 4: Railway 환경변수 설정

**Files:** (Railway 콘솔 작업)

- [ ] **Step 4.1: `SESSION_SECRET` 생성**

로컬 터미널에서:
```bash
openssl rand -hex 32
```

Expected: 64자리 hex 문자열 출력. 이 값을 메모 (예: `a3f1...9b2c`).

**중요**: 로컬 `.env` 의 SESSION_SECRET 을 **재사용하지 않는다**. production 전용 새 값을 쓴다.

- [ ] **Step 4.2: Railway Variables 탭에서 환경변수 추가**

Railway 콘솔 → `avoha-api` → `Variables` 탭에서 다음 6개 추가:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `KAKAO_REST_API_KEY` | 로컬 `.env` 의 값 복사 |
| `KAKAO_CLIENT_SECRET` | 로컬 `.env` 의 값 복사 |
| `KAKAO_REDIRECT_URI` | `https://placeholder.local/auth/kakao/callback` (Step 6 에서 실제 도메인으로 갱신) |
| `SESSION_SECRET` | Step 4.1 에서 생성한 값 |

**설정하지 않음**:
- `PORT` — Railway 가 런타임에 자동 주입
- `REDIS_URL` — 이번 배포 범위 밖, `env.ts` optional 처리됨
- `FRONTEND_URL` — `env.ts` default(`http://localhost:5173`) 유지, 프론트 나올 때 채움

- [ ] **Step 4.3: `DATABASE_URL` 참조 문법 확인**

`${{Postgres.DATABASE_URL}}` 가 값 자체(`postgresql://...`) 로 렌더링되는지 Variables 탭에서 확인. Postgres 서비스 이름이 `Postgres` 가 아닌 다른 이름(예: `avoha-postgres`) 이라면 해당 이름으로 맞춘다: `${{avoha-postgres.DATABASE_URL}}`.

확인: 변수 우측에 실제 값 미리보기가 `postgresql://...` 로 보여야 한다.

---

## Task 5: 첫 배포 (git push → Railway 자동 빌드)

**Files:** (git push 작업)

- [ ] **Step 5.1: `main` 브랜치로 push**

```bash
cd /Users/imdonghyeon/kakaoimpact
git push origin main
```

Expected: push 성공. Railway 콘솔의 `Deployments` 탭에 `Building` 상태의 새 배포가 나타남.

- [ ] **Step 5.2: Railway 빌드 로그 모니터링**

Railway 콘솔 → `avoha-api` → `Deployments` → 진행중 배포 클릭 → `Build Logs` 탭.

또는 CLI:
```bash
railway logs --service avoha-api
```

Expected 로그 흐름:
```
Nixpacks build plan ...
Installing Node.js 22 ...
npm ci
npm run build    (tsc 실행)
... Build successful ...
```

- [ ] **Step 5.3: 런타임 로그 확인**

빌드가 끝나면 `Deploy Logs` 탭으로 전환 (또는 `railway logs --service avoha-api`).

Expected 로그 (Fastify pino 기본 포맷):
```
{"level":30,"msg":"Server listening at http://0.0.0.0:<port>"}
```

`Server listening at` 키워드로 검색.

**실패 시 진단**:
- `환경변수 검증 실패: SESSION_SECRET must be 64 hex chars` → Step 4.1 결과 재확인
- `DATABASE_URL: Invalid url` → Step 4.3 참조 문법 재확인
- `Cannot find module '.../dist/server.js'` → 로컬에서 `npm run build` 성공했는지, tsc 가 dist 를 만들었는지 확인. tsconfig 의 `outDir` 확인

- [ ] **Step 5.4: Railway 도메인 확인**

`Settings` → `Networking` → `Public Networking` 에서 `Generate Domain` 클릭 (이미 있으면 skip).

Expected 도메인: `avoha-api-production.up.railway.app` 형태. 도메인을 메모한다.

- [ ] **Step 5.5: 첫 헬스체크 `curl`**

```bash
curl -i https://<railway-domain>/health
```

Expected:
```
HTTP/2 200
content-type: application/json; charset=utf-8
...
{"status":"ok"}
```

실패 시: `/health` 경로가 아닌 `/` 로 요청했는지, 도메인 오타, 아니면 아직 Deploy 가 `Active` 상태가 아닌지 확인.

---

## Task 6: `KAKAO_REDIRECT_URI` 실제 도메인으로 갱신

**Files:** (Railway 콘솔 작업)

- [ ] **Step 6.1: Variables 탭에서 `KAKAO_REDIRECT_URI` 수정**

`KAKAO_REDIRECT_URI` 를 placeholder 에서 실제 값으로:
```
https://<railway-domain>/auth/kakao/callback
```

- [ ] **Step 6.2: 자동 재배포 대기**

Railway 는 env var 변경을 감지하면 자동으로 재기동한다. `Deployments` 탭에서 새 배포가 생기고 `Active` 가 될 때까지 대기 (~1-2분).

- [ ] **Step 6.3: 재배포 후 `/auth/kakao/login` 검증**

```bash
curl -i https://<railway-domain>/auth/kakao/login
```

Expected:
```
HTTP/2 302
location: https://kauth.kakao.com/oauth/authorize?client_id=...&redirect_uri=https%3A%2F%2F<railway-domain>%2Fauth%2Fkakao%2Fcallback&response_type=code&scope=...&state=...
set-cookie: avoha_sid=...
```

`redirect_uri` 쿼리 파라미터에 Railway 도메인이 인코딩돼 들어있는지 확인.

**참고**: Kakao 개발자 콘솔에 이 redirect URI 를 등록하지 않았으므로 실제 인가 서버는 에러를 돌려주지만, 여기선 `/login` 이 제대로 302 리다이렉트를 만드는지만 확인하면 된다. 실제 E2E 는 프론트 개발 시점에.

---

## Task 7: DB 마이그레이션 + 시드

**Files:** (CLI 실행)

- [ ] **Step 7.1: 마이그레이션 실행 (안전)**

```bash
cd /Users/imdonghyeon/kakaoimpact/2_Ulog/backend
railway run --service avoha-api npm run db:push
```

Expected: drizzle-kit 출력 — `Your schema is up to date with the database` 또는 `Changes applied`. 9개 테이블 생성/동기화 로그.

**왜 안전**: `drizzle-kit` 은 `drizzle.config.ts` 에서 `process.env.DATABASE_URL` 만 읽는다 (dotenv 호출 없음). `railway run` 이 주입한 Railway env vars 를 그대로 사용한다.

- [ ] **Step 7.2: 시드 실행 (⚠️ foot-gun 주의)**

`db:seed` 스크립트는 `tsx --env-file=.env src/db/seed.ts` 로 **로컬 `.env` 를 강제 로드**한다. `railway run` 의 env var 주입이 덮어씌워지므로, 로컬 `.env` 의 `DATABASE_URL` 이 로컬 Postgres 를 가리키면 시드가 **로컬 DB로 들어간다**.

다음 절차로 실행:

```bash
cd /Users/imdonghyeon/kakaoimpact/2_Ulog/backend
mv .env .env.bak
railway run --service avoha-api npm run db:seed
mv .env.bak .env
```

Expected 로그: `emotions seeded: 10 rows upserted` 같은 성공 메시지.

실수로 `.env.bak` rename 을 빠뜨리고 실행했다면:
- 로컬 Postgres 의 `emotions` 테이블 확인 → 로컬에 들어갔다면 Railway 에는 아직 없음
- rename 후 다시 실행하면 Railway 에 반영됨 (upsert 라 중복 시드 문제 없음)

- [ ] **Step 7.3: Railway DB 에 데이터 들어갔는지 확인**

```bash
railway connect postgres
```

psql 프롬프트에서:
```sql
\dt
SELECT count(*) FROM emotions;
```

Expected:
- `\dt` → 정확히 9개 테이블: `users`, `collection_tickets`, `kakao_messages`, `emotions`, `gems`, `stickers`, `recipes`, `crafting_events`, `events`. (`db:push` 는 `__drizzle_migrations` 관리 테이블을 만들지 않는다 — 그건 `drizzle-kit migrate` 기반 파이프라인에서만 생긴다.)
- `SELECT count(*) FROM emotions;` → `10`

psql 종료: `\q`

---

## Task 8: 검증 체크리스트 실행

**Files:** (검증만, 변경 없음)

- [ ] **Step 8.1: `/health` 200 확인**

```bash
curl -i https://<railway-domain>/health
```

Expected: `200 {"status":"ok"}`

- [ ] **Step 8.2: `/me` 401 확인**

```bash
curl -i https://<railway-domain>/me
```

Expected: `401` + body 에 `"UNAUTHENTICATED"` 포함.

```
HTTP/2 401
...
{"error":{"message":"UNAUTHENTICATED","code":...}}
```

**왜 정상**: 세션 쿠키 없이 호출했으므로 401 이 맞다. 200 이 나오면 인증 미들웨어가 꺼진 것.

- [ ] **Step 8.3: `/auth/kakao/login` 302 확인**

Task 6 Step 6.3 과 동일 — `location` 헤더가 `https://kauth.kakao.com/...` 로 시작하고 `redirect_uri` 에 Railway 도메인이 인코딩된 것 확인.

- [ ] **Step 8.4: Deploy 상태 Active 확인**

Railway 콘솔 `Deployments` 탭 — 최신 배포가 `Active` (녹색) 상태.

- [ ] **Step 8.5: 에러 로그 없음 확인**

```bash
railway logs --service avoha-api --lines 100
```

Expected: 부팅 로그 외에 ERROR 또는 `환경변수 검증 실패` 같은 메시지 없음.

정상 부팅 로그 후 유휴 상태에서 추가 로그가 없는지 1분간 관찰.

---

## Task 9: 자동 배포 파이프라인 smoke test

**Files:**
- Modify: `2_Ulog/backend/src/routes/health.ts`

- [ ] **Step 9.1: 헬스체크 응답에 `version` 필드 임시 추가**

`src/routes/health.ts` 의 응답을 `{ status: "ok", version: "deploy-test-1" }` 로 수정.

- [ ] **Step 9.2: 커밋 + push**

```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_Ulog/backend/src/routes/health.ts
git commit -m "|CHORE| 자동 배포 smoke test"
git push origin main
```

- [ ] **Step 9.3: Railway 가 자동 배포 트리거 확인**

Railway 콘솔 `Deployments` 탭에서 새 배포가 `Building` 으로 등장하는지 확인. ~1-2분 후 `Active` 로 전환.

- [ ] **Step 9.4: 새 응답 확인**

```bash
curl https://<railway-domain>/health
```

Expected: `{"status":"ok","version":"deploy-test-1"}`

- [ ] **Step 9.5: 변경 revert**

```bash
cd /Users/imdonghyeon/kakaoimpact
git revert HEAD --no-edit
git push origin main
```

Railway 가 재배포 → `/health` 가 다시 `{"status":"ok"}` 로 복귀.

smoke test 완료.

---

## 완료 판단

Task 8 의 모든 체크가 통과하고 Task 9 smoke test 가 pass 하면 배포 작업 완료. 

이후 작업:
- Kakao 개발자 콘솔에 Railway redirect URI 추가 (프론트 개발 시작 시)
- BE-4 웹훅 착수 시: Redis plugin 추가, `bullmq` 설치, `env.ts` 의 `REDIS_URL` required 로 복귀

## 롤백

- 전체 배포 롤백: Railway 콘솔 `Deployments` → 직전 성공 빌드 → `Redeploy`
- 코드 롤백: `git revert <commit>` → push → 자동 재배포
- 스키마 롤백: `db:push` 는 비가역적. 스키마 롤백 필요 시 `docker compose` 로 로컬에 동일 스키마 재현 후 수동 SQL 로 마이그레이션 작성
