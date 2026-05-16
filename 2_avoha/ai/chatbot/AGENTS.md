# AGENTS.md

이 문서는 이 저장소에서 작업하는 코딩 에이전트를 위한 운영 가이드입니다.

## 프로젝트 개요

- 단일 파일 FastAPI 앱입니다. 핵심 로직은 `main.py`에 있습니다.
- 카카오 i 오픈빌더가 `POST /webhook`으로 요청을 보냅니다.
- OpenAI API로 감정을 1차 분류한 뒤 Supervisor 검증 노드가 결과를 보정합니다.
- 저장소는 Railway PostgreSQL을 사용합니다. 이전 Supabase 저장 흐름은 현재 코드 기준으로 사용하지 않습니다.
- `gems/` 디렉터리가 있으면 FastAPI가 `/gems` 정적 경로로 마운트합니다.

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
```

`SUPERVISOR_ENABLED=false`이면 Supervisor 검증을 건너뛰고 1차 분류 결과를 그대로 사용합니다.

## 요청 처리 흐름

1. `request.json()` 파싱
2. `_extract_kakao_request()`로 `user_id`, `utterance`, `callback_url` 안전 추출
3. 위험/유해 키워드 선처리
4. 버튼 명령 처리: 다시 시도, 다시 찾을게요, 맞아요, 모두 채집, 골라서 채집, 감정 추가하기, 이대로 저장, 일상으로 저장 등
5. 이미지 URL이면 `pending_photo`에 저장
6. 일반 텍스트면 재방문 인사 확인
7. 콜백 URL이 있으면 `BackgroundTasks`로 분류 실행 후 즉시 `useCallback:true`
8. 콜백 URL이 없으면 동기 분류 후 카카오 응답 반환

## AI 분류 구조

- `classify_emotion()`은 OpenAI로 1차 분류를 수행합니다.
- `supervisor_check_classification()`은 1차 분류가 시나리오 goal에 맞는지 검증합니다.
- `classify_emotion_with_supervisor()`가 최종 진입점입니다.
- Supervisor에서 예외가 나면 1차 분류 결과를 유지합니다.

반환값:

- `list[str]`: 원석 이름 목록. 단일 또는 최대 3개.
- `"NOT_RECORD"`: 기록할 감정/일상이 없음.
- `"DAILY_RECORD"`: 감정이 약한 일상 사실.
- `"TIMEOUT"`: OpenAI 호출 실패 또는 타임아웃.
- `None`: 기타 분류 실패.

## 인메모리 상태

서버 재시작 시 초기화됩니다.

- `user_count`: DB 매핑이 없는 사용자의 일일 채집권 fallback.
- `pending_photo`: 사진 전송 후 텍스트 대기. `{"time": datetime, "url": str}`.
- `pending_gem`: 저장, 재시도, 일상기록, 재분류 대기.
- `pending_emotion_selection`: 복수 감정 선택 대기.
- `user_last_active`: 재방문 인사용 마지막 접속일.

상태를 읽을 때는 직접 `data["key"]` 접근을 늘리지 말고 기존 안전 헬퍼를 우선 사용하세요.

- `_safe_pending_gem()`
- `_safe_pending_emotion_selection()`
- `_safe_pending_photo()`
- `_safe_count()`

## 저장 흐름

- 저장은 사용자가 확정 버튼을 누른 뒤 수행합니다.
- `save_gem()`은 Railway `chatbot` 테이블에 원본 저장 기록을 남깁니다.
- OAuth 매핑 사용자는 `users.provider_user_key`로 `users.id`를 찾아 `gems` 테이블에도 INSERT합니다.
- `check_and_increment()`와 `check_and_increment_n()`은 `collection_tickets`를 우선 사용하고 실패하면 인메모리 fallback을 사용합니다.
- 일상기록 저장은 채집권을 차감하지 않습니다.

## 카카오 응답 규칙

- 일반 텍스트는 `simpleText`.
- 채집 완료, 도감, 내 원석, 안내 화면은 `basicCard`.
- 기본 퀵리플라이는 `BASE_QUICK_REPLIES`.
- 저장 대기 중에는 `_gem_save_quick_replies()`.
- 일상기록은 `DAILY_QUICK_REPLIES`.
- 복수 감정은 `MULTI_EMOTION_QUICK_REPLIES`.
- 타임아웃/분류 실패 재시도는 `RETRY_QUICK_REPLIES`.

## 작업 시 주의

- `main.py`는 단일 파일 앱이라 작은 수정도 여러 흐름에 영향을 줍니다. 버튼 명령 분기 순서를 함부로 바꾸지 마세요.
- 카카오 요청 body는 신뢰하지 마세요. 새 필드를 읽을 때도 타입 검사를 추가하세요.
- pending 상태는 사용자가 이전 버튼을 늦게 누르거나 서버가 재시작되면 없을 수 있습니다.
- OpenAI 응답은 항상 실패할 수 있다고 가정하세요.
- Supervisor 프롬프트를 바꾸면 `기록아님`, `일상기록`, 원석명 파싱이 유지되는지 확인하세요.
- 검증 전에는 최소한 `venv\Scripts\python.exe -m py_compile main.py`를 실행하세요.
