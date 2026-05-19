# Build Log

## 변경 요약

- 자기인지 질문 문구를 다음으로 교체했다.
  - "그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?"
- `buildReclassifyFlowState(answerText, answerSubmitted)`로 재분류 플로우 상태를 확장했다.
  - 답변 텍스트가 있어도 `answerSubmitted`가 `false`이면 감정 선택 그리드를 열지 않는다.
  - 답변 입력 후 Enter 또는 제출 버튼을 통해 `answerSubmitted=true`가 된 뒤에만 감정 선택으로 넘어간다.
- Home 재분류 플로우를 수정했다.
  - 텍스트 입력 중에는 감정 선택이 열리지 않는다.
  - Enter 입력 시 `reflectionMode='picker'`로 전환되어 감정 그리드가 나온다.
  - 답변 수정 시 제출 상태를 다시 초기화한다.
- Calendar 기록 카드 내부 아코디언 재분류 플로우를 수정했다.
  - 텍스트 입력 중에는 감정 그리드를 숨긴다.
  - Enter 입력 후 같은 아코디언 안에서 감정 선택 그리드를 펼친다.
  - Enter 후에는 textarea를 숨기고, Q 아래에 사용자의 자기인지 답변을 읽기 카드로 보여준다.
  - 날짜/기록/아코디언 전환 및 저장 후 제출 상태를 초기화한다.
- Calendar 월 선택 UI를 수정했다.
  - 년도는 현재 연도 기준 15년 범위, 월은 1~12월 전체를 보여준다.
  - 각 컬럼에 `maxHeight`와 `overflowY: auto`를 적용해 스크롤 선택 가능하게 했다.
- Home 마음 호수 UI를 수정했다.
  - 타이틀/aria-label을 "오늘의 마음 호수"에서 "오늘의 마음"으로 변경했다.
  - 원형 호수 영역을 286px에서 316px로 키우고, section 높이/조이스틱/카운트 위치를 맞췄다.
- 오늘의 원석함 노출 기준을 수정했다.
  - 미분류 원석(`needs_confirmation`)은 호수와 상세에서는 유지하되, `buildTodayGemBoxItems`에서 제외한다.
  - TDD 테스트를 먼저 바꿔 RED를 확인한 뒤 구현했다.
- mock API의 자기인지 질문 저장 문구도 최신 질문 문구로 맞췄다.

## 수정 파일

- `2_avoha/frontend/src/lib/api.ts`
- `2_avoha/frontend/src/lib/reclassify-flow.ts`
- `2_avoha/frontend/src/lib/reclassify-flow.test.ts`
- `2_avoha/frontend/src/routes/Home.tsx`
- `2_avoha/frontend/src/routes/Home.test.ts`
- `2_avoha/frontend/src/routes/Calendar.tsx`
