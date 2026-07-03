# AGENTS.md

이 문서는 이 저장소에서 작업하는 코딩 에이전트를 위한 운영 가이드입니다.

## 프로젝트 개요

- FastAPI 기반 카카오톡 감정 기록 챗봇입니다.
- 핵심 요청 흐름은 `main.py`에 있으며, 보조 모듈은 `persist.py`, `volume_uploader.py`입니다.
- 카카오 i 오픈빌더가 `POST /webhook`으로 요청을 보냅니다.
- OpenAI API로 감정을 1차 분류한 뒤 Supervisor 검증 노드가 결과를 보정합니다.
- 저장소는 Railway PostgreSQL을 사용합니다. 이전 Supabase 저장 흐름은 현재 코드 기준으로 사용하지 않습니다.
- `gems/` 디렉터리가 있으면 FastAPI가 `/gems` 정적 경로로 마운트합니다.
- `PHOTO_VOLUME_PATH`가 있으면 FastAPI가 `/photos` 정적 경로를 마운트하고 카카오 사진을 Railway Volume에 저장할 수 있습니다.

## 자주 쓰는 명령

```bash
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
venv\Scripts\python.exe -m py_compile main.py
```

개발 중 카카오 오픈빌더와 연결할 때:

```bash
ngrok http 8000
```

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

- `SUPERVISOR_ENABLED=false`이면 Supervisor 검증을 건너뛰고 1차 분류 결과를 그대로 사용합니다.
- `PHOTO_VOLUME_PATH`와 `PHOTO_PUBLIC_BASE_URL`이 모두 있어야 사진 영구 저장이 활성화됩니다. 없으면 카카오 CDN URL을 그대로 저장합니다.
- `ASSET_BASE_URL`이 없으면 `RAILWAY_PUBLIC_DOMAIN`을 사용하고, 둘 다 없으면 코드의 기본 Railway 도메인을 사용합니다.

## 요청 처리 흐름

1. `request.json()` 파싱
2. `_extract_kakao_request()`로 `user_id`, `utterance`, `callback_url` 안전 추출
3. `log_message()`로 inbound 요청 저장
4. 위험/유해 키워드 선처리 및 이메일 알림
5. 추가질문 상태 처리: `질문 받을게요`, `답할게요`, `건너뛰기`, 답변 저장
6. 버튼 명령 처리: 기록 모드, 오늘 기록, 오늘 분석, 다시 시도, 다시 찾을게요, 맞아요, 모두 채집, 골라서 채집, 감정 추가하기, 이대로 저장, 일상으로 저장 등
7. 이미지 URL이면 단순모드에서는 바로 저장하고, 대화모드에서는 `pending_photo`에 저장
8. 일반 텍스트면 재방문 인사 확인
9. 콜백 URL이 있으면 `BackgroundTasks`로 분류 실행 후 즉시 `useCallback:true`
10. 콜백 URL이 없으면 동기 분류 후 카카오 응답 반환

## AI 분류 구조

- `classify_emotion()`은 OpenAI로 1차 분류를 수행합니다.
- `supervisor_check_classification()`은 1차 분류가 시나리오 goal에 맞는지 검증합니다.
- `classify_emotion_with_supervisor()`가 최종 진입점입니다.
- Supervisor에서 예외가 나면 1차 분류 결과를 유지합니다.
- `log_llm_call()`은 classify, supervisor, emotion_analysis 호출을 기록합니다.

반환값:

- `list[str]`: 원석 이름 목록. 단일 또는 최대 3개.
- `"NOT_RECORD"`: 기록할 감정/일상이 없음.
- `"DAILY_RECORD"`: 감정이 약한 일상 사실.
- `"TIMEOUT"`: OpenAI 호출 실패 또는 타임아웃.
- `None`: 기타 분류 실패.

## 기록 모드

- `대화모드`: 챗봇이 감정 조각을 찾아 저장 후보를 제안합니다.
- `단순모드`: 챗봇 응답 없이 바로 저장합니다. 저장값은 내부적으로 `save_simple_record_with_classification()`을 통해 대화모드처럼 AI 분류를 시도합니다.
- `pending_simple_record[user_id]`가 있으면 단순모드입니다.
- 단순모드에서 사진을 보내면 즉시 일상/단순기록으로 저장합니다.

## 추가질문 흐름

- `_maybe_attach_reflection_invite()`가 짧은 부정 감정 기록에 추가질문 초대를 붙입니다.
- `check_reflection_question()`은 대화모드, 부정 원석, 짧은 입력, 주간/반복 조건을 확인합니다.
- `_select_reflection_question()`은 `questions_log`를 사용해 같은 주 중복 질문을 막습니다.
- 답변은 `save_reflection_answer()`가 `reflection_answers`에 저장합니다.
- 관련 pending 상태는 `pending_reflection`이며 항상 `_safe_pending_reflection()`으로 읽으세요.
- 추가질문 문구나 버튼을 바꿀 때는 `REFLECTION_INVITE_QUICK_REPLIES`, `REFLECTION_QUESTION_QUICK_REPLIES`, `REFLECTION_ANSWER_QUICK_REPLIES`도 같이 확인하세요.

