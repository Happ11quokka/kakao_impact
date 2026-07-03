# 아보하 챗봇 감정분류 정확도 분석 — 1차 vs 2차 MVP

> 집계 시각: 2026-06-01 · 데이터 소스: Railway `intelligent-wholeness` / Postgres (production), `chatbot` 테이블
> 분석 기간: 1차 MVP 2026-04-19~04-21, 2차 MVP 2026-05-21~05-28 (KST)
> 커밋 근거: 1차 = 챗봇/백엔드 최초 런칭(`885d11c`, `86b06a7`), 2차 = 분류 개선(`124156f` 유해키워드 FP 축소, multi-emotion, 명령어 정규화 `b26ab42`)

## ⚠️ 먼저 읽을 것 — 두 기간은 측정 방법이 다르다

| 기간 | 측정 가능? | 사용한 지표 | 표본 |
|---|---|---|---|
| **1차 (04.19~04.21)** | 사용자 정정 데이터 **없음** | **LLM 재라벨 기반 합성 정확도** (원문 vs AI가 부여한 원석) | n=25 |
| **2차 (05.21~05.28)** | 사용자 정정 데이터 있음 | **실제 사용자 정정 기반 동의율** (`web_reviewed_at` 필터) | n=37 |

- `chatbot.ai_emotion_code` / `confirmed_emotion_code` 컬럼은 **2026-05-13부터** 채워지기 시작했다. 1차 MVP 25건은 감정코드가 전부 NULL이고 **웹 검수 0건** → "사용자가 고친 비율"을 1차에서는 잴 수 없다.
- `confirmed_emotion_code`는 row INSERT 시 AI 값으로 자동복사되므로, 단순히 "confirmed가 있다"는 정확도가 아니다. **진짜 사람 신호는 `web_reviewed_at IS NOT NULL` 행에서만** 나온다.
- 따라서 **"1차 56% → 2차 97%"로 직접 등치하면 안 된다.** 방법론이 다르다. 같은 잣대(사용자 정정)로 비교 가능한 구간은 **개선 직전(05.13~20, 42%) vs 2차(05.21~28, 97%)** 이다. (아래 §3)

---

## 0. 실제 사용자 기반 정확도 — 채널 + 웹 2단계 (핵심 지표)

사용자는 두 곳에서 감정을 지정한다: **① 카카오 채널**(AI 추천을 "맞아요"로 확정하거나 "다른 감정 선택"으로 변경) → **② 웹**(나중에 재검수). 따라서 정확도도 두 단계로 본다.

```
AI 원본 추천(ai_gems) ──채널 확정/변경──▶ 저장 gem ──웹 검수(일부)──▶ confirmed
                          262건 중 9 변경              49건 중 8 변경
```

> ⚠️ `ai_emotion_code` 컬럼은 *최종* gem 기준으로 계산되어 채널 변경이 묻힌다. AI 원본 추천은 `ai_gems` 에만 남으므로, **채널 정확도는 `ai_gems`(AI원본) vs `gem`(사용자 저장) 으로** 측정한다.

### 0-1. 전체 구성 (실측 2026-06-01, distinct user 43명)

| 구분 | 건수 |
|---|:--:|
| 분류 시도 (chatbot row) | 358 |
| ├ **진짜 감정 기록** (감정 원석) | **292** |
| └ 비감정 (일상기록 41 / 자기회고 13 / 단순기록 12) | 66 |

> ⚠️ `ai_emotion_code` NULL 은 180건이지만, 그중 약 114건은 **05-13(컬럼 도입) 이전에 저장된 진짜 감정 기록**(코드만 비어있음)이다. "NULL = 일상/실패"가 아니다.

### 0-2. ① 채널 단계 — 메인 신호 (n=262)

| 항목 | 건수 |
|---|:--:|
| AI가 원석 추천 (`ai_gems` 존재) | **262** |
| 사용자가 AI 추천 유지 | **253** |
| 사용자가 채널에서 다른 감정으로 변경 | **9** |
| **채널 AI 정확도** | **253/262 = 96.6%** |

→ 웹(49건)보다 훨씬 큰 표본. **거의 모든 감정 기록이 채널에서 사용자 확정을 거친다** ("맞아요"). "사용자 지정"은 웹 56건이 아니라 사실상 감정 기록 전체.

