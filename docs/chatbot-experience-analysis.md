# 유로그 카카오톡 챗봇 — 사용 경험(현행) 분석

> 대상: `2_avoha/ai/chatbot/main.py` (약 2,957줄) 의 **현재 설계**.
> 새 기능 설계가 아니라 지금 동작하는 시나리오·응답·자기인지 플로우의 정리.
> 함께 보는 다이어그램:
> - `docs/chatbot-architecture.excalidraw` — 감정 분류 파이프라인
> - `docs/chatbot-scenario-flow.excalidraw` — 시나리오 디스패처(본 문서 B장)
> - `docs/chatbot-reflection-flow.excalidraw` — 부정감정 자기인지 플로우(본 문서 C장)
>
> 라인 번호는 모두 `main.py` 기준.

---

## A. 개요

### A-1. 채널과 응답 방식
- 카카오 i 오픈빌더 webhook(`POST /webhook`, 2333) 단일 진입점. 사용자 발화 1건마다 한 번 호출된다.
- **비동기 콜백 패턴**: 발화에 `callbackUrl` 이 있으면 분류 같은 무거운 처리는 백그라운드로 돌리고 즉시 `{"version":"2.0","useCallback":True}` 를 반환한 뒤(2948), 처리 끝나면 콜백 URL로 결과를 POST 한다(`_callback_task` 등 1963~). 콜백이 없으면 동기적으로 분류 후 회신(2950).
- 모든 인바운드/아웃바운드 발화·LLM 호출·에러는 `trace_id` 로 묶여 DB(`chatbot_messages` / `chatbot_llm_calls` / `chatbot_errors`)에 로깅된다(`persist.py`, `OutboundLogMiddleware` 54).

### A-2. 인메모리 상태 (시나리오 분기의 핵심)
서버 프로세스 메모리의 dict 들(126~134). 사용자별 멀티턴 상태를 들고 있다.

| 상태 | 의미 |
|---|---|
| `pending_gem[uid]` | 분류 결과 1개를 저장 대기 중(맞아요/다시 찾을게요/일상 등 단계 포함). `reclassify_step`, `daily`, `retry` 등 플래그 |
| `pending_emotion_selection[uid]` | 복수 감정 후보 + 선택 진행 상태(`selected_emotions`) |
| `pending_photo[uid]` | 사진 대기(`urls`, `time`). `PHOTO_TIMEOUT=10분`(136) |
| `pending_simple_record[uid]` | 단순모드 여부 |
| `pending_reflection[uid]` | 자기인지 질문 진행(`stage`, `question_id`, `linked_date`) |
| `today_*_cache` | 백그라운드 저장 전에도 '오늘 n번째' 번호가 이어지도록 예약/캐시 |

### A-3. 기록 모드
- **대화모드**(기본): 챗봇이 감정을 분류·제안하고 사용자가 확정/재선택. 자기인지 질문도 이 모드에서만 뜬다.
- **단순모드**(`pending_simple_record`): 응답을 최소화. 발화/사진을 받으면 "기록됐어요!"만 답하고(2906) 백그라운드에서 대화모드와 동일하게 AI 분류해 저장한다(`save_simple_record_with_classification` 1126).

### A-4. 감정 분류 파이프라인 (다이어그램: architecture)
1. `classify_emotion()` (825): GPT 1차 분류. 출력은 `원석 1~3개 리스트` / `NOT_RECORD`(기록아님) / `DAILY_RECORD`(일상기록) / `TIMEOUT` / `None`. 오타 보정(`TYPO_NORMALIZATION` 806) 포함.
2. `supervisor_check_classification()` (923): 시나리오 goal에 맞는지 2차 검증. `SUPERVISOR_ENABLED=false` 거나 타임아웃/예외면 1차 결과 유지. `pass=false` 이고 교정값이 1차와 다를 때만 덮어쓴다(999).
3. 결과는 `_build_ai_response()` (1771)가 카카오 응답으로 변환.

감정 분류 체계: 감정 25종 → 5계열(`EMOTION_CATEGORIES` 520), DB 저장 시 10개 코드로 매핑(`CHATBOT_GEM_TO_EMOTION_CODE` 487).

---

## B. 각 시나리오별 응답 설계

`webhook()` 는 **위에서 아래로 검사하는 우선순위 캐스케이드**다. 첫 매치에서 응답하고 종료하므로 순서가 곧 우선순위다. (다이어그램: scenario-flow)

