# 아보하 · AI Agent (워커)

BullMQ 큐 컨슈머 + 4종 에이전트. TypeScript.

## 에이전트 구성

| 에이전트 | 모델 | 입력 | 출력 | 호출 시점 |
|---|---|---|---|---|
| `emotion-classifier` | GPT-4.1 mini (주) / Gemini 2.5 Flash (폴백) | 유저 메시지 텍스트 | `{ category, top3_emotion_codes, confidence[], rationale }` — 2-stage(카테고리→세부) | 텍스트 수신 즉시 (사진-only 제외) |
| `reaction-drafter` | GPT-4.1 mini | 메시지 + 확정 감정 | 120자 이내 리액션 후보 2개 | 운영자 감정 확정 후 |
| `edge-guard` | 규칙 + GPT-4.1 mini | 유저 메시지 | `{ is_crisis, is_offensive, needs_human }` | 병렬 호출 |
| `sticker-tagger` | Gemini 2.5 Flash Vision | 원본 이미지 | `{ object, mood_tag, suggested_caption }` | 이미지 수신 시 |

## 스택
- Node 22 + TypeScript 5.7
- BullMQ (Redis)
- OpenAI SDK, Google GenAI SDK
- Zod (포맷 검증)
- Pino

## 디렉토리
```
agent/
├── src/
│   ├── index.ts                 # 워커 부트스트랩
│   ├── workers/
│   │   ├── emotion-classifier.ts
│   │   ├── reaction-drafter.ts
│   │   ├── edge-guard.ts
│   │   └── sticker-tagger.ts
│   ├── llm/
│   │   ├── openai.ts
│   │   ├── gemini.ts
│   │   └── fallback-chain.ts    # 주→폴백 체인 (Zod 2회 재시도 포함)
│   ├── schemas/
│   │   └── index.ts             # Zod 스키마 4종
│   └── budget/
│       └── daily-cap.ts         # 일 예산 가드 + Discord 알림
├── prompts/
│   ├── emotion-classifier.md    # few-shot 10셋 포함
│   ├── reaction-drafter.md
│   ├── edge-guard.md
│   └── sticker-tagger.md
├── tests/
│   └── edge-guard.test.ts       # 룰 기반 테스트 30건
├── .env.example
├── package.json
└── tsconfig.json
```

## 인접 파트 인터페이스
- **Redis 큐**: 
  - `emotion-queue` (consume) — 백엔드가 push
  - `reaction-queue` (consume) — 운영자 확정 시 push
  - `sticker-queue` (consume) — 이미지 수신 시 push
- **결과 회수**: `kakao_messages.ai_suggestion` JSONB 업데이트 + 완료 이벤트 publish
- **예산 상한 초과**: Discord `#avoha-ops` 웹훅 알림

## 첫 실행
```bash
cd 2_avoha/ai/agent
cp .env.example .env
npm install
npm run dev            # 큐 소비 시작
```

## 환경변수
```
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgres://avoha:pw@localhost:5432/avoha
OPENAI_API_KEY=
GEMINI_API_KEY=
DAILY_BUDGET_USD=10
PRIMARY_MODEL=gpt-4.1-mini
FALLBACK_MODEL=gemini-2.5-flash
DISCORD_OPS_WEBHOOK=
LOG_LEVEL=info
```

## 프롬프트 관리
- 10종 감정 카탈로그는 DB `emotions` 테이블에서 부트 시 로드 → 시스템 프롬프트에 JSON 블록 주입
- **2-stage 판정**: 카테고리 3분류(`calm`/`happy`/`negative`) → 세부 감정 선택 (CoT)
  - **평온**: `untroubled`(무탈), `serenity`(평온)
  - **행복**: `pride`(뿌듯), `joy`(기쁨), `satisfaction`(만족), `flutter`(설렘)
  - **부정**: `sadness`(슬픔), `annoyance`(짜증), `regret`(후회), `solace`(위로)
- Few-shot 10개는 PM이 `prompts/emotion-classifier.md` 하단에 수기로 추가
- 운영 페르소나 **"닥토 공방"** 톤은 `reaction-drafter` 시스템 프롬프트에 고정 (장인 톤·비과장)

## 이미지 수신 플로우 (PRD 사용자흐름 2)
- **사진-only** → `sticker-tagger` 실행, `emotion-classifier` 건너뜀. 운영자가 "카메라를 들 때 어떤 기분이었나요?" 후속 메시지 발송
- **사진+텍스트** → 두 에이전트 병렬 실행, 결과 머지. 유저 응답은 "조금 더 특별한 원석" 토스트 동봉
- 사진 기반 원석은 `gems.source='photo'` 태깅 → 세공소 특수 조합 자원

## 학습 데이터 파이프라인
운영 종료 후 `ops/scripts/export-training-data.ts` 실행:
- 각 메시지마다 `{text, ai_top1, ai_confidence, operator_final, match}` CSV 출력
- `match=false` 케이스를 프롬프트 개선 리뷰 대상으로 추림
