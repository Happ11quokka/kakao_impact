# 아보하 백엔드 Railway 최소 배포 설계

**작성일**: 2026-04-18
**작성자**: Donghyun (with Claude)
**상태**: Draft

## 1. 목적

현재까지 구현된 `avoha-backend`(Fastify + Drizzle, Kakao OAuth + `/me`까지 완료)를 Railway에 배포해 외부에서 접근 가능한 API 서버를 확보한다. 실제 네트워크 환경에서 빌드·런타임·DB 연결을 검증하고, 이후 BE-4(웹훅) 부터는 Railway 환경을 기준으로 개발한다.

## 2. 배경

- 최근 커밋 `109558b`으로 **BE-3**(Fastify 스캐폴드 + Kakao OAuth) 완료, **BE-2**(DB 스키마·시드) 완료.
- PRD `docs/avoha/2026-04-17-avoha-prd.md` §4.1은 Railway에 `avoha-api`/`avoha-agent`/`avoha-rembg`/Postgres/Redis/Metabase 6개 서비스를 요구하지만, 본 스펙은 **MVP 최소 범위**로 축소한다.
- 프론트엔드는 아직 개발 전 → OAuth 플로우 전체 E2E 검증은 Scope 밖. 서버 구동 + DB 연결 확인이 목표.

## 3. 성공 기준

배포 후 다음이 모두 충족되면 완료로 간주한다.

- `curl https://<railway-url>/health` → `{"status":"ok"}` 200 OK
- `curl -i https://<railway-url>/me` → `401 {"error":{"message":"UNAUTHENTICATED",...}}` (세션 없음, 정상 동작)
- Railway 로그에 `listening on 0.0.0.0:<PORT>` 기록
- Railway Postgres에 스키마 9개 테이블 + `emotions` 10행이 존재
- `git push main` → Railway가 자동 재배포 → 서비스 무중단 반영

## 4. Scope

### In scope
- `avoha-api` Railway 서비스 1개 + Postgres managed 1개
- Nixpacks 기반 자동 빌드 (Dockerfile 작성 없음)
- GitHub repo 연동 → `main` 브랜치 push 자동 배포
- `package.json` 와 `src/env.ts` 최소 코드 변경
- 수동 1회 DB 마이그레이션 및 시드 실행 (`railway run npm run db:push && npm run db:seed`)
- Railway 콘솔에 production env vars 설정
- 헬스체크 설정 (Railway healthcheck path = `/health`)

### Out of scope (나중 단계)
- Redis, `avoha-agent`, `avoha-rembg`, Metabase 서비스
- 커스텀 도메인 `api.avoha.today` 연결 — Railway 기본 URL 사용
- Kakao Developer Console redirect URI 업데이트 — 프론트 개발 시작될 때 처리
- 정식 `drizzle-kit generate`/`migrate` 마이그레이션 파이프라인 — MVP엔 `db:push` 유지
- CI(GitHub Actions) 테스트·빌드 자동 검증
- CORS, rate limit, 감사 로깅 등 보안 강화
- Discord 헬스체크 알림 (BE-12)

## 5. 아키텍처

```
GitHub (kakaoimpact/main)
    │
    │ push
    ▼
Railway 프로젝트 (기존)
 ├── avoha-api 서비스
 │    ├── Source: GitHub repo, Root directory: 2_Ulog/backend
 │    ├── Builder: Nixpacks (Node 22 자동 감지)
 │    ├── Build command: npm ci && npm run build
 │    ├── Start command: npm run start  (= node dist/server.js)
 │    ├── Listen: 0.0.0.0 : $PORT  (Railway 주입)
 │    └── Healthcheck path: /health
 └── Postgres (managed plugin)
      └── DATABASE_URL → avoha-api 서비스에 자동 주입
```

개발 → 배포 흐름:
1. 로컬에서 기능 개발 및 `docker compose` 기반 테스트
2. `git push origin main`
3. Railway 가 변경 감지 → Nixpacks 빌드 → 새 컨테이너 기동 → 헬스체크 통과 시 교체

## 6. 코드 변경점

### 6.1 `2_Ulog/backend/package.json`

`start` 스크립트에서 `--env-file=.env` 제거.

```diff
-"start": "node --env-file=.env dist/server.js",
+"start": "node dist/server.js",
```

