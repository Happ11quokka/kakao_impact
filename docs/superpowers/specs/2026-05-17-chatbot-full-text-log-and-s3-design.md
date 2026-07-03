# 챗봇 전체 텍스트 로깅 + 사진 S3 영구 저장 설계

> 대상: `2_Ulog/ai/chatbot` (FastAPI Skill 서버)
> 작성일: 2026-05-17
> 상태: 초안 (사용자 승인 대기)

## 1. 배경 (왜)

### 현재 문제
1. **텍스트 휘발**: 사용자 발화는 사용자가 "맞아요/이대로 저장/모두 채집"을 눌러야만 `chatbot` 테이블에 저장됨. 그 이전 단계(분류 직후 무응답·재분류·취소)에서 발화·LLM 분류 결과·Supervisor 검증 결과는 모두 `print(...)` 로만 남고 휘발.
2. **LLM 응답 미보존**: `classify_emotion`·`supervisor_check_classification`·`_run_emotion_analysis` 모두 OpenAI 원본 응답을 stdout 으로만 출력. 모델 회귀/디버깅이 불가능.
3. **에러 미보존**: 글로벌 핸들러·타임아웃·DB 연결 실패·콜백 POST 실패·webhook JSON 파싱 실패가 모두 stdout 으로만 출력. Railway 로그 ring buffer 가 차면 영구 손실.
4. **사진 휘발**: 카카오 CDN URL (`talk.kakaocdn.net/...`) 만 `chatbot.image_url` 에 저장. 카카오 CDN 은 수일~수주 후 만료 → 도감/웹 화면에서 broken image.

### 목표
- **모든 텍스트 영구 보존**: 발화·LLM 호출 (요청 프롬프트 + 원본 응답 + 파싱 결과)·내부 분석·에러를 빠짐없이 DB 에 저장.
- **사진 영구 보존**: 카카오 CDN → 자체 S3 호환 스토리지 업로드 → S3 URL 을 `image_url` 에 저장. 카카오 URL 은 raw JSONB 에 백업.
- **MVP 운영 가능**: 5일 유저 테스트 분량 (≈ 수천 건) 처리. 비용·복잡도 최소화.

## 2. 데이터 모델 (3개 신규 테이블)

기존 `chatbot` 테이블은 "확정 저장된 원석" 의미로 유지. 신규 테이블은 그 이전·이후 모든 흔적을 담는다.

### 2.1 `chatbot_messages` — 발화 단위 영구 로그

```sql
CREATE TABLE chatbot_messages (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,                  -- provider_user_key (오픈빌더 해시)
  trace_id      UUID NOT NULL DEFAULT gen_random_uuid(),
                                                -- webhook 1회 = 1 trace_id
                                                -- 같은 trace 안에서 LLM/error 행과 join
  direction     TEXT NOT NULL,                  -- 'inbound' | 'outbound'
  utterance     TEXT,                           -- 사용자 발화 또는 봇 응답 텍스트
  raw_body      JSONB,                          -- 카카오 webhook 전체 body / 응답 dict
  callback_url  TEXT,                           -- 사용된 콜백 URL (있을 시)
  mode          TEXT,                           -- 'classify'|'simple'|'reflection'|'analysis'|'command'
  pending_state JSONB,                          -- 시점별 pending_gem/pending_photo 스냅샷
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON chatbot_messages (user_id, created_at DESC);
CREATE INDEX ON chatbot_messages (trace_id);
```

### 2.2 `chatbot_llm_calls` — OpenAI 호출 단위 로그

```sql
CREATE TABLE chatbot_llm_calls (
  id            BIGSERIAL PRIMARY KEY,
  trace_id      UUID NOT NULL,                  -- chatbot_messages.trace_id 와 매핑
  user_id       TEXT,
  call_type     TEXT NOT NULL,                  -- 'classify'|'supervisor'|'emotion_analysis'
  model         TEXT NOT NULL,
  prompt        TEXT NOT NULL,                  -- 전체 프롬프트
  raw_response  JSONB,                          -- OpenAI 응답 JSON 그대로
  parsed_result TEXT,                           -- 파싱 후 결과 ("뿌듯함, 설렘" 같은 텍스트)
  status        TEXT NOT NULL,                  -- 'ok'|'timeout'|'http_error'|'parse_error'
  status_code   INTEGER,
  error_text    TEXT,
  latency_ms    INTEGER,
  attempt       SMALLINT DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON chatbot_llm_calls (trace_id);
CREATE INDEX ON chatbot_llm_calls (call_type, created_at DESC);
```