### B-1. 최우선 안전 게이트
| 트리거 | 조건/라인 | 응답 | Quick Reply |
|---|---|---|---|
| 위기 키워드 | `DANGER_KEYWORDS` 매칭 (2359) | `DANGER_MESSAGE`(자살예방 1393 등) + 관리자 알림 메일 | 기본 |
| 유해 키워드 | `HARMFUL_KEYWORDS` 매칭 (2363) | `HARMFUL_MESSAGE`("채집이 어려워요…") + 관리자 알림 메일 | 기본 |

> 위 둘은 다른 어떤 명령/상태보다 먼저 검사된다.

### B-2. 자기인지(reflection) 응답 — `pending_reflection` 진행 중
| 트리거 | 라인 | 응답 |
|---|---|---|
| 건너뛰기 / 건너뛸게요 | 2368 | basicCard "좋아요. 지금 느낀 만큼만 담아둘게요." · 상태 제거 |
| 질문 받을게요 | 2384 | 질문 텍스트 노출, `stage=question_shown` · [QR: 답할게요/건너뛸게요] |
| 답할게요 | 2391 | "편하게 적어주세요 :)" , `stage=awaiting_answer` · [QR: 건너뛰기] |
| (awaiting_answer 상태의 임의 텍스트) | 2817 | `records`에 reflection 저장 → "잘 담아뒀어요 ✎" |

상세는 C장.

### B-3. 명령어 — 모드 전환·조회
| 트리거 | 라인 | 응답 | Quick Reply |
|---|---|---|---|
| 모드 | 2399 | "어떤 방식으로 기록할까요?" 안내 | 대화모드/단순모드 |
| 대화모드 | 2413 | 설정 카드(`CONVERSATION_MODE_IMAGE`), `pending_simple` 해제 | 단순모드 |
| 단순모드 | 2436 | 설정 카드(`SIMPLE_MODE_IMAGE`), `pending_simple=True` | 대화모드 |
| 오늘 기록 | 2473 | carousel: 요약 카드 + 오늘 기록 최대 9건(`kakao_today_records` 2119) | 기본 |
| 오늘 분석 / 감정분석 | 2477 | (callback) 오늘 기록 기반 AI 분석 카드(`_run_today_emotion_analysis` 2175) | 기본 |
| 도감 | 2731 | 25종·5결 안내 텍스트 + 전체원석 카드(`ALL_GEMS_IMAGE`) | pending 상태 따라 |
| 내 원석 / 원석 보기 / 가방 / 인벤토리 | 2763 | 보유·오늘 수 카드(`get_gem_stats` 1564) | pending 상태 따라 |
| 채집 안내 | 2794 | 사용법/개인정보 안내 카드 | 기본 |
| 저장된 일상 기록 보기 | 2458 | 웹링크 카드 | 기본 |

### B-4. 기록 상태 머신 — `pending_gem` / `pending_emotion_selection`
| 트리거 | 라인 | 응답 |
|---|---|---|
| 다시 시도 | 2485 | 저장해 둔 발화를 재분류(callback). 대기 기록 없으면 안내 |
| 다시 찾을게요 | 2500 | step0→1: "어떤 결에 더 가까운가요?" [QR: 5계열] / step1→2: "어떤 감정이 가장 가까운가요?" [QR: 감정 25] |
| 결(카테고리) 버튼 5종 | 2705 | "이 중에서 골라봐요." + 계열 감정 버튼 + '그대로 저장하기', `reclassify_step=2` |
| 감정 버튼 | 2637 | gem 교체 → "{gem}으로 바꿨어요! 저장할까요?" [QR: 채집/다시]. 복수선택 중이면 선택 누적, 일상감정추가면 즉시 save |
| 이전 단계로 | 2683 | 결 선택 화면으로 복귀 |
| 맞아요 | 2527 | `save_gem`(백그라운드) + "오늘 n번째 원석" 카드(`kakao_save_complete` 1690) + 부정누적 알림 + **자기인지 초대** |
| 모두 채집 | 2544 | 복수 gem 전체 save + 카드(`kakao_gem_save_complete` 1737) + 자기인지 초대 |
| 골라서 채집 | 2563 | "저장할 감정을 골라주세요." 선택 UI [QR: 감정들/완료하기] |
| 완료하기 | 2573 | 선택분 save + 카드 + 자기인지 초대 |
| 감정 선택하기 / 감정 추가하기 | 2598 | 일상기록에 감정 결 선택 진입 [QR: 5계열] |
| 그대로 저장하기 / 이대로 저장 | 2607 | "일상기록"으로 save → 일상 저장 카드(`kakao_daily_save_complete` 1743) |
| 감정 적기 | 2630 | "오늘 있었던 일이나 지금 느끼는 마음을 적어봐요…" (버튼 숨김) |
| 일상으로 저장 | 2617 | 대기 사진을 "일상기록"으로 save (추가 사진은 "단순기록") |