**이유**: Railway 컨테이너에는 `.env` 파일이 존재하지 않는다. Railway는 콘솔에 설정된 환경변수를 그대로 `process.env` 에 주입하므로 Node의 `--env-file` 플래그가 오히려 실패한다.

로컬 개발은 `dev` 스크립트(`tsx --env-file=.env --watch`)에서 계속 `.env` 읽으므로 영향 없음.

### 6.2 `2_Ulog/backend/src/env.ts`

`REDIS_URL` 을 optional 로 변경.

```diff
-REDIS_URL: z.string().url(),
+REDIS_URL: z.string().url().optional(),
```

**이유**: 현재 코드에서 Redis 를 전혀 사용하지 않는다. BE-4(Kakao 웹훅 + 큐 publish) 시점에 다시 required 로 돌린다. 그전까진 Railway env 에 REDIS_URL 을 아예 설정하지 않아도 부트가 실패하지 않게 한다.

### 6.3 변경 없음 (확인만)

- `src/server.ts:52` — `listen({ port: env.PORT, host: "0.0.0.0" })` 이미 올바름.
- `src/server.ts:16` — `trustProxy: isProd` 이미 올바름 (Railway 는 프록시 뒤).
- `src/routes/health.ts` — `GET /health` 이미 존재, Railway 헬스체크에 재사용.

## 7. 환경변수

Railway 콘솔(`avoha-api` 서비스 Variables 탭)에 다음 값을 설정한다.

| Key | Value | 출처/비고 |
|---|---|---|
| `NODE_ENV` | `production` | 고정 |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway 참조 문법 — Postgres 서비스에서 자동 주입 |
| `PORT` | *(미설정)* | Railway 가 런타임에 주입 |
| `KAKAO_REST_API_KEY` | Kakao 개발자 콘솔 발급값 | 기존 `.env` 와 동일 |
| `KAKAO_CLIENT_SECRET` | Kakao 개발자 콘솔 발급값 | 기존 `.env` 와 동일 |
| `KAKAO_REDIRECT_URI` | `https://<railway-domain>/auth/kakao/callback` | 첫 배포 후 Railway 도메인 확인 → 2차 설정. 프론트 없으므로 실제 콜백 미사용 |
| `SESSION_SECRET` | `openssl rand -hex 32` 로 새로 생성 | 로컬 `.env` 값 재사용 금지 (유출 방지) |
| `FRONTEND_URL` | *(미설정, env.ts default `http://localhost:5173` 사용)* | 프론트 없으므로 의미 없음. 프론트 배포 시점에 채움 |
| `REDIS_URL` | *(미설정)* | 6.2 변경 덕분에 optional. BE-4 부터 설정 |

## 8. 배포 단계

1. **코드 변경 적용** (로컬)
   - 6.1 `package.json` 수정
   - 6.2 `src/env.ts` 수정
   - `git add` → commit (커밋 여부는 사용자 지시에 따름)

2. **Railway 프로젝트 연결**
   ```bash
   cd /Users/imdonghyeon/kakaoimpact/2_Ulog/backend
   railway login           # 이미 로그인돼 있으면 생략
   railway link            # 기존 프로젝트 선택
   ```

3. **Postgres 플러그인 추가** (프로젝트에 없을 경우)
   - Railway 콘솔 → `+ Create` → `Database` → `Add PostgreSQL`, 또는
   - CLI: `railway add --plugin postgresql`

4. **GitHub 연동**
   - Railway 콘솔 → `avoha-api` 서비스 → `Settings` → `Source`
   - GitHub repo 지정, branch `main`
   - `Root Directory` 를 `2_Ulog/backend` 로 설정

5. **환경변수 설정** (위 §7 표)
   - `SESSION_SECRET` 은 `openssl rand -hex 32` 로 생성해 반드시 새 값 사용

6. **첫 배포 트리거**
   - `main` 에 코드 변경 push → Railway 가 빌드/배포 자동 실행
   - 콘솔 로그에서 빌드 성공 → `listening on 0.0.0.0:<port>` 확인

7. **Railway 도메인 확인 후 `KAKAO_REDIRECT_URI` 값 업데이트**
   - 도메인 예: `avoha-api-production.up.railway.app`
   - `KAKAO_REDIRECT_URI=https://<domain>/auth/kakao/callback` 으로 Variables 갱신
   - Railway 가 환경변수 변경 감지 → 자동 재기동

