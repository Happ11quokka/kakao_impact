# Progress Log

## 2026-05-20

### Setup
- Plan mode 진입 → 기획서 작성 → 1차 승인 → Redis 활용 추가 → Railway CLI 통합 추가 → 최종 승인.
- 기획서 원본: `/Users/imdonghyeon/.claude/plans/cryptic-mixing-lighthouse.md`
- 9 PR 단위 실행 계획 수립. TaskCreate로 task #2~#10 생성.
- planning-with-files 파일 재작성 (이전 "홈 화면 디테일 다듬기" 작업 흔적 덮어씀).

### Blockers
- Railway CLI Unauthorized. 사용자가 `! railway login` 실행 후 §8.3 검증 명령 가능.
- (배포 자체는 git push로 트리거되므로 CLI 없이도 진행 가능)

### Implementation 완료 (2026-05-20)
9개 Step 모두 작성 완료. 로컬 검증 통과 (tsc + vite build + python ast).

**신규 파일:**
- `2_avoha/backend/migrations/versions/0010_analytics.py`
- `2_avoha/backend/app/analytics/{__init__,counters,rate_limit,queries,pubsub}.py`
- `2_avoha/backend/app/routes/ops_analytics.py`
- `2_avoha/frontend/src/lib/{analytics.ts,page-tracker.tsx,click-tracker.ts,analytics-stream.ts}`
- `2_avoha/frontend/src/components/RequireOpsUser.tsx`
- `2_avoha/frontend/src/routes/OpsAnalytics.tsx`

**수정 파일:**
- `backend/app/db/models.py` (Event 인덱스 1개 추가, AnonUserLink 추가)
- `backend/app/deps.py` (optional_user 추가)
- `backend/app/main.py` (ops_analytics 라우터 등록)
- `backend/app/routes/events.py` (optional auth + anonId + 카운터/rate limit/pubsub)
- `backend/app/routes/auth.py` (/auth/link-anon)
- `backend/app/routes/webhook.py` (chatbot.question.sent 자동 발사)
- `backend/app/routes/ops.py` (/ops/check 추가)
- `frontend/package.json` (web-vitals ^4.2.0)
- `frontend/src/{main,App}.tsx` (init + PageTracker + /ops/analytics 라우트)
- `frontend/src/lib/api.ts` (error.api 자동 트래킹)
- `frontend/src/routes/LoginCallback.tsx` (linkUser 호출)
- `frontend/src/routes/Login.tsx` (data-track 부착)
- `frontend/src/components/pixel/BottomNav.tsx` (data-track 부착)

**검증:**
- `npx tsc --noEmit` ✅
- `npx vite build` ✅ (web-vitals 별도 청크 7.24KB, 메인 789KB 경고는 기존 동일)
- 모든 신규/수정 Python 파일 ast.parse 통과 ✅

### 코드 리뷰 (Explore 에이전트 2개 병렬) 후 수정 (2026-05-20)
- **Block 수정** `app/analytics/pubsub.py` — `await pubsub.close()` → hasattr 가드로 aclose/close 안전 호출 (redis-py 5.x 호환)
- **Block 수정** `frontend/src/lib/analytics-stream.ts` — `EventSource(url, { withCredentials: true })` → `EventSource(url)` (withCredentials 표준 미지원, 토큰을 query 로 보내고 있어 쿠키 불필요)
- **Warn 개선** `app/analytics/counters.py` + `app/routes/events.py` — 배치 ingest 시 100 round-trip → 1 round-trip (`bump_event_counters_batch` 신규)
- 재검증: tsc + vite build + py ast 모두 ✅

**남은 사용자 액션:**
1. `! railway login` (대화형, 에이전트 불가)
2. `railway link` → intelligent-wholeness 선택
3. `git push` → Railway 자동 배포 → `railway logs --service backend | grep -i alembic` 으로 0010 적용 확인
4. 운영자 카카오 ID 로 `/ops/analytics` 접속해서 KPI/차트/실시간 스트림 확인
5. `railway connect Redis` → `MONITOR` 켜놓고 클라이언트 클릭 → `analytics:*` 키 INCR/PFADD 흐름 확인
6. `railway connect Postgres` → `SELECT count(*), event_type FROM events GROUP BY 1 ORDER BY 1 DESC;` 로 row 적재 검증