### 0-3. ② 웹 단계 — 더 깐깐한 재검수 (n=49)

| 단계 | 건수 |
|---|:--:|
| 웹 검수 **진입** (`web_reviewed_at`) | **68** |
| ├ 진입했지만 미확정 | **12** |
| └ 감정 확정 | **56** |
| 　└ **비교가능** (AI코드+사람확정 둘 다) | **49** |
| 　　└ **변경(정정)** | **8** |

- **웹 단계 정확도 = 41/49 = 83.7%** (재분류율 16.3%).

### 0-4. 종합 해석

- **AI 원본이 끝까지 살아남지 못한 건 = 채널 9 + 웹 8 (겹침 1) ≈ 16건.**
- **채널 96.6% > 웹 83.7%** 차이는 **선택편향**: 웹까지 가서 검수하는 사용자는 고치려는 의도가 강하고, 채널 "맞아요"는 저마찰 수락이라 동의가 다소 과대평가됨. **실제 정확도는 두 값 사이(≈84~97%)**.
- 손실 지점: 분류 292건 중 웹 검수 진입은 68건(23%)뿐 + 진입자 12명은 확정 안 누름 → **정확도보다 "웹 진입·확정 이탈"이 더 큰 병목.**

### 0-5. 채널에서 변경된 9건 (ai_gems → 저장 gem)

| AI 원본 추천 | → 사용자 저장 | 비고 |
|---|---|---|
| 짜증 조각 | → 걱정 조각 | annoyance→solace |
| 짜증 조각 | → 편안함 조각 | annoyance→serenity |
| 무기력함 조각 | → 짜증 조각 | untroubled→annoyance |
| 무기력함 조각 | → 억울함 조각 | untroubled→annoyance |
| 로즈쿼츠,사파이어 | → 가넷 | flutter/sadness→annoyance |
| 즐거움 조각 | → 편안함 조각 | joy→serenity |
| 즐거움 조각 | → 뿌듯함 조각 | joy→pride |
| 설렘 조각 | → 긴장감 조각 | flutter→solace |
| 초조 조각 | → 설렘 조각 | solace→flutter |

→ **9건 중 5건이 annoyance(짜증) 연루** (짜증을 내보내거나 짜증으로 바꿈). 웹 8건 중 3건과 합쳐 **양쪽에서 짜증이 가장 불안정한 클래스**로 일관.

### 0-6. AI 예측코드별 정밀도 (웹 비교가능 49건 기준) — annoyance가 결정적으로 약함

| AI 예측 | 비교가능 | 변경 | **정밀도** |
|---|:--:|:--:|:--:|
| sadness(슬픔) | 10 | 1 | 90.0% |
| joy(기쁨) | 9 | 2 | 77.8% |
| solace(위로) | 9 | 2 | 77.8% |
| **annoyance(짜증)** | **6** | **3** | **50.0%** |
| serenity(평온) | 6 | 0 | 100% |
| untroubled(무탈) | 4 | 0 | 100% |
| pride(뿌듯) | 2 | 0 | 100% |
| satisfaction / flutter / regret | 각 1 | 0 | 100% |

→ 의미있는 볼륨 클래스 중 **annoyance만 정밀도 50%** (나머지 전부 ≥78%). 짜증 분류가 가장 약한 신호.

### 0-7. 웹 혼동 8건 — 전부 "완전 빗나감"

각 변경 건의 (AI → 사람 최종) 과, **AI 추측이 사람의 복수감정 최종 배열에 살아남았는지**:

| id | AI 예측 | → 사람 최종 (배열) | AI 배열 생존 | 날짜 |
|:--:|---|---|:--:|---|
| 189 | annoyance | serenity, flutter | ❌ | 05.20 |
| 188 | annoyance | pride, sadness | ❌ | 05.20 |
| 190 | annoyance | regret | ❌ | 05.20 |
| 137 | joy | **sadness**, untroubled | ❌ | 05.19 |
| 160 | joy | solace, satisfaction | ❌ | 05.19 |
| 140 | sadness | untroubled | ❌ | 05.19 |
| 87 | solace | annoyance | ❌ | 05.13 |
| 236 | solace | untroubled, annoyance | ❌ | 05.21 |

