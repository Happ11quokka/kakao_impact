# Kakao Impact — 소확행 & 아보하

**카카오톡 기반 일상 감정/행복 아카이빙 프로젝트 레포지토리**

<p align="center">
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white" alt="Fastify" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white" alt="BullMQ" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
</p>

## Overview

이 모노레포는 카카오 임팩트 공모 맥락에서 시작된 두 개의 서비스 MVP를 담고 있습니다. 둘 다 "일상의 작은 감정과 기억을 모으고 가시화한다"는 공통 축을 공유하지만, 다른 메타포·UX·타겟으로 확장됩니다.

| 프로젝트 | 한 줄 설명 | 상태 | 경로 |
|---|---|---|---|
| **1. 소확행 (Sohwakhaeng)** | 일상의 '소소하지만 확실한 행복'을 사진·지도·챗봇으로 기록하는 모바일 웹앱 MVP | 투자자 데모용 (존속) | [`1_mvp/`](1_mvp/) |
| **2. 아보하 (Avoha)** | "아무 일 없는 보통의 하루"를 채집·세공하는 게임화 아카이빙 서비스 | 5일 Wizard-of-Oz MVP | [`2_avoha/`](2_avoha/) |

두 프로젝트는 코드·의존성을 공유하지 않고 독립적으로 개발 가능합니다.

---

## 1. 소확행 (Sohwakhaeng) — MVP

> 일상 속 '소소하지만 확실한 행복'을 기록하고, 지도 위에 남기며, 취미 추천과 포인트로 보상받는 모바일 웹앱.

### 주요 기능

- **온보딩 / 로그인** — 첫 진입 플로우
- **홈 지도** — 내가 기록한 소확행 장소를 Leaflet 지도로 확인
- **기록하기** — 사진/메모 캡처 → 챗봇 대화 → 인사이트 요약 → 포인트 적립
- **취미 추천** — 사용자 기록 기반 취미 큐레이션
- **프로필** — 누적 기록과 포인트 확인

### 기술 스택

React 19 · TypeScript · Vite 6 · React Router 7 · Zustand · Tailwind v4 · Leaflet · Zod · Vitest · fast-check

### 실행

```bash
cd 1_mvp
npm install
npm run dev         # 개발 서버
npm run build       # 프로덕션 빌드
npm test            # 유닛 + 속성 기반 테스트
```

상세: [`1_mvp/README.md`](1_mvp/README.md)

---

## 2. 아보하 (Avoha) — 파트 분리 MVP

> "아무 일 없는 보통의 하루"를 채집·세공하는 게임화 아카이빙 서비스. 5일 Wizard-of-Oz 방식 유저 테스트용 MVP.

### 파트 구성

| 파트 | 경로 | 스택 |
|---|---|---|
| **프론트엔드 (PWA)** | [`2_avoha/frontend/`](2_avoha/frontend/) | Vite · React 19 · TS · Tailwind v4 · PWA |
| **백엔드 (API)** | [`2_avoha/backend/`](2_avoha/backend/) | Node 22 · Fastify · Drizzle · PostgreSQL · Redis |
| **AI 에이전트 (워커)** | [`2_avoha/ai/agent/`](2_avoha/ai/agent/) | TS · BullMQ · GPT-4.1 mini · Gemini 2.5 Flash |
| **AI 누끼 (이미지 배경 제거)** | [`2_avoha/ai/rembg/`](2_avoha/ai/rembg/) | Python 3.11 · FastAPI · rembg |
| **디자인 (에셋)** | [`2_avoha/design/`](2_avoha/design/) | Figma · Kenney 팩 · 커스텀 픽셀 스프라이트 |
| **운영** | [`2_avoha/ops/`](2_avoha/ops/) | 운영 콘솔(웹) · 시드/동기화 스크립트 |

### 파트 간 인터페이스

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│ frontend │ ← HTTP → │ backend  │ ← Queue →│ ai/agent │
│  (PWA)   │ ← SSE ── │ (API)    │          │ (worker) │
└──────────┘          └────┬─────┘          └──────────┘
                           │ HTTP (내부)
                           ▼
                      ┌──────────┐
                      │ ai/rembg │
                      │ (python) │
                      └──────────┘
```

### 공유 계약

- **감정 코드(10종 slug)**: `2_avoha/backend/src/db/seeds/emotions.ts` 가 원천
- **API 타입**: `backend` 가 Zod 스키마 export → FE·운영 콘솔에서 공유
- **이벤트 이름**: PRD 섹션 8.3 `events.event_type` 정규 리스트

상세 일정 · 공유 계약 · 실행 가이드는 [`2_avoha/README.md`](2_avoha/README.md) 와 [`docs/avoha/2026-04-17-avoha-prd.md`](docs/avoha/2026-04-17-avoha-prd.md) 참조.

---

## 레포 구조

```
kakao_impact/
├── 1_mvp/              소확행 — 모바일 웹앱 MVP (Vite + React 19)
├── 2_avoha/            아보하 — 파트 분리 MVP
│   ├── frontend/       PWA 프론트엔드
│   ├── backend/        Fastify API + Postgres + Redis
│   ├── ai/
│   │   ├── agent/      BullMQ 워커 (GPT/Gemini)
│   │   └── rembg/      rembg 누끼 서비스 (Python)
│   ├── design/         디자인 에셋 (Figma, 픽셀 스프라이트)
│   └── ops/            운영 콘솔 + 스크립트
└── docs/
    └── avoha/          아보하 PRD · 기획 문서
```

## 개발 준비

1. **Node 22+** · **Python 3.11+** 설치
2. Docker (Postgres + Redis) 또는 Railway CLI
3. 각 파트 루트에서 `cp .env.example .env` 후 값 설정
4. 각 폴더 README 에 따라 의존성 설치/실행

## 라이선스

Proprietary — 프로젝트별 라이선스 정책은 각 하위 디렉토리를 참조하세요.
