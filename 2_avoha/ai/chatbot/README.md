# 닥토 공방 카카오톡 챗봇

일상 기록을 감정 조각으로 저장해주는 카카오톡 채널 챗봇.

## 서비스 흐름

```
사용자 → 카카오톡 → 오픈빌더 → FastAPI 서버
                                      ↓ (즉시 useCallback:true 반환)
                               BackgroundTask → OpenRouter (Gemma 4 26B)
                                      ↓                ↓
                              Supabase DB ←────── 조각 결정
                              Railway DB ←────── (동시 저장)
                                      ↓
                              callbackUrl → 카카오톡 응답
```

## 주요 기능

| 기능 | 설명 |
|---|---|
| 텍스트 기록 | 일상 텍스트 → AI 감정 분류 → 조각 확인 → 저장하기 버튼으로 최종 저장 |
| 사진 기록 | 사진 전송 → 텍스트 유도 (10분 타임아웃) → 사진+텍스트 분류 |
| 복수 감정 | 여러 감정 감지 시 감지된 감정만 퀵버튼으로 제시 → 사용자 최종 선택 |
| 다른 감정 선택 | 저장 전 AI 분류 결과가 맞지 않으면 직접 감정 변경 가능 |
| 기록 여부 판단 | AI가 인사말/의미없는 입력 감지 → 일상 기록 요청 + 대기 상태 초기화 |
| 감정 퀵 버튼 | 분류 실패 시 20가지 감정 버튼으로 직접 선택 |
| 하루 5회 제한 | 저장하기 클릭 시 채집권 차감, 소진 후에도 기록 허용 |
| 채집권 DB 동기화 | OAuth 로그인 유저는 Railway `collection_tickets` 테이블 우선 차감, 미로그인 시 인메모리 fallback |
| 원석 조회 | "내 원석" / "원석 보기" / "가방" / "인벤토리" 입력 시 basicCard로 표시 |
| 도감 | "도감" 입력 시 20가지 감정 목록 안내 |
| 채집 완료 카드 | basicCard로 해당 감정 원석 이미지 + 채집 완료 메시지 + 웹사이트 링크 버튼 |
| AI 판단 기록 | gem(최종) + ai_gems(AI 초기 판단) 별도 저장으로 분류 추적 가능 |
| gems 테이블 동기화 | 저장 시 Railway `gems` 테이블에도 INSERT → 웹 인벤토리 연동 |
| 위험 기록 감지 | 자살/자해 키워드 → 자살예방 문구 + 운영자 이메일 알림 |
| 유해 기록 감지 | 유해 키워드 → 채집 거부 + 운영자 이메일 알림 |
| 분류 2회 실패 | 운영자 이메일 알림 + 운영자 연결 안내 |
| 콜백 비동기 처리 | 오픈빌더 콜백 토큰으로 5초 제한 회피 → AI 분류 후 callbackUrl로 응답 전달 |
| 타임아웃 재시도 | AI 분류 타임아웃 시 "다시 시도 🔄" 버튼으로 원본 텍스트 재분류 |
| 상태 맥락 유지 | 인벤토리/도감 조회 시 pending 상태에 따라 퀵버튼 자동 분기 |
| 부정감정 누적 알림 | 주간 70% 이상 부정감정 또는 3일 연속 부정감정 시 채집 완료 카드에 안내 추가 |
| 재방문 인사 | 역대 첫 접속·당일 첫 접속 시 인사말 prepend |
| 웰컴 메시지 | 오픈빌더 웰컴 블록에서 설정 |

## 감정-조각 매핑 (20개)

| 카테고리 | 감정 | 조각명 | 이미지 파일 |
|---|---|---|---|
| 슬픔 계열 | 우울함 | 우울함 조각 | depression.png |
| 슬픔 계열 | 외로움 | 외로움 조각 | loneliness.png |
| 슬픔 계열 | 상실감 | 상실감 조각 | loss.png |
| 슬픔 계열 | 서러움 | 서러움 조각 | sorrow.png |
| 슬픔 계열 | 실망감 | 실망감 조각 | disappointment.png |
| 불안/두려움 계열 | 걱정 | 걱정 조각 | worry.png |
| 불안/두려움 계열 | 긴장감 | 긴장감 조각 | tension.png |
| 불안/두려움 계열 | 위축감 | 위축감 조각 | timidity.png |
| 분노 계열 | 짜증 | 짜증 조각 | irritation.png |
| 분노 계열 | 억울함 | 억울함 조각 | resentment.png |
| 분노 계열 | 화남 | 화남 조각 | anger.png |
| 분노 계열 | 적대감 | 적대감 조각 | hostility.png |
| 기쁨/긍정 계열 | 즐거움 | 즐거움 조각 | joy.png |
| 기쁨/긍정 계열 | 감사함 | 감사함 조각 | gratitude.png |
| 기쁨/긍정 계열 | 설렘 | 설렘 조각 | flutter.png |
| 기쁨/긍정 계열 | 뿌듯함 | 뿌듯함 조각 | pride.png |
| 기쁨/긍정 계열 | 편안함 | 편안함 조각 | serenity.png |
| 복잡/모호 계열 | 무기력함 | 무기력함 조각 | lethargy.png |
| 복잡/모호 계열 | 공허함 | 공허함 조각 | emptiness.png |
| 복잡/모호 계열 | 후회 | 후회 조각 | regret.png |

## 기술 스택

| 항목 | 선택 |
|---|---|
| 백엔드 | FastAPI + uvicorn |
| AI | OpenRouter — google/gemma-4-26b-a4b-it:free |
| DB | Supabase (PostgreSQL) + Railway PostgreSQL |
| 배포 | Railway |
| 챗봇 플랫폼 | 카카오 i 오픈빌더 |
| 알림 | Gmail SMTP |

## 환경 변수 (.env)

```
OPENROUTER_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
ALERT_EMAIL=
GMAIL_APP_PASSWORD=
RAILWAY_DATABASE_URL=
```

## 실행 방법

```bash
venv\Scripts\activate
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
-- 채집 기록
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

-- 웹 인벤토리 연동 (chatbot 저장 시 동시 INSERT)
create table gems (
  id bigint generated always as identity primary key,
  user_id uuid references users(id),
  emotion_code text not null,
  gem_name text not null,
  record_text text,
  image_url text,
  created_at timestamptz default now()
);

-- 채집권 (OAuth 로그인 유저 전용, 일 5회)
create table collection_tickets (
  user_id uuid references users(id),
  date date not null,
  remaining int not null default 5,
  primary key (user_id, date)
);

-- 카카오 provider_user_key → users.id 조회용
create table users (
  id uuid primary key default gen_random_uuid(),
  provider_user_key text unique not null
);
```

## 웹훅 엔드포인트

`POST /webhook` — 카카오 오픈빌더 스킬 URL로 등록