- **8건 모두 AI 추측이 사람 최종 배열에 아예 없음** → "부분 정답+추가"가 아니라 **완전 오분류**. 83.7%는 오히려 관대한 추정.
- **패턴 ① annoyance 과발화 & 양방향 불안정:** 짜증으로 찍었으나 실제는 평온·뿌듯·후회(3건), 반대로 진짜 짜증을 위로(solace)로 놓침(1건).
- **패턴 ② joy ↔ 부정 정반대 오류:** joy로 봤으나 실제 sadness·solace — 극과 극, 가장 위험.
- **패턴 ③ solace(위로) 불안정:** 짜증·무탈과 혼동.

---

## 요약

- **실제 사용자 기반 AI 정확도 ≈ 84~97%.** 채널 단계(`ai_gems` vs 저장 `gem`) 96.6%(262건 중 9건 변경), 웹 재검수 단계 83.7%(49건 중 8건 변경). 채널은 저마찰 수락이라 과대, 웹은 검수 의도자 위주라 과소 — 실제는 그 사이. (§0)
- **annoyance(짜증)가 가장 약한 클래스.** 채널 변경 9건 중 5건, 웹 변경 8건 중 3건이 짜증 연루. 웹 비교가능 기준 annoyance 정밀도 50%(나머지 ≥78%). joy↔부정(슬픔/위로) 정반대 오류도 위험.
- **1차 MVP (LLM 재라벨, n=25): 정확도 56%(엄격) ~ 80%(관대).** 최초 런칭 버전은 사용자 검수 데이터가 없어 LLM 재라벨로 추정. 대표 오류는 **음식 만족을 "뿌듯(pride)"으로**, **힘듦/당황을 "평온(serenity)"으로** 오분류. (방법론이 달라 채널/웹 수치와 직접 비교 불가.)
- **2차 MVP (사용자 정정, n=37): 동의율 97.3%.** 개선 직전(05.13~20) 42% → 2차 97%. 8건의 웹 정정은 전부 05.13~05.21에 집중, 05.21~22 개선 배포 이후 36건 중 0건.
- **진짜 병목은 정확도가 아니라 "웹 진입률".** 감정 기록 292건 중 웹 검수 진입은 68건(23%)뿐, 그나마 12명은 진입 후 미확정. 모델 정확도는 이미 높고, 손실은 "사용자가 웹으로 안 넘어옴"에서 발생.

---

## 1. 1차 MVP — LLM 재라벨 기반 정확도 (n=25)

1차는 사용자 검수 데이터가 없어, 각 기록 원문(`record_text`)을 10개 감정 taxonomy로 다시 분류(LLM 판정)한 뒤, 당시 챗봇이 부여한 원석의 감정코드와 비교했다.

- **원석→감정 매핑(2026-04 챗봇 기준, `main.py:203`@`d47b7eb`):** 루비=기쁨(joy), 황수정=뿌듯(pride), 아쿠아마린=평온(serenity), 월장석=무탈(untroubled), 사파이어=슬픔(sadness), 연수정=후회(regret), 가넷=짜증(annoyance), 앰버=만족, 로즈쿼츠=설렘, 오팔=위로.
  - ⚠️ `월장석`은 2026-05 백엔드 시드(`emotions.py`)에서 위로(solace)로 재배정됐으나, 1차 데이터는 4월 챗봇 기준이므로 **무탈(untroubled)** 로 해석.

| AI가 부여한 코드 | 건수 | LLM 재라벨 일치 | 일치율 |
|---|:--:|:--:|:--:|
| joy (루비) | 7 | 7 | 100% |
| pride (황수정) | 6 | 1 | 17% |
| serenity (아쿠아마린) | 4 | 2 | 50% |
| untroubled (월장석) | 3 | 2 | 67% |
| sadness (사파이어) | 2 | 0 | 0% |
| regret (연수정) | 2 | 1 | 50% |
| annoyance (가넷) | 1 | 1 | 100% |
| **합계** | **25** | **14** | **56.0%** |