## 인메모리 상태

서버 재시작 시 초기화됩니다.

- `pending_photo`: 사진 전송 후 텍스트 대기.
- `pending_gem`: 저장, 재시도, 일상기록, 재분류 대기.
- `pending_emotion_selection`: 복수 감정 선택 대기.
- `pending_simple_record`: 사용자별 단순모드 여부.
- `pending_reflection`: 추가질문 대기 상태.
- `user_last_active`: 재방문 인사용 마지막 접속일.
- `today_record_count_cache`: 오늘 n번째 기록 번호 예약.
- `today_gem_count_cache`: 오늘 n번째 원석 번호 예약.
- `today_pending_record_cache`: DB background save가 끝나기 전 오늘 기록/오늘 분석에 방금 기록을 포함하기 위한 10분 TTL 캐시.

상태를 읽을 때는 직접 `data["key"]` 접근을 늘리지 말고 기존 안전 헬퍼를 우선 사용하세요.

- `_safe_pending_gem()`
- `_safe_pending_emotion_selection()`
- `_safe_pending_photo()`
- `_safe_pending_reflection()`
- `_safe_count()`

## 저장 흐름

- 저장은 사용자가 확정 버튼을 누른 뒤 수행합니다.
- `save_gem()`은 Railway `chatbot` 테이블에 원본 저장 기록을 남깁니다.
- OAuth 매핑 사용자는 `users.provider_user_key`로 `users.id`를 찾아 `gems` 테이블에도 INSERT합니다.
- 현재 저장 확정 흐름은 채집권 차감 대신 오늘 기록/원석 카운트를 계산해 응답에 표시합니다.
- 일상기록과 단순기록은 원석 카운트에서 제외합니다.
- `_reserve_today_record_count()`와 `_reserve_today_gem_count()`는 저장 응답의 카운트를 예약합니다.
- `_remember_today_pending_record()`는 저장 직후 `오늘 기록`과 `오늘 분석`에서 방금 기록이 누락되지 않게 캐시에 넣습니다.

## 카카오 응답 규칙

- 일반 텍스트는 `simpleText`.
- 채집 완료, 일상 저장 완료, 오늘 기록, 오늘 분석, 도감, 내 원석, 안내 화면은 `basicCard`를 우선 사용합니다.
- 기본 퀵리플라이는 `BASE_QUICK_REPLIES`.
- 저장 대기 중에는 `_gem_save_quick_replies()`.
- 일상기록은 `DAILY_QUICK_REPLIES`.
- 복수 감정은 `MULTI_EMOTION_QUICK_REPLIES`.
- 타임아웃/분류 실패 재시도는 `RETRY_QUICK_REPLIES`.
- 추가질문은 `REFLECTION_INVITE_QUICK_REPLIES`, `REFLECTION_QUESTION_QUICK_REPLIES`, `REFLECTION_ANSWER_QUICK_REPLIES`.

## 로깅

- `persist.py`는 DB 설정이 없어도 사용자 응답을 막지 않도록 실패를 삼키고 stdout fallback을 사용합니다.
- `log_message()`는 webhook inbound/outbound 및 callback 응답을 저장합니다.
- `OutboundLogMiddleware`는 `/webhook` 동기 응답 body를 outbound로 기록합니다.
- `log_llm_call()`은 OpenAI 요청/응답, 파싱 결과, 지연시간, 상태를 저장합니다.
- `log_error()`는 전역 예외와 주요 실패를 저장합니다.

## 작업 시 주의

- `main.py`는 큰 단일 흐름이므로 버튼 명령 분기 순서를 함부로 바꾸지 마세요.
- 카카오 요청 body는 신뢰하지 마세요. 새 필드를 읽을 때도 타입 검사를 추가하세요.
- pending 상태는 사용자가 이전 버튼을 늦게 누르거나 서버가 재시작되면 없을 수 있습니다.
- OpenAI 응답은 항상 실패할 수 있다고 가정하세요.
- Supervisor 프롬프트를 바꾸면 `기록아님`, `일상기록`, 원석명 파싱이 유지되는지 확인하세요.
- 오늘 기록/오늘 분석 관련 변경은 DB 저장 지연과 `today_pending_record_cache` 병합을 함께 고려하세요.
- 사진 저장 관련 변경은 Railway Volume 미설정 fallback을 유지하세요.
- 검증 전에는 최소한 `venv\Scripts\python.exe -m py_compile main.py`를 실행하세요.
