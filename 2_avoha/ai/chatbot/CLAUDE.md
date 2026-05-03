# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# 로컬 실행
venv\Scripts\activate
uvicorn main:app --reload

# 외부 노출 (개발용)
ngrok http 8000

# 패키지 설치
venv\Scripts\pip install -r requirements.txt
```

## Architecture

단일 파일 FastAPI 서버 (`main.py`). 카카오 i 오픈빌더에서 `POST /webhook`으로 요청이 들어온다.

**요청 흐름 (콜백 모드):**
```
카카오톡 → 오픈빌더 → POST /webhook
                            ↓ (즉시 {"useCallback": true} 반환)
                       BackgroundTask → OpenRouter (Gemma 4 26B) → Supabase + Railway DB
                            ↓
                       callbackUrl POST → 카카오 응답
```

**콜백 동작 방식:**
- 오픈빌더 블록에서 "콜백 사용" 설정 시 `userRequest.callbackUrl` 포함
- 서버는 즉시 `{"version":"2.0","useCallback":true}` 반환 (카카오 5초 제한 회피)
- `BackgroundTasks`로 AI 분류 후 `callbackUrl`에 POST하여 최종 응답 전달
- 봇테스트(BuilderBotTest)는 콜백 미지원 → 실제 카카오톡 채널에서만 동작

**인메모리 상태 (서버 재시작 시 초기화):**
- `user_count` — 유저별 하루 5회 채집권 카운트 `{"date": date(KST), "count": int}`
- `pending_photo` — 사진 전송 후 텍스트 대기 상태 `{"time": datetime, "url": str}` (10분 타임아웃)
- `pending_gem` — 저장 대기 상태 `{"gem": str|None, "text": str, "has_photo": bool, "image_url": str|None, "ai_gems": str|None, "retry": bool, "daily": bool, "reclassify_step": int}`
  - gem=None + retry=True: TIMEOUT 후 재시도 대기
  - gem=None: 분류 실패 후 감정 선택 대기
  - daily=True: 일상기록 분류 후 감정 추가 대기
  - reclassify_step: 재분류 단계 (0=초기, 1=카테고리 선택, 2=세부감정 선택)
- `pending_emotion_selection` — 복수 감정 감지 후 선택 대기 상태 `{"emotions": [emotion_word], "text": str, "has_photo": bool, "image_url": str|None, "ai_gems": str}`
- `classify_fail_count` — 유저별 감정 분류 연속 실패 횟수 (2회 시 운영자 알림)
- `user_last_active` — 유저별 마지막 접속일 `{user_id: date(KST)}` (재방문 구분용)

**주요 로직 (webhook 처리 순서):**
1. 위험/유해 키워드 감지 → 즉시 응답 + 이메일 알림
2. "다시 시도" → pending_gem에서 원본 텍스트 꺼내 재분류 (콜백 있으면 백그라운드 실행)
3. "다시 찾을게요" → reclassify_step 확인:
   - step 0→1: 카테고리 5개 버튼 노출
   - step ≥2: 전체 20개 감정 버튼 노출 (step 초기화)
4. "맞아요" → pending_gem 꺼내 채집권 차감 후 Supabase + Railway DB 저장, 부정감정 누적 체크
5. "모두 채집" → pending_emotion_selection의 모든 감정 저장 (채집권 n개 차감), 부정감정 누적 체크
6. "골라서 채집" → pending_emotion_selection의 감정 버튼만 노출
7. "감정 추가하기" → pending_gem(daily=True)의 텍스트로 재분류 실행
8. "이대로 저장" → 일상기록으로 저장 (채집권 미차감)
9. "일상으로 저장" → 사진을 일상기록으로 저장 (채집권 미차감)
10. "감정 적기" → 텍스트 입력 유도 메시지
11. 감정 퀵버튼 선택 (`EMOTION_TO_GEM` 매칭):
    - `pending_emotion_selection` 중이면 → 선택 감정으로 pending_gem 등록
    - `pending_gem` 있으면 → 원석 교체
    - 그 외 → 일상 기록 먼저 요청
12. 카테고리 버튼 선택 → 해당 카테고리 감정 버튼 노출, reclassify_step=2
13. 도감 조회 ("도감") — pending_gem 상태에 따라 퀵리플라이 분기
14. 원석 조회 ("내 원석" 등) — get_gem_stats() 호출, pending_gem 상태에 따라 분기
15. 채집 안내 ("채집 안내") — 서비스 안내 텍스트
16. 이미지 URL 감지 → pending_photo 등록 + [감정 적기] [일상으로 저장] 버튼 노출
17. 일반 텍스트 → _check_and_update_visit() (재방문 인사) → AI 감정 분류
    - callbackUrl 있으면 → _callback_task 백그라운드 실행 후 즉시 useCallback:true 반환
    - NOT_RECORD: 더 자세히 적도록 안내 + 예시 문장
    - DAILY_RECORD: 일상기록 pending 등록 + [감정 추가하기] [이대로 저장] 버튼
    - TIMEOUT: pending_gem(retry=True) 등록 + [다시 시도 🔄] 버튼
    - 분류 실패: pending_gem(gem=None) 등록 + 전체 감정 버튼, 2회 연속 실패 시 운영자 이메일
    - 복수 감정: pending_emotion_selection 등록 + [모두 채집] [골라서 채집] 버튼
    - 단일 감정: pending_gem 등록 + [{gem} 채집하기 💎] [다시 찾을게요] 버튼

**채집권 차감 시점:**
- "맞아요" 클릭 시 (AI 분류 시점이 아님, 분류 실패 후 감정 선택 포함)
- "모두 채집" 클릭 시 (감정 수만큼 차감, 잔여분만큼만 실제 저장)
- 일상기록("이대로 저장", "일상으로 저장")은 채집권 미차감

**카카오 응답 포맷:**
- 텍스트: `simpleText`
- 채집 완료: `basicCard` (제목: `✨ {감정} 원석을 채집했어요!`, 설명: 잔여 채집권 메시지 + 부정감정 누적 알림(해당 시), 버튼: [세공소 가기] webLink)
- 도감: `basicCard` (20개 감정 카테고리별 목록 + [원석 도감 바로가기] webLink)
- 내 원석: `basicCard` (오늘 N개 채집 · 총 M개 보유\n채집권 R개 남음 + [내 원석 보러 가기] webLink)
- 퀵 리플라이:
  - 기본: `[원석 도감, 내 원석 보기, 채집 안내]`
  - 저장 대기 (gem 있음): `[{gem} 채집하기 💎, 다시 찾을게요, 내 원석 보기, 원석 도감]`
  - 분류 직후 저장 확인: `[{gem} 채집하기 💎, 다시 찾을게요]`
  - 일상기록 분류 후: `[감정 추가하기, 이대로 저장]`
  - 복수 감정: `[모두 채집, 골라서 채집]`
  - 분류 실패: 전체 20개 감정 버튼
  - 타임아웃: `[다시 시도 🔄, 내 원석 보기, 원석 도감]`
  - 사진 입력: `[감정 적기, 일상으로 저장]`
  - 재분류 1단계: 카테고리 5개 버튼
  - 재분류 2단계: 해당 카테고리 감정 버튼
  - 도감/내 원석 조회 시 pending_gem 상태에 따라 분기

**재방문 인사 (_check_and_update_visit):**
- 역대 첫 접속: "닥토공방에 처음 오셨군요! 반가워요 😊" (AI 응답 앞에 prepend)
- 당일 첫 접속: "오늘도 돌아오셨군요! 🌟" (AI 응답 앞에 prepend)
- 당일 재접속: 인사 없음
- 텍스트 입력(AI 분류 경로)에서만 발동. 버튼 클릭 커맨드 경로에서는 발동 안 됨

**부정감정 누적 알림 (check_negative_accumulation):**
- 저장 완료 후 Railway DB 조회 (최근 7일, 일상기록 제외)
- 기쁨/긍정 계열 제외한 나머지 15개 감정 = 부정감정
- 주간 기록 중 70% 이상 부정감정 → 알림 메시지 채집 완료 카드에 append
- 3일 연속 모든 기록이 부정감정 → 알림 메시지 채집 완료 카드에 append
- 최소 3개 기록 있어야 체크

**KST 자정 리셋:**
- 모든 날짜 비교는 `_today_kst()` (ZoneInfo("Asia/Seoul")) 사용
- user_count, get_gem_stats, get_remaining_count 모두 KST 기준

**classify_emotion() 반환값:**
- `list[str]` — 원석 이름 리스트 (단일 또는 최대 3개)
- `"NOT_RECORD"` — 인사말만 있거나 감정/일상 내용 없음
- `"DAILY_RECORD"` — 감정 없이 일상 사실만 나열
- `"TIMEOUT"` — 4초 초과 (`requests.exceptions.Timeout`)
- `None` — 기타 오류

**AI (OpenRouter - Gemma 4 26B A4B):**
- 모델: `google/gemma-4-26b-a4b-it:free` (OpenRouter API)
- 3분류: 기록아님 / 일상기록 / 감정 단어(최대 3개)
- timeout=4.0s

**백그라운드 태스크:**
- `_callback_task(user_id, utterance, callback_url, photo_time, photo_url, greeting)` — 일반 메시지 분류 후 callbackUrl POST (greeting 있으면 응답 앞에 prepend)
- `_callback_task_retry(user_id, utterance, callback_url, has_photo, image_url)` — "다시 시도" / "감정 추가하기" 재분류 후 callbackUrl POST

**이메일 알림 발송 시점:**
- 위험 키워드 감지
- 유해 키워드 감지
- 감정 분류 2회 연속 실패

## 감정-원석 매핑 (20개)

| 카테고리 | 감정 | 원석명 |
|------|------|------|
| 슬픔 계열 | 우울함, 외로움, 상실감, 서러움, 실망감 | {감정} 원석 |
| 불안/두려움 계열 | 걱정, 긴장감, 위축감 | {감정} 원석 |
| 분노 계열 | 짜증, 억울함, 화남, 적대감 | {감정} 원석 |
| 기쁨/긍정 계열 | 즐거움, 감사함, 설렘, 뿌듯함, 편안함 | {감정} 원석 |
| 복잡/모호 계열 | 무기력함, 공허함, 후회 | {감정} 원석 |

원석명은 추후 확정 예정. 현재는 임시로 "{감정} 원석" 형태 사용.

## 환경 변수

`.env` 파일 필요:
```
OPENROUTER_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
ALERT_EMAIL=
GMAIL_APP_PASSWORD=
RAILWAY_DATABASE_URL=
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

- `gem` — 사용자가 최종 선택한 원석명 (예: "뿌듯함 원석"). 일상기록은 "일상기록" 고정값
- `ai_gems` — AI 초기 판단 원석 (단일: "뿌듯함 원석", 복수: "뿌듯함 원석,설렘 원석", 분류 실패/타임아웃: null)
