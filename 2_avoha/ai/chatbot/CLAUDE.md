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

**요청 흐름:**
```
카카오톡 → 오픈빌더 → POST /webhook → Groq AI (llama-3.1-8b-instant) → Supabase → 카카오 응답
```

**인메모리 상태 (서버 재시작 시 초기화):**
- `user_count` — 유저별 하루 5회 채집권 카운트
- `pending_photo` — 사진 전송 후 텍스트 대기 상태 `{"time": datetime, "url": str}` (10분 타임아웃)
- `pending_gem` — 저장 대기 상태 `{"gem": str|None, "text": str, "has_photo": bool, "image_url": str|None, "ai_gems": str|None}` (분류 실패 시 gem=None으로 원본 텍스트 보존)
- `pending_emotion_selection` — 복수 감정 감지 후 선택 대기 상태 `{"emotions": [emotion_word], "text": str, "has_photo": bool, "image_url": str|None, "ai_gems": str}`
- `classify_fail_count` — 유저별 감정 분류 연속 실패 횟수 (2회 시 운영자 알림)

**주요 로직 (webhook 처리 순서):**
1. 위험/유해 키워드 감지 → 즉시 응답 + 이메일 알림
2. "다른 감정 선택" → 10개 감정 퀵버튼 노출 (pending_gem 유지)
3. "저장하기" → pending_gem 꺼내 채집권 차감 후 Supabase 저장
4. 감정 퀵버튼 선택 (`EMOTION_TO_GEM` 매칭):
   - `pending_emotion_selection` 중이면 → 선택 감정으로 pending_gem 등록 (ai_gems 전달)
   - `pending_gem` 있으면 → 원석 교체 (gem=None이면 분류 실패 후 첫 선택, ai_gems 유지)
   - 그 외(pending_gem 없는 상태) → 일상 기록 먼저 요청 (저장하지 않음)
5. 도감 조회 ("도감")
6. 원석 조회 ("내 원석", "원석 보기", "가방", "인벤토리")
7. 이미지 URL 감지 → `pending_photo` 등록 + 텍스트 유도 (버튼 숨김)
8. AI 감정 분류 (`classify_emotion`) — timeout=4s (카카오 스킬 5초 제한)
   - `NOT_RECORD` 반환 시 → 더 자세히 적도록 안내
   - `TIMEOUT` 반환 시 → 타임아웃 안내
   - 분류 실패 시 → pending_gem에 원본 텍스트 보존(gem=None) + 퀵버튼 노출, 2회 연속 실패 시 운영자 이메일 알림
9. 복수 감정 감지 시 → `pending_emotion_selection` 등록 + 감지된 감정만 퀵버튼 노출
10. 단일 감정 → `pending_gem` 등록 + "저장하기/다른 감정 선택" 버튼 노출
11. 저장 완료 → `kakao_save_complete()` (basicCard + 원석 이미지 썸네일 + 웹링크 버튼)

**채집권 차감 시점:**
- "저장하기" 클릭 시 (AI 분류 시점이 아님, 분류 실패 후 감정 선택 포함)

**카카오 응답 포맷:**
- 텍스트: `simpleText`
- 채집 완료: `basicCard` (썸네일: 원석 이미지, 제목: `원석(감정) 원석 채집 완료!` + 웹링크 버튼)
- 원석 목록: `basicCard` (1개) 또는 `carousel` (복수)
- 퀵 리플라이:
  - 기본: `[인벤토리 👜, 도감 📖]`
  - 저장 대기: `[저장하기 💎, 다른 감정 선택 🔄, 인벤토리 👜, 도감 📖]`
  - 복수 감정 선택: 감지된 감정 버튼만
  - 복수 감정 선택 후 확인: `[저장하기 💎, 다른 감정 선택 🔄]`
  - 분류 실패: 감정 10개 + 기본
  - 사진 유도: 숨김

**classify_emotion() 반환값:**
- `list[str]` — 원석 이름 리스트 (단일 또는 복수)
- `"NOT_RECORD"` — 일상 기록이 아님 (인사말만 있는 경우, 감정+인사말 혼합은 분류함)
- `"TIMEOUT"` — 4초 초과
- `None` — 기타 오류

**AI 응답 파싱:**
- Groq(llama)이 형식을 지키지 않을 수 있어 raw 텍스트에서 직접 원석명 탐색
- 원석명 없으면 감정 단어 탐색 후 `EMOTION_TO_GEM`으로 변환

**이메일 알림 발송 시점:**
- 위험 키워드 감지
- 유해 키워드 감지
- 감정 분류 2회 연속 실패

## 감정-원석 매핑

무탈→월장석, 평온→아쿠아마린, 뿌듯→황수정, 기쁨→루비, 만족→앰버, 설렘→로즈쿼츠, 슬픔→사파이어, 짜증→가넷, 후회→연수정, 위로→오팔

## 환경 변수

`.env` 파일 필요:
```
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
ALERT_EMAIL=
GMAIL_APP_PASSWORD=
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

- `gem` — 사용자가 최종 선택한 원석
- `ai_gems` — AI 초기 판단 원석 (단일: "루비", 복수: "루비,사파이어", 분류 실패: null)

Storage: `gem-images` 버킷 (Public) — 원석 이미지 호스팅용 (영롱한 보석 단계 10종)
- 파일명: ruby, amber, aquamarine, rose_quartz, citrine, moonstone, sapphire, garnet, smoky_quartz, opal (.png)
- `GEM_IMAGE_URL` 딕셔너리로 원석명 → URL 매핑, `kakao_save_complete()`에서 thumbnail으로 사용
