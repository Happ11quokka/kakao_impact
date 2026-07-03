# 유로그 (Ulog) — 메인 서비스

> **"당신의 하루가 그냥 지나가지 않도록."**
> 카카오톡으로 하루의 감정을 채집하고, AI가 세공한 감정 원석으로 돌아보는 감정인지 서비스.
> *아보하(Avoha)라는 이름으로 시작해 유저스터디를 거쳐 유로그로 리브랜딩했습니다.*

전체 스토리·성과·데모 영상: [루트 README](../README.md) · 시스템 상세: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

---

## 사용자가 경험하는 기능

### 🤖 카카오톡 챗봇 — 감정 채집의 입구 → [`ai/chatbot/`](ai/chatbot/)
- 별도 앱 설치 없이, 챗봇 **'로기'** 에게 하루를 툭 던지듯 기록
- AI가 **2단계(1차 분류 → 2차 검증)** 로 감정을 분류해 **원석 카드**로 회신
- 단순 모드 / 대화 모드 / 오늘 기록 / 오늘 분석 4가지 진입점
- 아무 말이나 보내도 `기록아님`·`일상기록`을 알아서 판별
- 부정적 감정이 반복될 때만 조심스럽게 **자기인지 질문**을 던짐

### 💎 홈 · 오늘의 마음 → [`frontend/`](frontend/) + [`backend/`](backend/)
- 로기를 움직여 오늘 채집된 **감정 원석을 확인·세공**
- 챗봇에서 기록하면 웹 화면에 **즉시 반영** (SSE 실시간 인벤토리)
- 오늘의 원석함 — 하루 감정 분포를 한눈에

### 🗓 캘린더 회고
- 달력에서 날짜별 원석과 **기록 원문**을 다시 만나기
- 감정이 잘못 분류됐다면 그 자리에서 **재분류**

### 📊 감정 분석
- 주간/월간 **감정 패턴 시각화** — 계열을 펼쳐 세부 감정까지
- **감정 리캡** — "웃음이 가장 많았던 순간이에요" 같은 되돌아보기 카드

### 📖 캐릭터 도감 · 원석 등급
- 수집한 원석과 캐릭터를 도감으로 모으는 게이미피케이션

---

## 폴더별 역할 (기능 → 코드 위치)

| 폴더 | 역할 | 상태 |
|---|---|---|
| [`frontend/`](frontend/) | 위 화면 전부 — React 19 PWA, Kakao OAuth 로그인 | 🟢 라이브 |
| [`backend/`](backend/) | 원석 저장·세공·재분류 API, SSE 실시간 인벤토리, 세션 인증, DB 마이그레이션 | 🟢 라이브 |
| [`ai/chatbot/`](ai/chatbot/) | 카카오 webhook 수신 + `gpt-4.1-mini` 2단계 감정분류 + 결과 카드 회신 | 🟢 라이브 |
| [`ai/agent/`](ai/agent/) | 사진 이벤트 그룹핑 에이전트 — PRD 설계만 | ⚪ 미배포 |
| [`ai/rembg/`](ai/rembg/) | 사진 누끼(배경 제거) 서비스 — 스캐폴드 | ⚪ 미배포 |
| [`ai/ops/`](ai/ops/) | 프롬프트 회고·학습 데이터 추출 스크립트 | 🔧 도구 |
| [`design/`](design/) | 브랜드·와이어프레임·픽셀 스프라이트(원석/로기) 에셋 | 🎨 에셋 |
| [`ops/`](ops/) | 운영 콘솔(`/ops/*`) + 데모 시딩·데이터 동기화 스크립트 | 🔧 도구 |

## 데이터 흐름

```
카카오톡 사용자 ──> Kakao i 오픈빌더 ──POST /webhook──> ai/chatbot (FastAPI)
                                                          │  gpt-4.1-mini ×2
                                                          ▼
PWA 사용자 ──Kakao OAuth──> frontend (React 19) ◄──HTTP+SSE──> backend (FastAPI) ──> PostgreSQL · Redis
```

배포: Railway (`intelligent-wholeness`) — backend / frontend / chatbot / Postgres / Redis · NIXPACKS Python 3.12

## 로컬 실행

```bash
# 백엔드
cd backend && cp .env.example .env
pip install -r requirements.txt
python migrate.py && uvicorn app.main:app --reload

# AI 챗봇
cd ai/chatbot && cp .env.example .env
pip install -r requirements.txt
uvicorn main:app --port 2333

# 프론트엔드
cd frontend && npm install && npm run dev
```

요구사항: **Python 3.12** · **Node 22+** · PostgreSQL · Redis (또는 Railway CLI). 파트별 상세는 각 폴더 README 참고.
