# 유로그 카카오톡 챗봇

카카오 i 오픈빌더와 연결되는 FastAPI 기반 감정 기록 챗봇입니다. 사용자가 카카오톡에서 텍스트나 사진을 보내면 OpenAI로 감정을 분류하고, 사용자가 저장을 확정한 뒤 Railway PostgreSQL에 기록합니다. 사진은 설정된 경우 Railway Volume에 영구 저장하고, 미설정 시 카카오 CDN URL을 그대로 저장합니다.

## 현재 구조

```text
카카오톡 사용자
  -> 카카오 i 오픈빌더
  -> FastAPI POST /webhook
  -> 요청/상태 안전 검증
  -> 버튼 명령, 사진 대기, 기록 모드 처리
  -> OpenAI 1차 감정 분류
  -> Supervisor 검증
  -> 저장 대기 응답 또는 저장 완료 응답
  -> Railway PostgreSQL 저장 및 로그 기록
```

콜백 URL이 있는 요청은 카카오 5초 제한을 피하기 위해 즉시 `{"version":"2.0","useCallback":true}`를 반환하고, `BackgroundTasks`에서 분류 후 `callbackUrl`로 최종 응답을 보냅니다. 콜백 URL이 없으면 동기 분류 후 바로 카카오 응답을 반환합니다.

## 주요 파일

| 파일 | 역할 |
|---|---|
| `main.py` | FastAPI 앱, 카카오 webhook, 분류/저장/응답 흐름 |
| `persist.py` | webhook 입출력, LLM 호출, 에러 로그 저장 |
| `volume_uploader.py` | 카카오 사진 URL을 Railway Volume으로 다운로드/공개 URL 변환 |
| `gems/` | 원석 이미지와 캐릭터 이미지 정적 파일 |

## 주요 기능

| 기능 | 설명 |
|---|---|
| 대화모드 | 기록을 OpenAI로 분류하고, 챗봇 응답과 함께 저장 후보를 제안합니다. |
| 단순모드 | 챗봇 응답 없이 기록을 바로 저장합니다. 저장값은 내부적으로 AI 분류를 시도합니다. |
| 텍스트 기록 | 일상 문장을 감정 원석, 일상기록, 기록아님으로 분류합니다. |
| 사진 기록 | 사진 URL을 최대 10분간 `pending_photo`에 보관하고 텍스트와 함께 저장합니다. 단순모드에서는 사진을 바로 기록합니다. |
| 복수 감정 | 최대 3개 감정 후보를 보여주고 모두 저장 또는 선택 저장을 지원합니다. |
| 재분류 | `다시 찾을게요`로 감정 카테고리와 후보 감정을 다시 선택할 수 있습니다. |
| 오늘 기록 | 오늘 저장된 기록을 최대 9개까지 카드로 보여줍니다. |
| 오늘 분석 | 오늘 기록을 모아 OpenAI로 감정 흐름 요약을 생성합니다. 백그라운드 저장 직후에도 pending 캐시를 병합해 누락을 줄입니다. |
| 추가질문 | 짧은 부정 감정 기록에서 조건이 맞으면 감정을 조금 더 적어볼 수 있는 질문을 제안합니다. |
| 위험/유해 키워드 | 위험 또는 유해 표현을 선처리하고 필요 시 이메일 알림을 보냅니다. |
| 전체 로깅 | webhook inbound/outbound, callback 응답, LLM 호출, 예외를 DB에 기록합니다. |

## 요청 처리 흐름

1. `request.json()` 파싱
2. `_extract_kakao_request()`로 `user_id`, `utterance`, `callback_url` 안전 추출
3. 위험/유해 키워드 선처리
4. 추가질문 대기 상태 처리: `질문 받을게요`, `답할게요`, `건너뛰기`, 답변 저장
5. 버튼 명령 처리: 기록 모드, 오늘 기록, 오늘 분석, 저장, 재시도, 재분류, 감정 선택
6. 이미지 URL 처리: 단순모드면 즉시 저장, 아니면 `pending_photo`에 저장
7. 일반 텍스트 처리: 재방문 인사 확인, 콜백 또는 동기 분류 실행
8. 분류 결과에 따라 저장 후보 응답 생성
9. 사용자가 확정하면 `save_gem()`으로 DB 저장

## AI 분류 구조

```text
사용자 기록
  -> classify_emotion(): 1차 분류
  -> supervisor_check_classification(): 시나리오 goal 검증
  -> classify_emotion_with_supervisor(): 최종 결과 반환
```

반환값은 다음 중 하나입니다.

| 반환값 | 의미 |
|---|---|
| `list[str]` | 원석 이름 목록. 단일 또는 최대 3개 |
| `"NOT_RECORD"` | 기록할 감정/일상이 없음 |
| `"DAILY_RECORD"` | 감정이 약한 일상 사실 |
| `"TIMEOUT"` | OpenAI 호출 실패 또는 타임아웃 |
| `None` | 기타 분류 실패 |

