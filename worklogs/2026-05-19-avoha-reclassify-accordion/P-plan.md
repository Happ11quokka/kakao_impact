# Avoha Reclassify Accordion PABCD Plan

## Goal
Home/Calendar에서 확정된 감정도 계속 재분류 가능하게 하며, 재분류는 팝업 하단에 붙은 버튼이 아니라 각 기록 영역 옆/내부의 아코디언 토글로 노출한다. 토글을 열면 자기인지 질문을 먼저 답변 텍스트로 받고, 그 다음 감정을 고르는 플로우로 진행한다.

## Acceptance Criteria
- Home 확정 기록 상세에서 감정 재분류를 계속 시작할 수 있다.
- Calendar 날짜 팝업의 모든 기록(미분류/확정) 옆에 감정 재분류 아코디언 토글이 보인다.
- 재분류 토글은 accordion 형태로 펼쳐지고 접힌다.
- 펼친 뒤 바로 감정 그리드가 아니라 자기인지 질문 텍스트 입력이 먼저 보인다.
- 답변 텍스트가 비어 있으면 감정 선택 단계로 넘어가지 않는다.
- 답변 후 감정 선택 그리드/저장 버튼이 보이고 기존 confirmEmotion 기반 재분류 동작을 유지한다.
- 자기인지 질문 문구는 "그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?"로 통일한다.
- 답변을 입력하는 중에는 감정 선택으로 넘어가지 않고, Enter 입력 후 감정 선택으로 넘어간다.
- Calendar 아코디언은 Enter 후 텍스트 입력창을 숨기고, Q 아래에 사용자가 기록한 답변을 읽기 형태로 보여준다.
- Calendar 상단 월/날짜 선택 UI는 스크롤로 년/월을 선택할 수 있어야 한다.
- Home의 "오늘의 마음 호수" 타이틀은 "오늘의 마음"으로 바꾼다.
- Home 마음 호수 원형 영역은 기존보다 조금 더 크게 보인다.
- 미분류 원석은 호수/기록 상세에서는 유지하되, 오늘의 원석함에는 들어가지 않는다.
- TDD: helper 테스트 RED → GREEN, 전체 테스트 및 빌드 통과.
- Browser smoke: Home/Calendar에서 토글, 질문 입력, 감정 선택 플로우 확인.

## Expected Files
- Modify: `2_avoha/frontend/src/routes/Home.tsx`
- Modify: `2_avoha/frontend/src/routes/Home.test.ts`
- Modify: `2_avoha/frontend/src/routes/Calendar.tsx`
- Modify: `2_avoha/frontend/src/routes/Calendar.test.ts`
- Modify: `2_avoha/frontend/src/lib/reclassify-flow.ts`
- Modify: `2_avoha/frontend/src/lib/reclassify-flow.test.ts`

## Build Strategy
1. Audit existing Home/Calendar state and confirmEmotion signatures.
2. Extract/test pure helper(s) for reclassify accordion default step/can advance and action visibility for all record statuses.
3. Implement Home accordion flow.
4. Implement Calendar per-record accordion flow.
5. Apply final UX adjustments: scrollable month picker, title copy, larger lake, exclude unclassified from gem box, Calendar submitted-answer display.
6. Verify tests/build/browser and capture diff summary.