### 2.3 `chatbot_errors` — 잡힌 모든 예외 로그

```sql
CREATE TABLE chatbot_errors (
  id          BIGSERIAL PRIMARY KEY,
  trace_id    UUID,                             -- 알 수 있을 때만
  user_id     TEXT,
  source      TEXT NOT NULL,                    -- 'webhook'|'save_gem'|'callback'|'global_handler'|...
  message     TEXT NOT NULL,
  traceback   TEXT,
  context     JSONB,                            -- 발생 시점 추가 컨텍스트
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON chatbot_errors (created_at DESC);
CREATE INDEX ON chatbot_errors (source, created_at DESC);
```

### 2.4 `chatbot` 테이블 수정
- `image_url` 의미를 **"S3 영구 URL"** 로 변경 (기존: 카카오 CDN 임시 URL).
- 새 컬럼 추가: `kakao_image_url TEXT NULL` — 원본 카카오 CDN URL 보존용 (디버깅·재업로드용).
- 새 컬럼 추가: `trace_id UUID NULL` — `chatbot_messages.trace_id` 와 매핑.

## 3. S3 호환 스토리지 (Cloudflare R2 권장)

### 3.1 제공자 선택: **Cloudflare R2**
| 항목 | 이유 |
|---|---|
| Egress | 무료 (S3 는 GB 당 $0.09). 카카오톡·웹 양쪽에 사진 서빙 → 비용 영향 큼 |
| Storage | $0.015/GB/월 (S3 Standard $0.023/GB) |
| 무료 한도 | 10 GB 저장·1M Class A 요청·10M Class B 요청 / 월 |
| API | S3 호환 → `boto3` 그대로 사용 (`endpoint_url` 만 다름) |
| Korea | Cloudflare 글로벌 CDN |

**대안**: AWS S3 (계정 이미 있으면), Backblaze B2 (가장 저렴). 코드는 어떤 S3 호환 제공자든 동작하도록 작성.

### 3.2 버킷 레이아웃
```
avoha-chatbot/
  photos/
    {provider_user_key}/
      {yyyy}/{mm}/
        {message_id}.{ext}        # ex) 1a2b.../2026/05/9f3e...c1.jpg
```
- `message_id` = `chatbot_messages.id` (BIGSERIAL) → 충돌 없음, 추적 쉬움
- 확장자는 Content-Type 으로 결정 (jpg/png/gif/webp)
- 객체 ACL: private. 공개 URL 은 **public bucket** 또는 **signed URL (24h)** 둘 중 선택 → MVP 는 **public bucket + custom domain** 으로 단순화 (`https://photos.avoha.app/photos/.../{id}.jpg`). 도메인 미준비 시 R2 기본 `pub-...r2.dev` 사용.

### 3.3 업로드 시점
**옵션 A (선택)**: `pending_photo[user_id]` 에 카카오 URL 이 들어오는 즉시 (webhook handler 안) `BackgroundTasks` 로 download → S3 upload. S3 URL 을 `pending_photo` 에 보관. `save_gem` 시점에는 이미 S3 URL.
- 장점: 사용자가 "맞아요" 누를 때까지 10분 동안 카카오 URL 이 만료될 위험 회피.
- 단점: 사용자가 사진만 보내고 텍스트 안 보내면 (저장 안 함) → S3 에는 업로드됨 → 가비지. 일 단위 cleanup 작업 별도 필요 (MVP 는 무시, 5일 테스트).