### B-5. 미디어 + 기본 텍스트 경로 (캐스케이드 최후)
| 트리거 | 라인 | 응답 |
|---|---|---|
| 음성 URL | 2835 | `AUDIO_NOT_SUPPORTED_MESSAGE` |
| 영상 URL | 2843 | `VIDEO_NOT_SUPPORTED_MESSAGE` |
| 사진 URL | 2851 | 단순모드: 즉시 분류저장 / 그 외: `pending_photo` 등록 + "한 줄만 더 적어주시면…(10분)" [QR: 감정 적기/일상으로 저장]. 추가 사진은 장수 안내 |
| 빈 발화 | 2893 | "조금 더 자세히 감정을 알려주실 수 있나요?" |
| 단순모드 텍스트 | 2897 | 백그라운드 분류저장 → "기록됐어요!" |
| 일상+감정 추가 대기 텍스트 | 2911 | 기존 일상 본문에 "추가 감정" 붙여 재분류 |
| **기본 텍스트** | 2932 | 첫 방문 인사 prepend + (callback) `classify_emotion_with_supervisor` → `_build_ai_response` 분기 ▼ |

### B-6. `_build_ai_response` 결과 분기 (1771)
기본 텍스트 경로의 최종 응답. 분류 결과별로:

| 결과 | 라인 | 응답 | Quick Reply |
|---|---|---|---|
| 원석 1개 | 1844 | "{gem}을 발견했어요. 이 감정조각으로 저장해드릴까요?" | {gem} 채집하기 💎 / 다시 찾을게요 |
| 원석 2~3개 | 1828 | "오늘 여러 마음이 함께 있었네요. {gems}이 보여요…" | 모두 채집 / 골라서 채집 |
| 일상기록 · 감정 없음 | 1790, 1821 | `DAILY_RECORD_MESSAGE`("소중한 일상 기록을 확인했어요!…") | 그대로 저장하기 / 감정 선택하기 |
| 기록아님 | 1773 | "여기서는 기록을 통해 감정 원석을 채집할 수 있어요." 카드 | 기본 |
| TIMEOUT | 1798 | "현재 세공소에 광물이 몰려 분류에 시간이…" | 다시 시도 |
| None(오류) | 1806 | "잠시 오류가 발생했어요…" | 다시 시도 |

### B-7. 공통 후처리 / 폴백
- 결과가 원석/일상이면 응답 머리말에 "오늘 n번째 기록이에요!" prepend(`_prepend_today_record_count` 1862).
- 첫 방문 또는 오늘 첫 방문이면 "유로그에 처음 오셨군요! 반가워요 😊" prepend(`_check_and_update_visit` 1871). (서비스명 문구가 코드상 '유로그'.)
- 저장 시 부정감정 누적 알림(`check_negative_accumulation` 1912): 최근 7일 70%+ 부정 / 3일 연속 부정이면 위로 문구를 카드 설명에 덧붙임.
- 미처리 예외는 `global_exception_handler`(105)가 status 200 + "잠시 오류가 발생했어요. 다시 시도해주세요!" + 기본 QR 로 폴백.

---

## C. 부정감정 자기인지(reflection) 질문 플로우

부정감정을 채집한 **직후**, 사용자가 그 감정을 한 번 더 들여다보도록 짧은 질문을 던지는 흐름. (다이어그램: reflection-flow)

### C-1. 질문 풀과 카테고리
- 질문 풀: `INITIAL_REFLECTION_QUESTIONS` (700) — 슬픔/분노/불안/복잡/general 카테고리별 문항. 최초 1회 DB `questions` 테이블에 시드(`_ensure_reflection_schema` 1176).
- 카테고리 정규화: `EMOTION_TO_REFLECTION_CATEGORY`(528), `_normalize_reflection_category`(1260). 5계열을 슬픔/불안/분노/기쁨·긍정/복잡 으로 환산.

### C-2. 진입과 게이트 (AND)
저장 완료 응답에 `_maybe_attach_reflection_invite`(1492)가 붙으면서 시작. 게이트 `check_reflection_question`(1428)는 **아래 4조건을 모두** 만족해야 진행한다:
1. `record_mode == 대화모드` (단순모드 제외, 1435)
2. 본문 길이 ≤ 30자 (1440) — 짧게 적은 기록일수록 더 묻는다
3. gem ∈ `NEGATIVE_GEMS` (긍정 5종 제외, 1440)
4. 카테고리 ≠ 기쁨/긍정 (1440)

