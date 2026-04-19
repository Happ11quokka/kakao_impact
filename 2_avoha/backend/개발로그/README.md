# 아보하 백엔드 개발 로그

BE 파트의 의사결정·삽질·완료 기록. 시간순 정렬.

## 목차

| 번호 | 주제 | 날짜 | 상태 |
|---|---|---|---|
| [01](./01-kakao-developers-setup.md) | Kakao Developers 앱·OAuth 셋업 | 2026-04-17 | 완료 |
| [02](./02-db-schema-seed.md) | BE-2 · DB 스키마 + emotions 시드 | 2026-04-17 | 완료 |
| [03](./03-be-3-fastify-oauth.md) | BE-3 · Fastify + Kakao OAuth + /me | 2026-04-18 | 완료 (브라우저 수동 검증 대기) |
| [04](./04-be-4-to-12-api-surface.md) | BE-4~8·12 · API 표면 (webhook, ops/SSE, inventory·세공, events, health) | 2026-04-18 | 완료 (DB·Redis 통합 수동 검증 대기) |

## 진행 중 / 다음

- **BE-1** — Railway 프로비저닝 + 도메인 + env 주입
- **BE-5** — `avoha-agent` 워커 연동 (AI 파트와 계약: `emotion-queue` consume, `ai_suggestion` 업데이트, status='proposed')
- **BE-9** — rembg 업스트림 연결 + 폴라로이드 폴백
- **BE-10/11** — 알림톡 cron, 관리자 스크립트

## 참조

- PRD: [`../../../docs/avoha/2026-04-17-avoha-prd.md`](../../../docs/avoha/2026-04-17-avoha-prd.md)
- 백엔드 README: [`../README.md`](../README.md)

## 로그 작성 규칙

- 파일명: `NN-주제.md` (두 자리 번호)
- 맨 위 섹션: **목표** / **결정** / **수행 단계** / **완료 상태** / **삽질** / **다음**
- "결정" 은 이유와 함께 (향후 회고·온보딩용)
- "삽질" 은 증상 → 원인 → 해결 → 교훈 포맷
