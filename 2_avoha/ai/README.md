# 아보하 · AI

감정 분류·리액션 초안·안전 가드·이미지 태깅 + 누끼 처리.

## 서브 서비스

| 폴더 | 스택 | 역할 | 배포 |
|---|---|---|---|
| [`agent/`](agent/) | Node 22 + TS + BullMQ | 에이전트 4종 (텍스트·Vision) | Railway `avoha-agent` |
| [`rembg/`](rembg/) | Python 3.11 + FastAPI + rembg | 누끼(배경 제거) HTTP 서비스 | Railway `avoha-rembg` |

두 서비스는 독립 배포 가능. 상호 직접 의존 없음. 공통 접점은 백엔드(큐/HTTP)를 통해.

## 역할 정의 (WoZ 기간)
AI는 **자동 응답이 아닌 운영자 보조**. 선-제안 생성 → 운영자가 콘솔에서 1-click 승인.
- 응답 품질: 사람이 보증
- 학습 데이터: AI 제안 vs 운영자 최종 차이를 `events` 테이블에 기록 → 5일 후 프롬프트 정답지 구축

## 공통 원칙
- **프롬프트 버전 관리**: `agent/prompts/*.md`
- **포맷 검증**: Zod 로 응답 JSON 파싱, 실패 시 1회 재시도, 2회 실패 시 `needs_human`
- **예산 가드**: 일 $10 한도, 초과 시 에이전트 중단 + 운영자에게 알림
- **프라이버시**: 카톡 본문·이미지 외부 전송 전 PII 스크러빙 (전화·이름 패턴 마스킹)

## 인접 파트 인터페이스
- **Backend ↔ agent**: Redis 큐 `emotion-queue` 소비, 결과는 `kakao_messages.ai_suggestion` 업데이트
- **Backend ↔ rembg**: HTTP `POST /remove-bg` (multipart), 결과 URL 반환
- **Frontend**: 직접 호출 없음. 백엔드 경유.
- **Design**: AI 생성 결과물의 시각 표현(카드·배지)은 디자인 가이드 준수

## 작업 리스트 (통합)
- [x] **AI-1** 프롬프트 v0 (감정 분류·리액션·edge) — `agent/prompts/`
- [x] **AI-2** OpenAI·Gemini key 환경 분리 + 비용 알람
- [x] **AI-3** Few-shot 10셋 (감정 × 스타일)
- [x] **AI-4** 에이전트 워커 구조 (BullMQ) — `agent/`
- [x] **AI-5** Zod 검증 + 재시도 체인
- [x] **AI-6** rembg 컨테이너 빌드·배포 — `rembg/`
- [x] **AI-7** 이미지 태거 (Gemini Vision) — `agent/workers/sticker-tagger.ts`
- [x] **AI-8** Edge-guard 테스트 케이스 30건
- [x] **AI-9** 학습 데이터 export 스크립트 (→ `ops/scripts/export-training-data.ts`)
- [x] **AI-10** 프롬프트 정답지 회고 문서 자동 생성