8. **수동 DB 마이그레이션 & 시드**

   마이그레이션 (안전 — `drizzle-kit` 은 shell 의 `process.env.DATABASE_URL` 만 사용):
   ```bash
   railway run --service avoha-api npm run db:push
   ```

   시드 실행 (⚠️ 운영 foot-gun):
   - `db:seed` 스크립트는 `tsx --env-file=.env ...` 이므로 로컬 `.env` 가 Railway 주입값을 **덮어쓴다**. 로컬 `.env` 의 `DATABASE_URL` 이 로컬 Postgres 를 가리키면, 시드가 Railway 가 아닌 로컬 DB 로 들어간다.
   - 다음 두 가지 중 하나로 실행:

   **(권장) 로컬 `.env` 잠시 rename 후 실행:**
   ```bash
   mv .env .env.bak
   railway run --service avoha-api npm run db:seed
   mv .env.bak .env
   ```

   **또는** 로컬 `.env` 의 `DATABASE_URL` 을 Railway production 값과 동일하게 수정한 뒤 실행.

9. **검증** (아래 §9)

## 9. 검증 체크리스트

### 9.1 엔드포인트
- [ ] `curl https://<domain>/health` → `200 {"status":"ok"}`
- [ ] `curl -i https://<domain>/me` → `401` 응답, body 에 `"UNAUTHENTICATED"` 포함
- [ ] `curl -i https://<domain>/auth/kakao/login` → `302` 응답, `Location` 헤더가 `https://kauth.kakao.com/oauth/authorize?...` 로 시작

### 9.2 런타임
- [ ] Railway 로그에 `listening on 0.0.0.0:` 기록
- [ ] 에러 로그에 `환경변수 검증 실패` 같은 부팅 실패 없음

### 9.3 데이터
- [ ] `railway connect postgres` 또는 `drizzle-kit studio` 로 접속 → 9개 테이블 존재
- [ ] `SELECT count(*) FROM emotions;` → `10`

### 9.4 자동 배포
- [ ] 의도적 작은 변경 (예: `src/routes/health.ts` 응답에 `version` 추가) → push → Railway 가 자동으로 새 빌드·배포

## 10. 실패 시나리오 및 대응

| 증상 | 원인 추정 | 대응 |
|---|---|---|
| 빌드 실패: `tsc` 에러 | TypeScript 컴파일 오류 | 로컬 `npm run build` 재현 후 수정 |
| 부팅 실패: `환경변수 검증 실패: SESSION_SECRET` | 32바이트 hex 가 아님 | `openssl rand -hex 32` 로 재생성 |
| 부팅 실패: `DATABASE_URL: Invalid url` | Postgres 참조 문법 오류 | Variables 에서 `${{Postgres.DATABASE_URL}}` 로 재설정 |
| `/health` 는 되는데 `/me` 가 500 | DB 마이그레이션 미실행 | §8 단계 8 수동 실행 |
| Kakao `/auth/kakao/callback` 500 | `KAKAO_REDIRECT_URI` 가 localhost | Railway 도메인으로 재설정 후 Kakao 콘솔에서도 추가 |
| 빌드 성공 but 포트 바인딩 실패 | `PORT` 를 하드코딩 했거나 `0.0.0.0` 아님 | `server.ts` 재확인 (이미 올바름) |

## 11. 롤백

- Railway 콘솔 → `Deployments` → 직전 성공 빌드 → `Redeploy`
- 코드 원복: `git revert <commit>` 후 push → 자동 재배포

## 12. 후속 작업 (이 스펙 범위 밖)

- **BE-4 시작 시**: `REDIS_URL` required 로 되돌림, Railway 에 Redis plugin 추가, `bullmq` 의존성 설치, `/webhook/kakao` 엔드포인트 추가.
- **프론트 개발 시작 시**: `FRONTEND_URL` 실제 값 설정, Kakao 콘솔에 Railway redirect URI 등록, CORS 미들웨어 추가.
- **도메인 확정 시**: Cloudflare/Route53 에 `api.avoha.today` CNAME 설정 → Railway Custom Domain 연결 → `KAKAO_REDIRECT_URI` 재갱신.
- **스키마 변경 빈도 증가 시**: `drizzle-kit generate` 기반 migration 파일 파이프라인으로 전환.
