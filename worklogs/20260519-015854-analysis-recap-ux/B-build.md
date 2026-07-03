# B — Build: 감정분석 Recap UX 개편

## 변경 파일

- `2_Ulog/frontend/src/routes/Analysis.tsx`
- `2_Ulog/frontend/src/routes/Analysis.test.ts`
- `2_Ulog/frontend/src/routes/Calendar.tsx`
- `2_Ulog/frontend/src/routes/Calendar.test.ts`
- `2_Ulog/frontend/src/lib/api.ts`
- `2_Ulog/backend/app/db/models.py`
- `2_Ulog/backend/app/routes/records.py`
- `worklogs/20260519-015854-analysis-recap-ux/*`

## 구현 내용

1. 직접 기간 선택
   - `customRange` 상태 추가.
   - `직접` 기간 선택 시 시작일/종료일 date input 표시.
   - `dateInAnalysisPeriod` helper로 weekly/monthly/custom 필터를 통합.

2. 감정요약 카드/원석함
   - 상위 감정 원석을 `감정 요약 원석함` UI 안에 배치.
   - 후속 피드백을 반영해 카드, 원석함, 아이콘, 폰트, 패딩을 compact하게 조정.

3. 감정패턴 시각화
   - 1차 피드백에서는 아코디언 header/button으로 변경하고 기본 접힘으로 스크롤 부담을 줄였다.
   - 후속 피드백을 반영해 `열기/접기` 구조를 제거했다.
   - `patternOpen` 상태를 제거하고 감정패턴 시각화를 항상 펼친 상태로 표시한다.
   - `buildPatternPanelState` helper를 추가해 패널이 `expanded: true`, `toggleLabel: null`, `layoutRole: primary-fill`인 정책을 테스트로 고정했다.
   - main content를 flex column으로 바꾸고, summary/recap은 compact 고정, pattern section은 중간 primary 영역으로 확장되게 조정했다.
   - 5개 감정 계열 row가 화면 안에서 잘리지 않도록 row 높이/간격을 재조정했다.

4. 감정 recap 슬라이드
   - 기존 `계열별 세부 감정 분석`을 테마별 recap 카드로 대체.
   - 카드 크기를 줄이고, 아래 inline 기록 목록은 제거.
   - `buildRecapDialogState` helper를 추가해 선택한 테마의 기록을 팝업/바텀시트로 표시.
   - 화면 맞춤 후속 피드백에 맞춰 recap 설명/caption을 숨기고 카드 높이를 줄였다.

5. 감정분석 탭 하단 정리
   - 사용자 요청에 따라 `시간대별 감정원석 분포`부터 아래 섹션을 제거.
   - 제거된 하단 섹션:
     - 시간대별 감정원석 분포
     - 주간 자기인지 질문 recap
     - 주간/월간/직접 감정 리포트
     - 행동 추천/시작 가이드 카드
   - 감정분석 탭은 요약 카드, 감정패턴 시각화, recap 슬라이드 중심으로 단순화.

6. 캘린더 팝업 자기인지 질문/답변 연결
   - 챗봇이 저장한 `question_id`, `question_text`, `answer_text`, `linked_date`를 프론트 타입/API mock/backend record payload에 반영.
   - `buildRecordReflection` helper 추가.
   - 캘린더 날짜 팝업의 `기록 내용` 아래에 그날 자기인지 질문이 있으면 `자기인지 질문`을 표시.
   - 답변이 있으면 그 아래 `답변`까지 표시.
   - 질문이 없는 기록에는 빈 자기인지 블록을 표시하지 않음.

## TDD 기록

- `Analysis.test.ts`
  - 직접 기간 필터
  - record 텍스트/사진 연결
  - recap theme 생성
  - popup dialog state 생성
  - pattern panel 기본 펼침/primary-fill 정책
- `Calendar.test.ts`
  - record reclassification helper
  - 자기인지 질문/답변 detail helper
  - 질문 없는 기록은 reflection block 생략

## 구현 메모

- `ChatbotRecordDto`에 reflection 필드를 optional로 추가해 기존 응답과 호환되게 유지했다.
- backend SQLAlchemy model에도 chatbot reflection 컬럼을 추가했다. 챗봇 쪽에서 이미 `ALTER TABLE records ADD COLUMN IF NOT EXISTS question_id/question_text/answer_text`를 수행하는 구조와 맞췄다.
- backend `/records` 응답 payload에 reflection 필드를 포함했다.
- mock record에는 질문/답변 예시를 넣어 로컬 브라우저에서 바로 확인 가능하게 했다.
- 개발 로그인 버튼은 `DEV_AUTH_ENABLED` 조건에서만 렌더링되며 `.env.example`에는 배포 환경에서 켜지지 않도록 주석을 남겼다.
