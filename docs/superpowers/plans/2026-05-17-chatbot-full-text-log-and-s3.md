# 챗봇 전체 텍스트 + 사진 영구 저장 구현 작업

설계 원안: `docs/superpowers/specs/2026-05-17-chatbot-full-text-log-and-s3-design.md`
(원안은 S3, 실제 구현은 Railway Volume — MVP 5일 한 플랫폼·한 빌링 우선)

## 코드 변경 요약 (완료)

| 파일 | 변경 |
|---|---|
| `2_avoha/backend/app/db/models.py` | `ChatbotMessage`/`ChatbotLLMCall`/`ChatbotError` ORM 추가. `ChatbotRecord` 에 `kakao_image_url`/`trace_id` 컬럼 추가 |
| `2_avoha/backend/migrations/versions/0006_chatbot_full_log.py` | 신규 3개 테이블 + chatbot 컬럼 2개 추가 마이그레이션 (멱등) |
| `2_avoha/ai/chatbot/persist.py` | 신규. `log_message`, `log_llm_call`, `log_error`, `update_chatbot_row_image` |
| `2_avoha/ai/chatbot/volume_uploader.py` | 신규. 카카오 URL → Railway Volume 파일로 다운로드 후 public URL 반환 |
| `2_avoha/ai/chatbot/main.py` | `_call_openai_chat`/`classify_emotion`/`supervisor_check_classification`/`_run_emotion_analysis`/`save_gem`/`global_exception_handler`/콜백 작업/webhook 진입부 계측. `OutboundLogMiddleware` 추가. `/photos` StaticFiles 마운트 |
| `2_avoha/ai/chatbot/.env.example` | `PHOTO_VOLUME_PATH`, `PHOTO_PUBLIC_BASE_URL` 추가 |

## 사용자가 해야 할 작업 (배포 전)

### 1️⃣ chatbot 서비스에 Railway Volume 추가
1. Railway 대시보드 → `intelligent-wholeness` 프로젝트 → **chatbot** 서비스
2. **Settings** → **Volumes** → **+ New Volume**
3. 설정:
   - **Mount path**: `/data`
   - **Size**: `1 GB` (MVP 충분, 나중에 증설 가능)
4. **Add**

### 2️⃣ chatbot 서비스 환경변수 설정
대시보드 **Variables** 또는 CLI:

```bash
cd /Users/imdonghyeon/kakaoimpact/2_avoha/ai/chatbot
railway link                    # intelligent-wholeness > chatbot 서비스 선택
railway variables \
  --set PHOTO_VOLUME_PATH=/data/photos \
  --set PHOTO_PUBLIC_BASE_URL=https://<chatbot-도메인>/photos
```

`<chatbot-도메인>` 은 Railway chatbot 서비스의 **Public Domain** 값.
예: `https://chatbot-production-367e8.up.railway.app` → 변수에는 `https://chatbot-production-367e8.up.railway.app/photos` 로.

### 3️⃣ 코드 푸시 → 자동 배포
```bash
cd /Users/imdonghyeon/kakaoimpact
git add 2_avoha/ai/chatbot/ 2_avoha/backend/ docs/superpowers/
git commit -m "|FEAT| 챗봇 전체 텍스트 영구 로깅 + 사진 Volume 저장"
git push
```

Railway 자동 진행:
- **backend 서비스** 빌드 → `python migrate.py` 가 마이그레이션 0006 자동 적용
  (3개 신규 테이블 + `chatbot.kakao_image_url`, `chatbot.trace_id` 컬럼 추가)
- **chatbot 서비스** 빌드 → Volume `/data` 마운트 → uvicorn 재시작
  → `/photos` StaticFiles 가 `/data/photos` 서빙 시작

## 검증 시나리오

### A. 마이그레이션 적용 확인
```bash
cd /Users/imdonghyeon/kakaoimpact/2_avoha/backend
railway connect Postgres
```
psql 안에서:
```sql
\dt chatbot*
-- chatbot, chatbot_errors, chatbot_llm_calls, chatbot_messages 4개 모두 보여야 함

\d chatbot
-- kakao_image_url text, trace_id uuid 컬럼 보여야 함
```

### B. 텍스트 로깅 검증 (본인 카톡으로)
1. 챗봇 채널에 `오늘 발표 잘 끝났어!` 전송
2. DB 확인:
   ```sql
   SELECT direction, mode, LEFT(utterance, 30), trace_id
   FROM chatbot_messages
   ORDER BY created_at DESC LIMIT 4;
   -- 같은 trace_id 로 inbound + outbound 1쌍

   SELECT call_type, status, parsed_result, latency_ms, attempt
   FROM chatbot_llm_calls
   ORDER BY created_at DESC LIMIT 5;
   -- classify (status=ok, parsed_result="뿌듯함"), supervisor (status=ok) 같은 trace_id
   ```
3. "맞아요" 클릭 → 새 trace 의 chatbot 행 + trace_id 매핑 확인.

### C. 사진 Volume 검증
1. 챗봇에 사진 1장 → `이대로 저장` 또는 텍스트 후 `맞아요`
2. DB 확인:
   ```sql
   SELECT id, gem, image_url, kakao_image_url
   FROM chatbot
   ORDER BY created_at DESC LIMIT 1;
   -- image_url 이 https://<chatbot>/photos/<user>/2026/05/.../X.jpg
   -- kakao_image_url 에 원본 talk.kakaocdn.net URL 백업
   ```
3. `image_url` 을 브라우저에서 열어서 사진 로드 확인.
4. Railway chatbot 서비스 shell 에서:
   ```bash
   ls -lah /data/photos/<user>/2026/05/
   ```

### D. 에러 로깅 검증
- `OPENAI_API_KEY` 잠시 잘못 입력 → 카톡 1회 → 복원
  → `chatbot_llm_calls.status='http_error'` + `chatbot_errors` 1건

## 알려진 제한
- **기존 카카오 CDN URL 백필 안 함**: 이미 만료된 사진 복구 불가.
- **사진 가비지**: `save_gem` 시점에만 업로드 → 사진만 보내고 저장 안 한 경우 디스크 안 씀 (의도).
- **Volume = 한 인스턴스에 묶임**: 챗봇이 multi-replica 가 되면 Volume 1개에 모든 인스턴스가 접근 불가 (Railway Volume 은 single-attach). MVP 는 1 replica 면 충분. scale-out 시 S3 또는 NFS 로 이전.
- **CDN 없음**: chatbot 서비스가 직접 서빙. 트래픽 폭증 시 Railway egress 비용 ↑. MVP 30명/5일 무시할 수준.
- **로그 보존 기간**: 별도 cron 없음. 민감 정보 보존 정책은 별도 작업.

## 다음 단계 (옵션)
- 운영 콘솔에 trace 뷰어 (trace_id 입력 → 모든 messages/llm_calls/errors).
- Sentry 연계: `log_error` 가 Sentry capture 도 동시 호출.
- 가비지 cron: Volume 사용량 모니터링 + 30일 이상 안 쓴 사진 archive.