- **엄격 기준 14/25 = 56.0%.** 경계(둘 다 그럴듯) 6건을 정답으로 인정하면 **20/25 = 80%**.
- **명확한 오분류 5건**: 음식 만족 → 뿌듯(pride) 3건(`맛있음`, `장모족발 맛있어`, `김밥 맛있었다`), 고통/당황 → 평온(serenity) 2건(`시험공부 힘들다 때려치고싶어`, `당황스러웠다`).
- **대표 실패 모드:** ① **뿌듯(황수정) 과배정** — 6건 중 4건이 사실상 만족(satisfaction)/기쁨이어야 함. ② **부정 감정의 calm 계열 오분류** — 힘듦/당황을 평온으로. ③ joy(루비)는 7/7 완벽 — 명백한 긍정 표현엔 강했음.

부록 A에 25건 전체 (원문·AI코드·LLM코드·일치여부) 수록.

---

## 2. 2차 MVP — 실제 사용자 정정 기반 정확도 (n=37)

`web_reviewed_at IS NOT NULL`(사람이 웹에서 실제로 본 행) 중 AI코드·확정코드가 모두 있는 비교가능 건만 집계.

| 지표 | 값 |
|---|---|
| 기간 내 총 분류 row | 197 |
| ├ 감정분류 성공 (ai_emotion_code 있음) | 166 |
| └ 일상기록/분류실패 (NULL) | 31 |
| 웹 검수 도달 | 51 (총 대비 **25.9%**) |
| 비교가능 (ai·confirmed 둘 다 존재) | **37** |
| 사용자가 재분류(정정)한 건 | **1** |
| **사용자 동의율 (정확도)** | **36/37 = 97.3%** |
| **재분류율** | **2.7%** |

- 유일한 정정(id 236, 05.21): AI `solace` → 사용자 최종 `["untroubled","annoyance"]` (복수감정). solace는 사용자 최종 선택에 아예 포함되지 않은 **진짜 오분류**. 단, 이 1건은 2차 개선 배포 첫날 기록이다.
- 05.22 이후 비교가능 36건은 **정정 0건**.

---

## 3. Before / After — 같은 잣대(사용자 정정)로 본 개선

1차는 사용자 정정 데이터가 없으므로, 사용자 정정끼리 공정하게 비교하려면 **감정코드가 막 도입된 개선 직전 구간(05.13~05.20)** 을 before로 둔다.

| 구간 | 기간(KST) | 비교가능 | 정정 | **동의율(정확도)** |
|---|---|:--:|:--:|:--:|
| 개선 직전 (before) | 05.13~05.20 | 12 | 7 | **41.7%** |
| 2차 (after) | 05.21~05.28 | 37 | 1 | **97.3%** |

정정 발생 타임라인 (전 기간 8건):

| KST 날짜 | 정정 건수 | 비고 |
|---|:--:|---|
| 05.13 | 1 | |
| 05.19 | 3 | 개선 직전 집중 |
| 05.20 | 3 | 개선 직전 집중 |
| 05.21 | 1 | 2차 배포 당일 |
| 05.22~05.28 | **0** | 개선 배포 이후 정정 소멸 |

→ 정정은 05.21–22 개선 커밋(유해키워드 FP 축소 `124156f`, multi-emotion, 명령어 정규화) 직후 끊겼다. 표본은 작지만(before n=12) 방향성은 뚜렷하다.

---

## 4. 혼동(confusion) 분석 — 사용자가 고친 8쌍

전 기간 사용자 재분류 8건의 (AI → 사용자확정) 패턴:

| AI 예측 | → 사용자 정정 | 건수 | 날짜 |
|---|---|:--:|---|
| annoyance(짜증) | → serenity / pride / regret | 3 | 05.20 |
| joy(기쁨) | → sadness / solace | 2 | 05.19 |
| sadness(슬픔) | → untroubled | 1 | 05.19 |
| solace(위로) | → annoyance | 1 | 05.13 |
| solace(위로) | → untroubled | 1 | 05.21 |

- **annoyance(짜증) 과예측**이 가장 두드러진 오류(개선 직전 3건). 짜증으로 분류했으나 실제론 평온/뿌듯/후회였음.
- **joy(기쁨) 과예측** — 긍정으로 봤으나 실제 슬픔/위로. 1차의 "긍정엔 강함"과 대비되는, 부정 표현을 긍정으로 흘리는 오류.
- 1차의 대표 오류(pride/serenity 과배정)와 2차 직전의 오류(annoyance/joy 과예측)는 결이 다르다 — 그 사이 분류 로직이 바뀌었음을 시사.

---

## 5. 방법론 · 한계

