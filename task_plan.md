# Task Plan — 아보하 사용자 행동 분석 시스템

## Goal
아보하 앱에 자동 행동 트래킹(페이지뷰·체류시간·클릭·챗봇 질문·에러)을 깔고, 운영자 전용 실시간 대시보드(`/ops/analytics`)를 만든다. 기존 `events` 테이블 + Redis 인프라 재활용. 배포·분석은 Railway CLI로 진행.

기획서 원본: `/Users/imdonghyeon/.claude/plans/cryptic-mixing-lighthouse.md`

## Phases (PR 단위)

| # | 단계 | 상태 |
|---|---|---|
| 0 | planning-with-files 파일 재작성 | complete |
| 1 | DB 마이그레이션 0010_analytics (anon_user_links + 인덱스) | complete |
| 2 | 백엔드 `/events` optional auth + `/auth/link-anon` | complete |
| 3 | 프론트 트래킹 SDK (analytics.ts + PageTracker + click-tracker) | complete |
| 4 | 서버측 자동 이벤트 (챗봇 + records.confirm-emotion 훅) | complete (기존 record_emotion_confirmed 그대로 활용) |
| 5 | Redis 카운터 + rate limit | complete |
| 6 | 집계 API (`/ops/analytics/*`) | complete |
| 7 | 대시보드 UI (`OpsAnalytics.tsx` + Recharts) | complete |
| 8 | SSE 실시간 (Redis Pub/Sub) | complete |
| 9 | data-track 부착 | complete (BottomNav 4탭 + 로그인 버튼; 필요시 더 부착) |

## 사용자 액션 (블로커)
- ⚠️ **`! railway login`** — 현재 Unauthorized. §8.3 Railway CLI 검증 명령을 쓰려면 사용자가 직접 로그인 필요.
- 로그인 후 `railway link` → `intelligent-wholeness` 선택.
- (배포 자체는 git push 트리거라 CLI 없이도 동작)

## Files Likely To Modify
**신규:**
- `2_avoha/backend/migrations/versions/0010_analytics.py`
- `2_avoha/backend/app/analytics/{__init__,pubsub,counters,rate_limit,queries}.py`
- `2_avoha/backend/app/routes/ops_analytics.py`
- `2_avoha/frontend/src/lib/{analytics,page-tracker,click-tracker,analytics-stream}.{ts,tsx}`
- `2_avoha/frontend/src/components/RequireOpsUser.tsx`
- `2_avoha/frontend/src/routes/OpsAnalytics.tsx`

**수정:**
- `2_avoha/backend/app/routes/events.py` — optional auth + anonId + pubsub publish
- `2_avoha/backend/app/routes/auth.py` — /auth/link-anon
- `2_avoha/backend/app/main.py` — 라우터 등록
- `2_avoha/backend/app/deps.py` — optional_user / require_ops_user
- `2_avoha/ai/chatbot/main.py` — webhook 후 events insert
- `2_avoha/frontend/package.json` — web-vitals 추가
- `2_avoha/frontend/src/{main.tsx,App.tsx,lib/api.ts,routes/LoginCallback.tsx}`

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |
