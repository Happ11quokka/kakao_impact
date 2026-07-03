# 아보하 (Avoha) — MVP 프로젝트 루트

> "아무 일 없는 보통의 하루"를 채집·세공하는 게임화 아카이빙 서비스.
> 5일 Wizard-of-Oz 방식 유저 테스트용 MVP.

**PRD 전문**: [`../docs/avoha/2026-04-17-avoha-prd.md`](../docs/avoha/2026-04-17-avoha-prd.md)

---

## 파트 분리 (폴더별 독립 작업)

| 파트 | 경로 | 담당 | 스택 요약 |
|---|---|---|---|
| **프론트엔드** | [`frontend/`](frontend/) | FE 엔지니어 | Vite + React 19 + TS + Tailwind v4 + PWA |
| **백엔드** | [`backend/`](backend/) | BE 엔지니어 | Node 22 + Fastify + Drizzle + Postgres + Redis |
| **AI - 에이전트** | [`ai/agent/`](ai/agent/) | AI 엔지니어 | TS BullMQ 워커, GPT-4.1 mini / Gemini 2.5 Flash |
| **AI - 누끼** | [`ai/rembg/`](ai/rembg/) | AI 엔지니어 | Python 3.11 + FastAPI + rembg |
| **디자인** | [`design/`](design/) | 디자이너 | Figma, Kenney 팩, 커스텀 픽셀 스프라이트 |
| **운영** | [`ops/`](ops/) | PM + 운영자 | 운영 콘솔(웹), 시드/동기화 스크립트 |

각 폴더는 독립 개발 가능. 공통 의존성 없음(프론트·백엔드·AI agent는 각자 `node_modules`, 누끼는 `venv`).

---

## 파트 간 인터페이스 (경계)

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│ frontend │ ← HTTP → │ backend  │ ← Queue →│ ai/agent │
│  (PWA)   │ ← SSE ── │ (API)    │          │ (worker) │
└──────────┘          └────┬─────┘          └──────────┘
                           │
                           │ HTTP (내부)
                           ▼
                      ┌──────────┐
                      │ ai/rembg │
                      │ (python) │
                      └──────────┘

┌──────────┐
│  design  │ → frontend/public/ 에 스프라이트 배포
│ (assets) │ → ops/console/ 에 운영 UI 스타일 공유
└──────────┘

┌──────────┐
│   ops    │ → backend/webhook → kakao_messages 테이블 확정
│          │ → 시드/동기화 스크립트 (backend와 동일 DB 접속)
└──────────┘
```

**공유 계약**
- 감정 코드(10종 slug): `backend/src/db/seeds/emotions.ts` 가 원천. FE·AI·Design 은 이 리스트를 import/참조
- API 타입: `backend`에서 Zod 스키마 export → FE·운영 콘솔에서 타입 공유
- 이벤트 이름: PRD 섹션 8.3 `events.event_type` 정규 리스트 고정

---

## 로컬 개발 체크리스트 (각 파트 첫 실행 시)

1. Node 22+ / Python 3.11+ 설치
2. Docker (Postgres + Redis) 또는 Railway CLI 로그인
3. `cp .env.example .env` (각 파트 루트)
4. 각 폴더 README 따라 의존성 설치·실행

---

## 일정 & 담당

| 날짜 | Frontend | Backend | AI | Design | Ops |
|---|---|---|---|---|---|
| 4/17 Fri | FE-1~3 | BE-1~4 | AI-1~3 | DE-1~3 | 동의서·채널 |
| 4/18 Sat | FE-4~6 | BE-5~7 | AI-4~5 | DE-4 착수 | 랜딩 공개 |
| 4/19 Sun | FE-7~8 | BE-8 | AI-6~7 | DE-4~5 완료 | 리허설 5명 |
| 4/20 Mon | FE-9~10 | BE-9~10 | AI-8 | DE-6~7 | **1차 30명 오픈** |
| 4/21 Tue | FE-11~12 | BE-11~12 | AI-9~10 | DE-8~10 | 테스트 종료 |

상세: [PRD 섹션 9](../docs/avoha/2026-04-17-avoha-prd.md)

---

## 노트

- 본 구조는 PRD 섹션 13(파일 경로)의 분산 트리(`services/avoha-api/` 등)를 **파트별 수직 집약**으로 재정리한 것. 개발 편의상 한 프로젝트 폴더 안에서 파트를 나란히 본다.
- 기존 `1_avoha/`(소확행 웹앱, 1차 MVP 테스트)는 **투자자 데모용**으로 병행 존속. 본 프로젝트와 코드/자산 공유 없음.