**옵션 B**: `save_gem` 시점에 동기적으로 download → upload.
- 장점: 가비지 없음.
- 단점: 카카오 URL 이 이미 만료됐을 가능성 + 저장 응답 latency 증가.

→ **옵션 A 채택**. MVP 종료 후 cleanup 스크립트 추가 (TODO).

## 4. 구현 위치

| 변경 | 파일 |
|---|---|
| ORM 모델 추가 | `2_Ulog/backend/app/db/models.py` |
| Alembic 마이그레이션 | `2_Ulog/backend/migrations/versions/0006_chatbot_full_log.py` (신규) |
| S3 헬퍼 | `2_Ulog/ai/chatbot/s3_uploader.py` (신규) |
| 로깅 헬퍼 | `2_Ulog/ai/chatbot/persist.py` (신규) — `log_message`, `log_llm_call`, `log_error` |
| webhook 계측 | `2_Ulog/ai/chatbot/main.py` 진입점·`_call_openai_chat`·`global_exception_handler`·`save_gem` |
| 의존성 | `2_Ulog/ai/chatbot/requirements.txt` (`boto3==1.35.0` 추가) |
| 환경 변수 | `2_Ulog/ai/chatbot/.env.example` 추가 |

### 4.1 신규 환경 변수 (chatbot)
```env
S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
S3_BUCKET=avoha-chatbot
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev   # 또는 https://photos.avoha.app
S3_REGION=auto                                  # R2 는 "auto", AWS 는 ap-northeast-2 등
```

### 4.2 트랜잭션 / 실패 정책
- DB write 실패는 **절대 사용자 응답을 깨뜨리지 않는다**. 모든 `log_*` 호출은 `try/except` 로 감싸 stderr 로 fallback.
- S3 업로드 실패 시 `image_url` 은 카카오 CDN URL 그대로 저장 + `chatbot_errors` 에 기록. 사용자 흐름은 정상 진행.

## 5. 테스트 계획
1. 로컬 Postgres 에 마이그레이션 적용.
2. R2 테스트 버킷 생성 → 환경변수 설정.
3. `curl` 로 fake 카카오 webhook 페이로드 (text + image URL) 전송.
4. 검증:
   - `chatbot_messages` 에 inbound/outbound 행 생성됨.
   - `chatbot_llm_calls` 에 `classify` + `supervisor` 행, 같은 `trace_id` 공유.
   - "맞아요" 응답 후 `chatbot.image_url` 이 R2 public URL 로 저장됨.
   - 일부러 timeout 유발 → `chatbot_errors` 에 행 생성됨.
5. Railway dev 서비스에 배포 → 본인 카카오 채널로 실제 사진 + 텍스트 전송 → 도감 화면에서 이미지 정상 표시 확인.

## 6. 위험 & 미해결
- **R2 계정 없음**: 사용자가 Cloudflare 계정·R2 활성화·access key 발급 필요. AWS 계정 선호 시 endpoint_url 만 다르게.
- **기존 카카오 URL 백필 안 함**: 이미 만료된 `chatbot.image_url` 은 복구 불가. 새로 들어오는 사진만 S3 적용.
- **트레이스 ID 전파**: webhook 진입부에서 생성 → 모든 helper 에 인자로 흘려야 함. `contextvars` 로 대체 가능하지만 MVP 는 명시 전달.
- **개인정보**: 사용자 발화·사진은 민감 정보. `chatbot_messages.utterance` 보존 정책 명문화 필요 (현재 README "관리자는 임의로 접근하지 않아요"). 30일 후 익명화 cron 추가 TODO.
- **테이블 크기**: 5일 × 30명 × 평균 10건/일 × LLM 2회 = ~3,000 rows in `chatbot_llm_calls`. 무시할 수준.

## 7. 비용 추산
| 항목 | 추정 |
|---|---|
| R2 storage (사진 100MB) | $0 (무료 한도 내) |
| R2 Class A (PUT) — 1k uploads | $0 (무료 1M) |
| R2 Class B (GET) | $0 (무료 10M) |
| Postgres rows | 무료 (Railway Pro plan 내) |
| **MVP 총 비용** | **$0** |