### C-3. 트리거 (OR)
게이트를 통과하면 `_has_negative_reflection_trigger`(1361)가 **다음 중 하나라도** 참인지 본다:
1. 이번 주 해당 계열이 처음 등장 (1410)
2. 오늘 포함 3일 연속 부정감정 (1413)
3. 같은 계열을 마지막으로 기록한 지 7일 이상 경과 (1418)

→ 너무 자주 묻지 않으면서, 새로 나타났거나 지속되거나 오랜만에 재등장한 부정감정에만 개입.

### C-4. 질문 선택
`_select_reflection_question`(1278):
- 이번 주에 이미 질문했으면 중단 (`questions_log` 의 `UNIQUE(user_id, asked_date)` 로 주 1회 보장, 1291)
- 해당 카테고리 우선 → 없으면 `general` 폴백 (1305)
- 최근 7일 내 출제한 문항은 회피 (1311)
- 선택 시 `questions_log` 기록 후 `{question_id, question_text}` 반환

위 어느 단계든 실패하면 `should_ask=False` → 자기인지 질문 없이 저장 응답만 반환.

### C-5. 초대 → 답변 → 저장
- 초대 메시지 부착(1511) + `pending_reflection[uid] = {stage: awaiting_answer, …}`:
  > "방금 느낀 감정을 조금만 더 자세히 알려주세요 💭 … 이 글은 아무도 보지 않으니, 그냥 툭 여기에 기록해보아요 👻" · [QR: 건너뛰기]
- 이후 사용자 응답 분기(webhook 디스패처):
  - **임의 텍스트**(2817) → `save_reflection_answer`(1451) 백그라운드 → `records`(type=reflection, week_id 포함) INSERT → "잘 담아뒀어요 ✎"
  - **건너뛰기/건너뛸게요**(2368) → 상태 제거 + "지금 느낀 만큼만 담아둘게요" 카드
  - **답할게요/질문 받을게요**(2391/2384) → stage 전환만, 최종 저장은 위 텍스트 경로

### C-6. 외부 스킬 엔드포인트
오픈빌더 스킬용 별도 엔드포인트도 동일 로직을 노출:
- `POST /skill/check-question`(2289) → `check_reflection_question`
- `POST /skill/save-reflection`(2315) → `save_reflection_answer`

### C-7. 챗봇 reflection vs 웹 reflection
- **챗봇 = 즉시형**: 저장 직후 그 감정에 대해 1문항(본 문서).
- **웹 = 주간형**: `2_avoha/frontend/src/data/reflection-prompts.ts` 의 주간 회전 질문(주차 % 5)으로 한 주를 돌아보게 함.
- 둘은 다른 트리거·다른 표면이며, 챗봇 답변은 `records(type=reflection)` 에 누적된다.

---

## D. 데이터 영향

시나리오 결과가 `chatbot` 테이블(`ChatbotRecord`)로 떨어지는 방식(`save_gem` 1021):

| 컬럼 | 값 |
|---|---|
| `gem` | 저장된 원석명(예: "우울함 조각") 또는 "일상기록"/"단순기록" |
| `ai_gems` | AI가 제안한 원석들(콤마 구분) |
| `ai_emotion_code` | gem→코드 매핑(`CHATBOT_GEM_TO_EMOTION_CODE`) |
| `confirmed_emotion_code` | INSERT 시 `ai_emotion_code` 와 **같은 값으로 prefill** |
| `confirmed_emotion_codes` | `[emotion_code]` JSONB |

> ⚠️ `confirmed_emotion_code` 는 INSERT 시점에 AI 값으로 채워지므로, 그 자체로는 "사용자가 확정했다"는 뜻이 아니다. **실제 재분류/검토 여부는 `web_reviewed_at` 로 구분**해야 한다.

- 감정 코드가 있으면 `gems` 테이블에도 1행 INSERT(인벤토리 "광물" 탭, `source_chatbot_id` 로 연결, 1089).
- 자기인지 답변은 `chatbot` 이 아니라 `records` 테이블(type=reflection)에 저장된다(C-5).

---

## 재현 / 갱신

다이어그램을 코드 변경에 맞춰 다시 그리려면:

```bash
cd docs
python3 gen_chatbot_excalidraw.py        # 분류 파이프라인
python3 gen_chatbot_scenario_excalidraw.py  # 시나리오 디스패처
python3 gen_chatbot_reflection_excalidraw.py # 자기인지 플로우
```

생성된 `*.excalidraw` 는 excalidraw.com 또는 VS Code Excalidraw 확장에서 열어 본다.
공용 프리미티브는 `docs/excalidraw_lib.py`(Canvas) 에 있다.
