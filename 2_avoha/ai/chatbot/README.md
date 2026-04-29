# 닥토 공방 카카오톡 챗봇

일상 기록을 감정 원석으로 저장해주는 카카오톡 채널 챗봇.

## 서비스 흐름

```
사용자 → 카카오톡 → 오픈빌더 → FastAPI 서버
                                      ↓ (즉시 useCallback:true 반환)
                               BackgroundTask → Claude Haiku AI
                                      ↓                ↓
                              Supabase DB ←────── 원석 결정
                              Railway DB ←────── (동시 저장)
                                      ↓
                              callbackUrl → 카카오톡 응답
```

## 주요 기능

| 기능 | 설명 |
|---|---|
| 텍스트 기록 | 일상 텍스트 → AI 감정 분류 → 원석 확인 → 저장하기 버튼으로 최종 저장 |
| 사진 기록 | 사진 전송 → 텍스트 유도 (10분 타임아웃) → 사진+텍스트 분류 |
| 복수 감정 | 여러 감정 감지 시 감지된 감정만 퀵버튼으로 제시 → 사용자 최종 선택 |
| 다른 감정 선택 | 저장 전 AI 분류 결과가 맞지 않으면 직접 감정 변경 가능 |
| 기록 여부 판단 | AI가 인사말/의미없는 입력 감지 → 일상 기록 요청 + 대기 상태 초기화 |
| 감정 퀵 버튼 | 분류 실패 시 10가지 감정 버튼으로 직접 선택 |
| 하루 5회 제한 | 저장하기 클릭 시 채집권 차감, 소진 후에도 기록 허용 |
| 원석 조회 | "내 원석" / "원석 보기" / "가방" / "인벤토리" 입력 시 캐러셀 카드로 표시 |
| 도감 | "도감" 입력 시 10가지 원석 목록 안내 |
| 채집 완료 카드 | basicCard로 원석 이미지 + 원석(감정) 표시 + 웹사이트 링크 버튼 |
| AI 판단 기록 | gem(최종) + ai_gems(AI 초기 판단) 별도 저장으로 분류 추적 가능 |
| 위험 기록 감지 | 자살/자해 키워드 → 자살예방 문구 + 운영자 이메일 알림 |
| 유해 기록 감지 | 유해 키워드 → 채집 거부 + 운영자 이메일 알림 |
| 분류 2회 실패 | 운영자 이메일 알림 + 운영자 연결 안내 |
| 콜백 비동기 처리 | 오픈빌더 콜백 토큰으로 5초 제한 회피 → AI 분류 후 callbackUrl로 응답 전달 |
| 타임아웃 재시도 | AI 분류 타임아웃 시 "다시 시도 🔄" 버튼으로 원본 텍스트 재분류 |
| 상태 맥락 유지 | 인벤토리/도감 조회 시 pending 상태에 따라 퀵버튼 자동 분기 |
| 웰컴 메시지 | 오픈빌더 웰컴 블록에서 설정 |

## 감정-원석 매핑

| 카테고리 | 감정 | 원석 |
|---|---|---|
| 평온 | 무탈 | 월장석 🤍 |
| 평온 | 평온 | 아쿠아마린 🩵 |
| 행복 | 뿌듯 | 황수정 💛 |
| 행복 | 기쁨 | 루비 ❤️ |
| 행복 | 만족 | 앰버 🟠 |
| 행복 | 설렘 | 로즈쿼츠 🌸 |
| 부정 | 슬픔 | 사파이어 💙 |
| 부정 | 짜증 | 가넷 🔴 |
| 부정 | 후회 | 연수정 🤎 |
| 부정 | 위로 | 오팔 🫧 |

## 기술 스택

| 항목 | 선택 |
|---|---|
| 백엔드 | FastAPI + uvicorn |
| AI | Claude Haiku (claude-haiku-4-5) |
| DB | Supabase (PostgreSQL) + Railway PostgreSQL |
| 배포 | Railway |
| 챗봇 플랫폼 | 카카오 i 오픈빌더 |
| 알림 | Gmail SMTP |

## 환경 변수 (.env)

```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
ALERT_EMAIL=
GMAIL_APP_PASSWORD=
RAILWAY_DATABASE_URL=
```

## 실행 방법

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

## 배포

- **운영**: Railway (`https://sentiment-chatbot-production.up.railway.app/webhook`)
- **개발**: ngrok → 오픈빌더 스킬 URL 임시 교체

## Supabase 스키마

```sql
create table gems (
  id bigint generated always as identity primary key,
  user_id text not null,
  gem text not null,
  record_text text,
  has_photo boolean default false,
  image_url text,
  ai_gems text,
  created_at timestamptz default now()
);
```

## Railway DB 스키마

```sql
create table chatbot (
  id bigint generated always as identity primary key,
  user_id text not null,
  gem text not null,
  record_text text,
  has_photo boolean default false,
  image_url text,
  ai_gems text,
  created_at timestamptz default now()
);
```

## 웹훅 엔드포인트

`POST /webhook` — 카카오 오픈빌더 스킬 URL로 등록
