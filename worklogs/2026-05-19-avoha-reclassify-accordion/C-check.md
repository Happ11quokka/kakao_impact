# Check Log

## TDD

1. RED — 재분류 Enter 플로우
   - `src/lib/reclassify-flow.test.ts`에 새 요구사항을 먼저 반영했다.
   - 확인 결과: `npm test -- src/lib/reclassify-flow.test.ts` 실패.
   - 실패 이유: 기존 질문 문구가 남아 있었고, 답변 텍스트만 있으면 즉시 `canChooseEmotion=true`가 되는 기존 동작 때문.

2. GREEN — 재분류 Enter 플로우
   - 질문 상수 교체.
   - `buildReclassifyFlowState(answerText, answerSubmitted=false)`로 제출 여부를 추가.
   - Home/Calendar에서 Enter 입력 전까지 감정 선택 UI가 열리지 않도록 연결.

3. RED — 오늘의 원석함 미분류 제외
   - `src/routes/Home.test.ts`에서 `needs_confirmation` 기록은 오늘의 원석함 아이템으로 만들지 않는 기대값으로 먼저 변경했다.
   - 확인 결과: `npm test -- src/routes/Home.test.ts` 실패.
   - 실패 이유: 기존 `buildTodayGemBoxItems`가 미분류 기록을 `unclassified/candidate` 아이템으로 반환하고 있었음.

4. GREEN — 오늘의 원석함 미분류 제외
   - `buildTodayGemBoxItems`에서 `classificationStatus === 'needs_confirmation'` 기록은 `null`로 제외했다.
   - 호수 쪽 `lakeStones` 계산은 건드리지 않아 미분류 원석 자체는 홈 호수/상세에 계속 남긴다.

## 자동 검증

- `npm test -- src/routes/Home.test.ts`
  - RED 확인: 1 file, 5 tests 중 2 failed
- `npm test -- src/routes/Home.test.ts src/routes/Calendar.test.ts src/lib/reclassify-flow.test.ts`
  - PASS: 3 files, 22 tests
- `npm test`
  - PASS: 4 files, 33 tests
- `npm run build`
  - PASS: `tsc -b && vite build`
- 최종 `npm test && npm run build`
  - PASS: 33/33 tests, production build 성공

## 브라우저 스모크 검증

- 개발 서버: `http://localhost:5173`
- Home
  - 홈 진입 후 region label/title이 "오늘의 마음"으로 바뀐 것 확인.
  - 호수에는 미분류 원석과 확정 원석이 함께 보이는 것 확인.
  - 오늘의 원석함에는 확정 원석만 보이고 미분류 원석이 빠진 것 확인.
- Calendar
  - 월 선택 클릭 시 년도/월 컬럼이 전체 옵션을 가진 스크롤 가능한 선택 UI로 열리는 것 확인.
  - 2026년 5월 19일 기록 팝업에서 확정 기록의 `감정 재분류하기` 아코디언 열기.
  - 답변 타이핑 중에는 감정 그리드가 표시되지 않음 확인.
  - Enter 입력 후 textarea가 사라지고, Q 아래에 입력 답변 "뿌듯함이 남았어요"가 읽기 카드로 표시됨 확인.
  - 같은 아코디언 안에서 감정 선택 그리드가 표시됨 확인.
- Browser console
  - JS errors: 0
  - console messages: 0
