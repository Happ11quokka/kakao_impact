# 유로그 카카오톡 챗봇

일상 기록을 감정 원석으로 분류하고 저장하는 카카오톡 채널 챗봇입니다. 카카오 i 오픈빌더 스킬 서버로 동작하며, 텍스트와 사진 기록을 받아 OpenAI로 감정을 분류한 뒤 Railway PostgreSQL에 저장합니다.

## 현재 구조

```text
카카오톡 사용자
  -> 카카오 i 오픈빌더
  -> FastAPI POST /webhook
  -> 입력/상태 안전 검증
  -> OpenAI 1차 감정 분류
  -> Supervisor 검증 노드
  -> 카카오 응답 생성
  -> Railway PostgreSQL 저장
```

콜백 모드에서는 카카오 5초 제한을 피하기 위해 즉시 `{"version": "2.0", "useCallback": true}`를 반환하고, `BackgroundTasks`에서 분류를 끝낸 뒤 `callbackUrl`로 최종 응답을 보냅니다.

## 핵심 로직

| 단계 | 설명 |
|---|---|
| 요청 파싱 | `_extract_kakao_request()`가 `userRequest`, `user`, `utterance`, `callbackUrl` 타입을 안전하게 정리 |
| 위험/유해 감지 | 자해/유해 키워드는 LLM 호출 전 즉시 응답하고 이메일 알림 발송 |
| 사진 대기 | 이미지 URL 입력 시 `pending_photo`에 10분 동안 사진 URL 저장 |
| 1차 분류 | `classify_emotion()`이 기록아님, 일상기록, 감정 원석 후보를 OpenAI로 분류 |
| Supervisor 검증 | `supervisor_check_classification()`이 1차 분류가 시나리오 goal을 충족했는지 검증하고 필요 시 보정 |
| 응답 생성 | `_build_ai_response()`가 카카오 `simpleText`/`basicCard`/`quickReplies` 응답 생성 |
| 저장 | 사용자가 저장을 확정하면 `save_gem()`이 Railway `chatbot` 테이블에 저장하고, 매핑 가능한 경우 `gems` 테이블에도 동기화 |

## Supervisor 노드

이 프로젝트는 봇빌더식 엔티티/시나리오 매핑 대신 LLM API를 사용하므로, 정확도를 높이기 위해 분류 뒤에 Supervisor 검증 단계를 둡니다.

```text
사용자 발화
  -> classify_emotion(): 1차 분류
  -> supervisor_check_classification(): goal 충족 여부 검증
  -> classify_emotion_with_supervisor(): 최종 분류 결과 반환
```

Supervisor는 다음 기준으로 검증합니다.

- 감정 맥락이 있는데 `기록아님` 또는 `일상기록`으로 빠졌는지 확인
- 단순 사실 나열인데 감정 원석으로 과잉 분류됐는지 확인
- 허용된 감정/원석 목록 밖의 값인지 확인
- 애매하면 사용자가 감정을 더 말할 수 있도록 `일상기록`으로 보정

환경변수로 끌 수 있습니다.

```env
SUPERVISOR_ENABLED=false
```

## 주요 기능

| 기능 | 설명 |
|---|---|
| 텍스트 기록 | 사용자의 일상 문장을 감정 원석으로 분류 |
| 사진 기록 | 사진 입력 후 10분 안에 감정 텍스트를 받으면 사진과 함께 저장 |
| 기록아님 판단 | 인사말, 명령, 의미 없는 입력은 기록 안내 카드로 응답 |
| 일상기록 판단 | 감정이 약한 일상은 감정 추가 또는 일상 저장 선택지 제공 |
| 복수 감정 | 최대 3개 감정 후보를 제시하고 모두 저장 또는 골라 저장 가능 |
| 재분류 | `다시 찾을게요`로 카테고리 선택, 세부 감정 선택, 이전 단계 이동 지원 |
| 타임아웃 재시도 | OpenAI 호출 실패/타임아웃 시 원본 텍스트를 `pending_gem`에 보관하고 `다시 시도` 제공 |
| 하루 5회 채집권 | 저장 확정 시점에 차감, OAuth 매핑 유저는 DB 기준, 그 외 인메모리 fallback |
| 도감/내 원석 | 감정 원석 목록과 보유 현황을 basicCard로 안내 |
| 부정감정 누적 알림 | 최근 기록에서 부정 감정 비율이 높으면 저장 완료 카드에 안내 추가 |
| 재방문 인사 | 첫 방문/당일 첫 방문 시 AI 응답 앞에 인사말 추가 |
| 안전 fallback | 잘못된 요청 body나 깨진 pending 상태를 전역 오류 대신 안내 응답으로 처리 |