- **시간대:** `created_at`은 naive UTC. KST 변환 `(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date`.
- **"사용자 기반 정확도"의 정의:** 사람이 웹에서 실제로 검수(`web_reviewed_at IS NOT NULL`)한 건에 한해, `ai_emotion_code = confirmed_emotion_code` 면 동의(정확), 다르면 정정. `confirmed_emotion_code`는 INSERT 시 AI 값으로 자동복사되므로 `web_reviewed_at` 필터 없이는 정확도로 쓸 수 없다.
- **1차 LLM 재라벨의 성격:** 사용자 신호가 아니라 LLM 판정이다. 2차의 사용자 정정 지표와 **수치를 직접 비교하지 말 것.** 1차는 "런칭 버전 품질의 독립적 추정치"로만 해석.
- **표본 한계:** 1차 n=25, before n=12, 2차 비교가능 n=37 — 모두 작다. 비율 차이는 방향성으로만 신뢰.
- **웹 진입 선택편향:** 검수까지 온 사용자는 전체의 25.9%뿐. 동의율은 "검수한 사람" 기준이며 전수 정확도가 아니다.
- **분류 실패/일상기록:** 2차 31건은 `ai_emotion_code` NULL(일상기록·TIMEOUT·NOT_RECORD 등)로 정확도 분모에서 제외.

---

## 부록 A. 1차 25건 LLM 재라벨 상세

| id | 원문(요약) | AI(원석→코드) | LLM 재라벨 | 일치 |
|:--:|---|---|---|:--:|
| 1 | 학교 와서 공부하는 나 대견하다 | 황수정→pride | pride | ✓ |
| 2 | 기뻐! 뿌듯해! | 루비→joy | joy | ✓ |
| 3 | 시험공부 힘들다 다 때려치고싶어 ㅜㅜ | 사파이어→sadness | solace | ✗ (경계) |
| 6 | 시험공부 힘들다 다 때려치고 시펑 | 아쿠아마린→serenity | solace | ✗ (명확) |
| 7 | 날씨 화창 기분 너무 좋아 | 루비→joy | joy | ✓ |
| 8 | 눈물… 면접 잘 못본 거 같아 후회돼 | 연수정→regret | regret | ✓ |
| 9 | 화창해서 기분 너무 좋다 | 루비→joy | joy | ✓ |
| 10 | 카공 편안한 자리 느긋 마음의 안정 | 월장석→untroubled | serenity | ✗ (경계) |
| 11 | 오늘 조감 당황스러웠다 | 아쿠아마린→serenity | regret | ✗ (명확) |
| 12 | 즐거워 | 루비→joy | joy | ✓ |
| 13 | 방울토마토 열매 생겼어요 얄루~ | 황수정→pride | joy | ✗ (경계) |
| 14 | 짜증나요 | 가넷→annoyance | annoyance | ✓ |
| 15 | 평온함 여행의기분 | 아쿠아마린→serenity | serenity | ✓ |
| 16 | 할 일 할 때 안정, 잠 보충 때 가장 행복 | 루비→joy | joy | ✓ |
| 17 | 안녕하세요 | 월장석→untroubled | untroubled (무내용) | ✓ |
| 18 | 집에 가고 싶당 | 연수정→regret | solace | ✗ (의문) |
| 19 | 맛있음 | 황수정→pride | satisfaction | ✗ (명확) |
| 20 | 속이 안좋다 | 사파이어→sadness | solace | ✗ (경계) |
| 21 | 장모족발 맛있어 | 황수정→pride | satisfaction | ✗ (명확) |
| 22 | 어떤 감정들이 있어?? | 월장석→untroubled | untroubled (질문) | ✓ |
| 23 | 김밥 맛있었다 | 황수정→pride | satisfaction | ✗ (명확) |
| 24 | 샛강 산책 상쾌하고 힐링됐다 | 아쿠아마린→serenity | serenity | ✓ |
| 25 | 자격증 공부 친구들과 카공 기분좋았다 | 루비→joy | joy | ✓ |
| 26 | 안녕하세요~ 지금 기분 좋네요 | 루비→joy | joy | ✓ |
| 27 | 느좋카페 스근한 기분의 하루 | 황수정→pride | serenity | ✗ (경계) |

일치 14 / 불일치 11 (명확한 오류 5, 경계·의문 6).

