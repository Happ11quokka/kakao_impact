# 유로그 (Ulog)

**U + log — "당신의 하루가 그냥 지나가지 않도록."** 카카오톡으로 하루의 감정을 채집하고, AI가 세공한 감정 원석으로 돌아보는 청년 감정인지(emotional-awareness) 서비스.

> 한양대학교 × 카카오테크포임팩트 · 2026

<p align="center">
  <!-- AI · Backend -->
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/SQLAlchemy-2.0_async-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white" alt="SQLAlchemy 2.0 async" />
  <img src="https://img.shields.io/badge/Pydantic-E92063?style=flat-square&logo=pydantic&logoColor=white" alt="Pydantic" />
  <img src="https://img.shields.io/badge/Alembic-2D6E8D?style=flat-square" alt="Alembic" />
  <img src="https://img.shields.io/badge/OpenAI-gpt--4.1--mini-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI gpt-4.1-mini" />
  <br/>
  <!-- Frontend -->
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 6" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/Zustand-443E38?style=flat-square&logo=react&logoColor=white" alt="Zustand" />
  <img src="https://img.shields.io/badge/React_Router-7-CA4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router 7" />
  <img src="https://img.shields.io/badge/Framer_Motion-0055FF?style=flat-square&logo=framer&logoColor=white" alt="Framer Motion" />
  <img src="https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white" alt="PWA" />
  <br/>
  <!-- Data · Infra -->
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/SSE-realtime-FF6600?style=flat-square" alt="Server-Sent Events" />
  <img src="https://img.shields.io/badge/Kakao_i_Open_Builder-FFCD00?style=flat-square&logo=kakaotalk&logoColor=black" alt="Kakao i Open Builder" />
  <img src="https://img.shields.io/badge/Kakao_OAuth-FFCD00?style=flat-square&logo=kakaotalk&logoColor=black" alt="Kakao OAuth" />
  <img src="https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white" alt="Railway" />
</p>

---

## 📖 프로젝트 여정

이 README는 **기술 문서**입니다. 사회혁신 **기획 · 문제정의 · 실험 설계 · 유저스터디 결과**까지의 전체 여정은 아래 포트폴리오에 정리되어 있습니다.

