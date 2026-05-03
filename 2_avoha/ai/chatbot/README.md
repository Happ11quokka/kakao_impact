# 닥토 공방 카카오톡 챗봇

일상 기록을 감정 원석으로 저장해주는 카카오톡 채널 챗봇.

## 서비스 흐름

```
사용자 → 카카오톡 → 오픈빌더 → FastAPI 서버
                                      ↓ (즉시 useCallback:true 반환)
                               BackgroundTask → Gemma 4 26B AI (OpenRouter)
                                      ↓                ↓
                              Supabase DB ←────── 원석 결정
                              Railway DB ←────── (동시 저장)
                                      ↓
                              callbackUrl → 카카오톡 응답
```

## 주요 기능

| 기능 | 설명 |
|---|---|
| 텍스트 기록 | 일상 텍스트 → AI 3분류(기록아님/일상기록/감정기록) → 원석 확인 → 맞아요 버튼으로 최종 저장 |
| 일상기록 플로우 | 감정 없는 일상 감지 시 [감정 추가하기] / [이대로 저장] 선택 (채집권 미차감) |
| 사진 기록 | 사진 전송 → [감정 적기] / [일상으로 저장] 버튼 → 텍스트 유도 (10분 타임아웃, 고지 포함) |
| 복수 감정 | 여러 감정 감지 시 (최대 3개) [모두 채집] / [골라서 채집] 선택 |
| 재분류 | 다시 찾을게요 → 카테고리 선택 → 세부 감정 선택 → 재시도 시 전체 20개 버튼 |
| 기록 여부 판단 | AI가 인사말/의미없는 입력 감지 → 일상 기록 요청 + 대기 상태 초기화 |
| 하루 5회 제한 | 맞아요 클릭 시 채집권 차감, 소진 후에도 기록 허용 |
| 채집권 잔여 메시지 | 저장 완료 시 잔여 채집권 수 안내 (4/3/2/1/0개) |
| 맥락적 버튼 | 원석 확정 시 "{원석명} 채집하기 💎" 형태로 버튼 라벨 동적 표시 |
| 재방문 인사 | 역대 첫 접속 / 당일 첫 접속 시 인사 메시지 표시 |
| 부정감정 누적 알림 | 주간 70% 이상 or 3일 연속 부정감정 저장 시 공감 메시지 표시 |
| 원석 가방 | "내 원석" 입력 시 오늘 N개 채집 · 총 M개 보유 + 채집권 잔여 안내 |
| 도감 | "도감" 입력 시 20개 감정 원석 목록 카테고리별 안내 |
| 채집 완료 카드 | basicCard로 원석명 + 세공소 가기 웹링크 버튼 |
| 채집 안내 | "채집 안내" 입력 시 서비스 이용 방법 안내 |
| AI 판단 기록 | gem(최종) + ai_gems(AI 초기 판단) 별도 저장으로 분류 추적 가능 |
| 위험 기록 감지 | 자살/자해 키워드 → 자살예방 문구 + 운영자 이메일 알림 |
| 유해 기록 감지 | 유해 키워드 → 채집 거부 + 운영자 이메일 알림 |
| 분류 2회 실패 | 운영자 이메일 알림 + 운영자 연결 안내 |
| 콜백 비동기 처리 | 오픈빌더 콜백 토큰으로 5초 제한 회피 → AI 분류 후 callbackUrl로 응답 전달 |
| 타임아웃 재시도 | AI 분류 타임아웃 시 "다시 시도 🔄" 버튼으로 원본 텍스트 재분류 |
| KST 자정 리셋 | 채집권 카운트 자정(00:00 KST) 기준으로 초기화 |

## 감정-원석 매핑 (20개)

| 카테고리 | 감정 | 원석 |
|---|---|---|
| 슬픔 계열 | 우울함 | 우울함 원석 |
| 슬픔 계열 | 외로움 | 외로움 원석 |
| 슬픔 계열 | 상실감 | 상실감 원석 |
| 슬픔 계열 | 서러움 | 서러움 원석 |
| 슬픔 계열 | 실망감 | 실망감 원석 |
| 불안/두려움 계열 | 걱정 | 걱정 원석 |
| 불안/두려움 계열 | 긴장감 | 긴장감 원석 |
| 불안/두려움 계열 | 위축감 | 위축감 원석 |
| 분노 계열 | 짜증 | 짜증 원석 |
| 분노 계열 | 억울함 | 억울함 원석 |
| 분노 계열 | 화남 | 화남 원석 |
| 분노 계열 | 적대감 | 적대감 원석 |
| 기쁨/긍정 계열 | 즐거움 | 즐거움 원석 |
| 기쁨/긍정 계열 | 감사함 | 감사함 원석 |
| 기쁨/긍정 계열 | 설렘 | 설렘 원석 |
| 기쁨/긍정 계열 | 뿌듯함 | 뿌듯함 원석 |
| 기쁨/긍정 계열 | 편안함 | 편안함 원석 |
| 복잡/모호 계열 | 무기력함 | 무기력함 원석 |
| 복잡/모호 계열 | 공허함 | 공허함 원석 |
| 복잡/모호 계열 | 후회 | 후회 원석 |

> 원석명은 추후 확정 예정 (현재 임시명 사용)

## 기술 스택

| 항목 | 선택 |
|---|---|
| 백엔드 | FastAPI + uvicorn |
| AI | Gemma 4 26B A4B (google/gemma-4-26b-a4b-it:free via OpenRouter) |
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

- `gem` — 사용자가 최종 선택한 원석 (일상기록만 저장 시 `"일상기록"`)
- `ai_gems` — AI 초기 판단 원석 (단일: `"설렘 원석"`, 복수: `"설렘 원석,뿌듯함 원석"`, 분류 실패/타임아웃: null)

## 웹훅 엔드포인트

`POST /webhook` — 카카오 오픈빌더 스킬 URL로 등록