---

## 부록 B. 재현 SQL

```sql
-- 전체 구성: 진짜 감정 기록 vs 비감정
SELECT count(*) total,
  count(*) FILTER (WHERE gem NOT IN ('일상기록','자기회고','단순기록') AND gem IS NOT NULL) emotion_records,
  count(*) FILTER (WHERE gem IN ('일상기록','자기회고','단순기록')) non_emotion
FROM chatbot;

-- ① 채널 정확도: AI 원본(ai_gems) vs 사용자 저장(gem). gem 이 AI 추천 리스트에 있으면 유지.
SELECT
  count(*) FILTER (WHERE ai_gems IS NOT NULL AND length(trim(ai_gems))>0) AS has_ai_guess,
  count(*) FILTER (WHERE ai_gems IS NOT NULL AND length(trim(ai_gems))>0
                     AND gem = ANY(string_to_array(ai_gems, ','))) AS kept_ai,
  count(*) FILTER (WHERE ai_gems IS NOT NULL AND length(trim(ai_gems))>0
                     AND NOT (gem = ANY(string_to_array(ai_gems, ',')))) AS changed_in_channel
FROM chatbot;

-- 기간별 정확도 핵심 집계 (KST)
WITH base AS (
  SELECT *,
    CASE
      WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date BETWEEN DATE '2026-04-19' AND DATE '2026-04-21' THEN '1cha'
      WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date BETWEEN DATE '2026-05-13' AND DATE '2026-05-20' THEN 'pre2cha'
      WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date BETWEEN DATE '2026-05-21' AND DATE '2026-05-28' THEN '2cha'
      ELSE 'other'
    END AS period
  FROM chatbot
)
SELECT period,
  count(*) AS total,
  count(*) FILTER (WHERE ai_emotion_code IS NOT NULL) AS classified,
  count(*) FILTER (WHERE web_reviewed_at IS NOT NULL) AS web_reviewed,
  count(*) FILTER (WHERE web_reviewed_at IS NOT NULL AND ai_emotion_code IS NOT NULL
                     AND confirmed_emotion_code IS NOT NULL) AS comparable,
  count(*) FILTER (WHERE web_reviewed_at IS NOT NULL AND ai_emotion_code IS NOT NULL
                     AND confirmed_emotion_code IS NOT NULL
                     AND ai_emotion_code <> confirmed_emotion_code) AS reclassified
FROM base GROUP BY period ORDER BY period;

-- AI 예측코드별 정밀도 (전체 비교가능 49건 기준)
SELECT ai_emotion_code AS ai_predicted,
  count(*) AS n_comparable,
  count(*) FILTER (WHERE ai_emotion_code = confirmed_emotion_code) AS kept,
  count(*) FILTER (WHERE ai_emotion_code <> confirmed_emotion_code) AS changed,
  round(100.0*count(*) FILTER (WHERE ai_emotion_code = confirmed_emotion_code)/count(*),1) AS precision_pct
FROM chatbot
WHERE web_reviewed_at IS NOT NULL AND ai_emotion_code IS NOT NULL AND confirmed_emotion_code IS NOT NULL
GROUP BY ai_emotion_code ORDER BY n_comparable DESC;

-- 사용자 정정 8쌍 (혼동 분석) — AI 추측이 사람 최종 배열에 살아남았는지 포함
SELECT id, ai_emotion_code, confirmed_emotion_code, confirmed_emotion_codes,
  (ai_emotion_code = ANY(SELECT jsonb_array_elements_text(confirmed_emotion_codes))) AS ai_in_array,
  (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date AS kst
FROM chatbot
WHERE web_reviewed_at IS NOT NULL AND ai_emotion_code IS NOT NULL
  AND confirmed_emotion_code IS NOT NULL AND ai_emotion_code <> confirmed_emotion_code
ORDER BY kst;

-- 1차 원문 추출 (LLM 재라벨 입력)
SELECT id, gem, has_photo, record_text FROM chatbot
WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date BETWEEN DATE '2026-04-19' AND DATE '2026-04-21'
ORDER BY id;
```

> DB 접근: `railway run --service Postgres bash -c 'psql "$DATABASE_PUBLIC_URL" -f -' <<'SQL' … SQL` (프로젝트 `intelligent-wholeness`/production).