`SUPERVISOR_ENABLED=false`이면 Supervisor 검증을 건너뛰고 1차 분류 결과를 사용합니다. Supervisor에서 예외가 나도 1차 분류 결과를 유지합니다.

## 저장 흐름

- 저장은 사용자가 확정 버튼을 누른 뒤 수행합니다.
- `save_gem()`은 Railway `chatbot` 테이블에 원본 기록을 저장합니다.
- OAuth 매핑 사용자는 `users.provider_user_key`로 `users.id`를 찾아 `gems` 테이블에도 INSERT합니다.
- `일상기록`과 `단순기록`은 원석 채집 수에서 제외합니다.
- `_reserve_today_record_count()`와 `_reserve_today_gem_count()`는 저장 응답의 오늘 n번째 번호가 백그라운드 저장 지연으로 밀리지 않도록 인메모리 캐시를 사용합니다.
- `_remember_today_pending_record()`는 저장 직후 `오늘 기록`/`오늘 분석`에서 방금 저장한 내용을 볼 수 있도록 10분 TTL 캐시에 보관합니다.

## 인메모리 상태

서버 재시작 시 초기화됩니다.

| 상태 | 용도 |
|---|---|
| `pending_photo` | 사진 전송 후 텍스트 대기 |
| `pending_gem` | 저장, 재시도, 일상기록, 재분류 대기 |
| `pending_emotion_selection` | 복수 감정 선택 대기 |
| `pending_simple_record` | 사용자별 단순모드 여부 |
| `pending_reflection` | 추가질문 대기 상태 |
| `user_last_active` | 재방문 인사용 마지막 접속일 |
| `today_record_count_cache` | 오늘 기록 번호 예약 캐시 |
| `today_gem_count_cache` | 오늘 원석 번호 예약 캐시 |
| `today_pending_record_cache` | 저장 직후 오늘 기록/분석 보정 캐시 |

상태를 읽을 때는 직접 `data["key"]` 접근보다 안전 헬퍼를 우선 사용합니다.

- `_safe_pending_gem()`
- `_safe_pending_emotion_selection()`
- `_safe_pending_photo()`
- `_safe_pending_reflection()`
- `_safe_count()`

## 카카오 응답 규칙

- 일반 텍스트는 `simpleText`.
- 채집 완료, 일상 저장 완료, 기록 목록, 분석 결과, 안내 화면은 주로 `basicCard`.
- 기본 퀵리플라이는 `BASE_QUICK_REPLIES`.
- 저장 대기 중에는 `_gem_save_quick_replies()`.
- 일상기록은 `DAILY_QUICK_REPLIES`.
- 복수 감정은 `MULTI_EMOTION_QUICK_REPLIES`.
- 타임아웃/분류 실패 재시도는 `RETRY_QUICK_REPLIES`.
- 추가질문은 `REFLECTION_INVITE_QUICK_REPLIES`, `REFLECTION_QUESTION_QUICK_REPLIES`, `REFLECTION_ANSWER_QUICK_REPLIES`.

## 환경 변수

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
SUPERVISOR_ENABLED=true
ALERT_EMAIL=
GMAIL_APP_PASSWORD=
RAILWAY_DATABASE_URL=
ASSET_BASE_URL=
PHOTO_VOLUME_PATH=/data/photos
PHOTO_PUBLIC_BASE_URL=
```

`ASSET_BASE_URL`이 없으면 `RAILWAY_PUBLIC_DOMAIN`을 사용하고, 둘 다 없으면 코드의 기본 Railway 도메인을 사용합니다. `gems/` 디렉터리가 있으면 `/gems` 정적 경로로 마운트합니다.

사진 영구 저장은 `PHOTO_VOLUME_PATH`와 `PHOTO_PUBLIC_BASE_URL`이 모두 있을 때만 활성화됩니다. 예: `PHOTO_PUBLIC_BASE_URL=https://<railway-domain>/photos`.

## 실행

```bash
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

개발 중 카카오 오픈빌더와 연결할 때:

```bash
ngrok http 8000
```

## 검증

문법 검사는 다음 명령으로 수행합니다.

```bash
venv\Scripts\python.exe -m py_compile main.py
```

## Railway DB 테이블

핵심 테이블은 다음과 같습니다. 운영 DB에는 로그/분석용 컬럼 또는 인덱스가 추가로 있을 수 있습니다.

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

create table gems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  emotion_code text not null,
  tier int default 1,
  source text default 'chatbot',
  created_at timestamptz default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  provider_user_key text unique not null
);

create table questions_log (
  user_id text not null,
  question_id text not null,
  asked_date date not null,
  created_at timestamptz default now()
);

create table reflection_answers (
  id bigint generated always as identity primary key,
  user_id text not null,
  answer_type text not null,
  question_id text,
  question_text text,
  answer_text text,
  linked_date date,
  week_id text,
  created_at timestamptz default now()
);
```

`persist.py`는 다음 로그 테이블을 사용합니다.

- `chatbot_messages`
- `chatbot_llm_calls`
- `chatbot_errors`