> 🔗 **[Notion 포트폴리오 — 유로그(Ulog) 사회혁신 프로젝트 여정](https://app.notion.com/p/38c1d0fae2de8132a60adaf04f1cf1d2)**

---

## 📄 Project Overview

[![유로그 컨셉 영상](docs/portfolio-assets/00_hero_concept.png)](docs/portfolio-assets/video1.mp4)

유로그(Ulog)는 **"힘든 건 아는데 뭐 때문인지 모르겠다"** 는 청년의 감정인지 결여 문제에서 출발했습니다. 기록 앱들이 실패하는 두 장벽 — ① 기록이 귀찮다, ② 기록이 뭘 돌려주는지 모른다 — 를 동시에 풀기 위해, 별도 앱 설치 없이 **카카오톡에서 마스코트 '로기'에게 하루를 툭 던지듯 말하면** AI가 감정을 분류해 **감정 원석**으로 돌려주는 게임화 아카이빙을 설계했습니다. 분류는 `gpt-4.1-mini` 2단계(classify → supervisor) 파이프라인이 수행하고, 사용자는 PWA 웹앱에서 원석을 확인·세공하며 캘린더 회고와 주간/월간 감정 분석으로 자신의 감정 패턴을 인지하게 됩니다. *아보하(Avoha)라는 이름으로 시작해 유저스터디를 거쳐 유로그(Ulog)로 리브랜딩·피벗한 프로젝트입니다.*

**1주 유저스터디(n=16) 핵심 결과:**

<table>
  <tr>
    <th width="280">지표</th>
    <th width="320">결과</th>
    <th width="400">비고</th>
  </tr>
  <tr>
    <td>AI 감정분류 정확도</td>
    <td><b>41.7% → 97.3%</b></td>
    <td>동일 잣대(사용자 정정), 수정률 2.7%</td>
  </tr>
  <tr>
    <td>감정인지 (사전→사후)</td>
    <td><b>3.60 → 3.90</b></td>
    <td>Cohen's d = 0.81 (탐색적)</td>
  </tr>
  <tr>
    <td>사용성 (SUS)</td>
    <td><b>71.25</b></td>
    <td>업계 평균 68 상회</td>
  </tr>
  <tr>
    <td>회고 만족도</td>
    <td>캘린더 <b>3.77</b> > AI 분석 3.36</td>
    <td>"분석"보다 "회고" → 피벗 근거</td>
  </tr>
</table>

> **핵심 통찰:** *"AI가 못 맞추는 게 아니라, 사용자가 다음 단계로 안 넘어온다."* — 병목은 모델이 아니라 **전환·습관 형성**.

## 🎥 Video

<table>
  <tr>
    <th width="200" align="center">컨셉 영상</th>
    <th width="200" align="center">챗봇 기록</th>
    <th width="200" align="center">홈 · 오늘의 마음</th>
    <th width="200" align="center">캘린더 회고</th>
    <th width="200" align="center">감정 분석</th>
  </tr>
  <tr>
    <td align="center"><a href="docs/portfolio-assets/video1.mp4">▶ video1</a></td>
    <td align="center"><a href="docs/portfolio-assets/video2.mp4">▶ video2</a></td>
    <td align="center"><a href="docs/portfolio-assets/video3.mp4">▶ video3</a></td>
    <td align="center"><a href="docs/portfolio-assets/video4.mp4">▶ video4</a></td>
    <td align="center"><a href="docs/portfolio-assets/video5.mp4">▶ video5</a></td>
  </tr>
</table>

---

## Architecture

```mermaid
flowchart LR
  U["카카오톡 사용자"] -->|"텍스트 / 사진"| KB["Kakao i 오픈빌더"]
  KB -->|"POST /webhook (5초 제한)"| CB["ai/chatbot<br>FastAPI · Py3.12"]
  CB -->|"gpt-4.1-mini x2<br>classify → supervisor"| CB
  U2["PWA 사용자"] -->|"Kakao OAuth"| FE["frontend<br>React 19 PWA"]
  FE -->|"HTTP + SSE"| BE["backend<br>FastAPI · Py3.12"]
  CB --> PG[("PostgreSQL")]
  BE --> PG
  BE --> RD[("Redis")]
  BE -->|"/sse/inventory (live)"| FE
```

<img src="docs/portfolio-assets/12_arch_ai_pipeline.png" alt="유로그 카카오톡 챗봇 — 감정 분류 파이프라인" width="820" />

> ⚠️ **설계 vs 배포.** 초기 설계는 Node(Fastify · Drizzle · BullMQ · Gemini) 스택이었으나, **실제 배포된 시스템은 Python(FastAPI · SQLAlchemy · OpenAI)** 입니다. 이 **Node → Python 피벗**(라이브 DB 위 무중단 ORM 스왑 포함)이 이 프로젝트에서 가장 값진 엔지니어링 스토리입니다.

---

## System Workflow

1. 사용자가 카카오톡에서 챗봇 **'로기'** 에게 하루의 순간을 보냅니다 (단순/대화 모드).
2. Kakao i 오픈빌더가 `POST /webhook` 호출 → `callbackUrl` 확인 즉시 `{useCallback: true}` 반환으로 **5초 제한을 우회**하고 백그라운드 분류로 전환합니다.
3. `classify_emotion()` — `gpt-4.1-mini` 1차 분류: 최대 3개 감정 / `기록아님` / `일상기록` 판별.
4. `supervisor_check()` — 2차 검증 노드가 과소·과잉 분류를 교정합니다 (실패·타임아웃 시 1차 결과로 graceful fallback).
5. 감정 원석이 PostgreSQL에 저장되고, 모든 LLM 호출은 per-webhook `trace_id`로 상관 로깅됩니다 → WoZ 실행이 라벨링된 학습 코퍼스가 됩니다.
6. 분류 결과 카드가 카카오톡으로 콜백 회신됩니다 (원석 1~3개 + "웹에서 기록 보기").
7. PWA(React 19)에서 Kakao OAuth 로그인 → **오늘의 마음**에서 로기를 움직여 원석을 확인·세공합니다 (SSE 실시간 인벤토리).
8. **캘린더 회고 · 주간/월간 감정 분석 · 감정 리캡**으로 감정 패턴 자기인지를 강화합니다.

---

## Key Features

### 1) 카카오톡 챗봇 감정 채집 — 진입장벽 제로

- 별도 앱 설치 없이 **평소 쓰는 카카오톡**에서 기록 — "기록의 귀찮음" 장벽 제거
- 단순 모드 / 대화 모드 / 오늘 기록 / 오늘 분석 4가지 진입점
- `기록아님`·`일상기록` 자동 판별로 아무 말이나 던져도 안전한 대화 경험
- ▶ 데모: [챗봇 기록 영상](docs/portfolio-assets/video2.mp4)

### 2) AI 2단계 감정분류 파이프라인

- **25개 감정(챗봇 UX 어휘) → 5계열 → 10개 표준 감정코드(DB)** 의 2계층 택소노미
- ① `classify_emotion()` 1차 분류 → ② `supervisor_check()` 2차 검증이 과분류 교정 — 단일 저가 모델 `gpt-4.1-mini` · temperature 0
- 정확도 **41.7% → 97.3%** (사용자 정정 기준, 2차 수정률 2.7%)
- 부정감정 한정·빈도 제어된 **자기인지 질문 트리거**로 감정 언어화 유도

<details>
<summary>📐 상세 플로우 다이어그램 (시나리오 분기 · 회고 질문 트리거)</summary>
<br>
<img src="docs/portfolio-assets/14_scenario_flow.png" alt="챗봇 시나리오 플로우" width="820" />
<img src="docs/portfolio-assets/13_reflection_flow.png" alt="자기회고 질문 트리거 플로우" width="820" />
</details>

### 3) 감정 원석 세공 & 게이미피케이션 — "기록이 돌려주는 것"

<table>
  <tr>
    <th width="250" align="center">홈 · 오늘의 마음</th>
    <th width="250" align="center">감정 원석</th>
    <th width="250" align="center">캐릭터 도감</th>
    <th width="250" align="center">원석 등급</th>
  </tr>
  <tr>
    <td align="center"><img src="docs/portfolio-assets/01_home_today.png" width="210" /></td>
    <td align="center"><img src="docs/portfolio-assets/04_gems_emotions.png" width="210" /></td>
    <td align="center"><img src="docs/portfolio-assets/05_character_dogam.png" width="210" /></td>
    <td align="center"><img src="docs/portfolio-assets/06_gem_grades.png" width="210" /></td>
  </tr>
</table>

- 기록이 **감정 원석**으로 돌아오고, 로기를 움직여 원석을 확인·세공 — SSE 실시간 인벤토리
- 도감·등급 시스템으로 수집 동기 부여
- ▶ 데모: [홈 영상](docs/portfolio-assets/video3.mp4)

### 4) 캘린더 회고 & 감정 분석

<table>
  <tr>
    <th width="333" align="center">자기인지 질문</th>
    <th width="333" align="center">캘린더 회고</th>
    <th width="333" align="center">마스코트 '로기'</th>
  </tr>
  <tr>
    <td align="center"><img src="docs/portfolio-assets/02_reflection_question.png" width="210" /></td>
    <td align="center"><img src="docs/portfolio-assets/03_calendar.png" width="210" /></td>
    <td align="center"><img src="docs/portfolio-assets/10_mascot_states.png" width="290" /></td>
  </tr>
</table>

- 날짜별 감정 원석과 기록 원문을 다시 만나는 **캘린더 회고** (만족도 3.77 — 최고점)
- 주간/월간 **감정 패턴 시각화 + 감정 리캡** ("웃음이 가장 많았던 순간이에요")
- ▶ 데모: [캘린더 영상](docs/portfolio-assets/video4.mp4) · [감정 분석 영상](docs/portfolio-assets/video5.mp4)

---

## Tech Stack

| 분류 | 스택 |
|---|---|
| **프론트엔드 (PWA)** — [`2_Ulog/frontend/`](2_Ulog/frontend/) | Vite 6 · React 19 · TypeScript · Tailwind v4 · Zustand · React Router 7 · Framer Motion · Recharts |
| **백엔드 (API)** — [`2_Ulog/backend/`](2_Ulog/backend/) | Python 3.12 · FastAPI · SQLAlchemy 2.0 (async) · asyncpg · Alembic · Pydantic · sse-starlette |
| **AI 챗봇** — [`2_Ulog/ai/chatbot/`](2_Ulog/ai/chatbot/) | Python 3.12 · FastAPI · psycopg2 · OpenAI `gpt-4.1-mini` |
| **데이터베이스** | PostgreSQL · Redis |
| **외부 연동** | Kakao i 오픈빌더 (챗봇 webhook · callback) · Kakao OAuth |
| **배포** | Railway (`intelligent-wholeness`) · NIXPACKS Python 3.12 핀 |

---

## 🙋 내 기여 (AI · 백엔드/인프라 리드)

> 임동현 — AI 감정분류 파이프라인과 백엔드/인프라 전체 담당. 팀의 기획·디자인·리서치를 **실제로 돌아가는 서비스**로 만드는 역할.

- **🤖 AI 파이프라인** — 챗봇이 쓰는 25개 감정 표현을 DB에 저장할 10개 표준 감정코드로 정리하고, AI가 1차로 분류한 결과를 2차 AI가 한 번 더 검증하는 **2단계 분류 구조**(classify → supervisor)를 설계. 이 구조와 프롬프트 개선으로 감정분류 정확도를 **41.7% → 97.3%** 로 끌어올림. 부정적 감정이 반복될 때만 조심스럽게 자기인지 질문을 던지는 트리거 로직도 설계.
- **⚙️ 백엔드/API** — 감정 기록이 저장되고 웹앱까지 흘러가는 **서버 전체**를 구축 (FastAPI + SQLAlchemy). 카카오톡 메시지 수집(webhook), 원석 획득이 웹 화면에 즉시 반영되는 실시간 통신(SSE), 로그인·세션 관리까지.
- **🚂 인프라/배포** — 사용자가 실제로 쓰고 있는 서비스를 **멈추지 않고** Node → Python 스택으로 교체 (라이브 DB 무중단 마이그레이션). Railway 배포가 Python 버전 문제로 반복해서 깨지던 원인을 찾아 해결하고, 데모용 더미 데이터는 실제 데이터와 섞이지 않게 분리·관리.
- **📊 데이터 분석** — "정확도 97%"가 착시가 아닌지 직접 검증. DB 기본값 때문에 정확도가 부풀려 보이는 함정을 찾아내 **실제 사용자가 확인한 기록만으로** 다시 측정하고, 체류시간·재분류율 같은 행동 로그에서 "병목은 AI가 아니라 전환"이라는 핵심 인사이트 도출.

---

## 🧑🏻‍💻👩🏻‍💻 Group Members

<table>
  <tr>
    <th width="300">이름</th>
    <th width="300">역할</th>
    <th width="400">전공</th>
  </tr>
  <tr>
    <td>박수진</td>
    <td>UI/UX</td>
    <td>데이터사이언스학부</td>
  </tr>
  <tr>
    <td>신용환</td>
    <td>PM</td>
    <td>경제금융학부</td>
  </tr>
  <tr>
    <td>이인명</td>
    <td>AI</td>
    <td>데이터사이언스학부</td>
  </tr>
  <tr>
    <td>임동현</td>
    <td>BE</td>
    <td>컴퓨터소프트웨어학부</td>
  </tr>
  <tr>
    <td>윤지찬</td>
    <td>FE</td>
    <td>데이터사이언스학부</td>
  </tr>
</table>

---

## 📂 Repository Structure

```
kakao_impact/
├── 1_avoha/            1차 MVP 테스트 — 소확행 모바일 웹앱 (Vite + React 19)
├── 2_Ulog/            유로그(Ulog) — 메인 프로젝트
│   ├── frontend/       PWA 프론트엔드 (React 19)
│   ├── backend/        FastAPI + SQLAlchemy + Postgres + Redis  ← 라이브
│   ├── ai/chatbot/     카카오 챗봇 (FastAPI + gpt-4.1-mini)     ← 라이브
│   ├── design/         디자인 에셋
│   └── ops/            운영 콘솔 + 스크립트
└── docs/               아키텍처 · 분석 문서 · 포트폴리오 자산
```

---

## License

Proprietary — 프로젝트별 라이선스 정책은 각 하위 디렉토리를 참조하세요.