## 인메모리 상태

서버 재시작 시 초기화됩니다.

| 변수 | 용도 |
|---|---|
| `user_count` | DB 매핑이 없는 사용자의 일일 채집권 fallback |
| `pending_photo` | 사진 전송 후 텍스트 대기 상태. 형식: `{"time": datetime, "url": str}` |
| `pending_gem` | 저장/재시도/일상기록/재분류 대기 상태 |
| `pending_emotion_selection` | 복수 감정 후보 선택 대기 상태 |
| `user_last_active` | 재방문 인사용 마지막 접속일 |

상태 접근은 직접 인덱싱 대신 다음 헬퍼를 사용합니다.

- `_safe_pending_gem()`
- `_safe_pending_emotion_selection()`
- `_safe_pending_photo()`
- `_safe_count()`

## 감정-원석 매핑

| 카테고리 | 감정 | 원석 | 이미지 |
|---|---|---|---|
| 슬픔 계열 | 우울함 | 우울함 조각 | depression.png |
| 슬픔 계열 | 외로움 | 외로움 조각 | loneliness.png |
| 슬픔 계열 | 상실감 | 상실감 조각 | loss.png |
| 슬픔 계열 | 서러움 | 서러움 조각 | sorrow.png |
| 슬픔 계열 | 실망감 | 실망감 조각 | disappointment.png |
| 불안/두려움 계열 | 걱정 | 걱정 조각 | worry.png |
| 불안/두려움 계열 | 긴장감 | 긴장감 조각 | tension.png |
| 불안/두려움 계열 | 위축감 | 위축감 조각 | timidity.png |
| 불안/두려움 계열 | 초조 | 초조 조각 | nervousness.png |
| 불안/두려움 계열 | 공포 | 공포 조각 | fear.png |
| 분노 계열 | 짜증 | 짜증 조각 | irritation.png |
| 분노 계열 | 억울함 | 억울함 조각 | resentment.png |
| 분노 계열 | 화남 | 화남 조각 | anger.png |
| 분노 계열 | 적대감 | 적대감 조각 | hostility.png |
| 분노 계열 | 경멸 | 경멸 조각 | contempt.png |
| 기쁨/긍정 계열 | 즐거움 | 즐거움 조각 | joy.png |
| 기쁨/긍정 계열 | 감사함 | 감사함 조각 | gratitude.png |
| 기쁨/긍정 계열 | 설렘 | 설렘 조각 | flutter.png |
| 기쁨/긍정 계열 | 뿌듯함 | 뿌듯함 조각 | pride.png |
| 기쁨/긍정 계열 | 편안함 | 편안함 조각 | serenity.png |
| 복잡/모호 계열 | 무기력함 | 무기력함 조각 | lethargy.png |
| 복잡/모호 계열 | 공허함 | 공허함 조각 | emptiness.png |
| 복잡/모호 계열 | 후회 | 후회 조각 | regret.png |
| 복잡/모호 계열 | 부끄러움 | 부끄러움 조각 | shame.png |
| 복잡/모호 계열 | 혼란스러움 | 혼란스러움 조각 | confusion.png |

`CHATBOT_GEM_TO_EMOTION_CODE`는 챗봇의 원석을 웹 인벤토리의 emotion code로 매핑합니다.

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

`ASSET_BASE_URL`이 없으면 `RAILWAY_PUBLIC_DOMAIN`을 사용하고, 둘 다 없으면 운영 Railway 도메인을 기본값으로 사용합니다. `gems/` 디렉터리가 있으면 `/gems` 정적 경로로 마운트됩니다.

## 실행

```bash
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

개발 중 카카오 오픈빌더와 연결하려면 로컬 서버를 외부로 노출합니다.

```bash
ngrok http 8000
```

## 배포

- 운영 서버: Railway
- 웹훅 엔드포인트: `POST /webhook`
- 오픈빌더 스킬 URL 예시: `https://sentiment-chatbot-production.up.railway.app/webhook`

## Railway DB 스키마

```sql
-- 챗봇 저장 원본
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

-- 웹 인벤토리 연동
create table gems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  emotion_code text not null,
  tier int default 1,
  source text default 'chatbot',
  created_at timestamptz default now()
);

-- 채집권
create table collection_tickets (
  user_id uuid references users(id),
  date date not null,
  remaining int not null default 5,
  primary key (user_id, date)
);

-- 카카오 provider_user_key 매핑
create table users (
  id uuid primary key default gen_random_uuid(),
  provider_user_key text unique not null
);
```

## 검증

문법 검사는 다음 명령으로 수행합니다.

```bash
venv\Scripts\python.exe -m py_compile main.py
```
