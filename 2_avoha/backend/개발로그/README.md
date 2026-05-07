# 아보하 백엔드 개발 로그

BE 파트의 의사결정·삽질·완료 기록. 시간순 정렬.

## 목차

| 번호 | 주제 | 날짜 | 상태 |
|---|---|---|---|
| [01](./01-kakao-developers-setup.md) | Kakao Developers 앱·OAuth 셋업 | 2026-04-17 | 완료 |
| [02](./02-db-schema-seed.md) | BE-2 · DB 스키마 + emotions 시드 | 2026-04-17 | 완료 |
| [03](./03-be-3-fastify-oauth.md) | BE-3 · Fastify + Kakao OAuth + /me | 2026-04-18 | 완료 (브라우저 수동 검증 대기) |
| [04](./04-be-4-to-12-api-surface.md) | BE-4~8·12 · API 표면 (webhook, ops/SSE, inventory·세공, events, health) | 2026-04-18 | 완료 (DB·Redis 통합 수동 검증 대기) |
| [05](./05-fe-be-integration-analysis.md) | FE↔BE 연동 현황 진단 및 차기 우선순위 결정 | 2026-05-07 | 분석 완료 (구현은 차기 세션) |
| [06](./06-fe-be-ai-integration-cleanup.md) | FE↔BE↔Chatbot 통합 정상화 + 더미/UX 정리 (Pivot 회복 세션) | 2026-05-07 | 완료 (production 배포 검증) |

## 진행 중 / 다음

- ~~**AuthGate 정상화 (FE)**~~ ✅ 완료 (06 세션, commit `bdb6f04`/`8ecd751`)
- ~~**채집권 동기화**~~ ✅ 완료 (06 세션, commit `84a42dd` — chatbot이 `collection_tickets` 직접 차감)
- **BE-1** — Railway 프로비저닝 + 도메인 + env 주입
- **BE-5** — `avoha-agent` 워커 연동 (AI 파트와 계약: `emotion-queue` consume, `ai_suggestion` 업데이트, status='proposed')
- **BE-9** — rembg 업스트림 연결 + 폴라로이드 폴백
- **BE-10/11** — 알림톡 cron, 관리자 스크립트
- **BE-13 (제안)** — `GET /catalog/emotions` (CollectionBook 도감화, 우선순위 중)
- **BE-14 (제안)** — `chatbot ↔ users` 매핑 검증 스크립트
- **BE-15 (의심 포인트)** — emotion 시드에 `anxiety`(불안) 매핑 raw code 0개. FE의 5대 카테고리(`sadness/anxiety/anger/joy/complex`) 중 anxiety는 디자인 슬롯만 있고 BE 시드 10개(untroubled, serenity, pride, joy, satisfaction, flutter, sadness, annoyance, regret, solace) 중 어디에도 매핑 안 됨. (a) 시드에 anxiety 추가 (b) 디자인에서 anxiety 카드 제거 (c) calm 계열을 anxiety로 재배치 중 결정 필요. 현재 FE는 calm 계열을 complex로 fallback (`lib/emotion-category.ts`).

## 참조

- PRD: [`../../../docs/avoha/2026-04-17-avoha-prd.md`](../../../docs/avoha/2026-04-17-avoha-prd.md)
- 백엔드 README: [`../README.md`](../README.md)

## 로그 작성 규칙

- 파일명: `NN-주제.md` (두 자리 번호)
- 맨 위 섹션: **목표** / **결정** / **수행 단계** / **완료 상태** / **삽질** / **다음**
- "결정" 은 이유와 함께 (향후 회고·온보딩용)
- "삽질" 은 증상 → 원인 → 해결 → 교훈 포맷
