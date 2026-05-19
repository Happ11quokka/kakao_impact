# Done

## 결과

Home/Calendar의 감정 재분류 자기인지 플로우와 마지막 UX 요청을 반영해 마무리했다.

- 자기인지 질문 문구는 다음으로 통일했다.
  - "그 순간 가장 크게 남아 있던 느낌은 무엇에 가까웠나요?"
- 답변을 입력하는 즉시 감정 선택으로 넘어가지 않도록 막았다.
- 답변 입력 후 Enter를 눌러야 감정 다시 고르기 UI가 열린다.
- Home과 Calendar 모두 같은 helper(`buildReclassifyFlowState`)를 사용해 동작 기준을 맞췄다.
- 캘린더에서는 기록 카드 내부 아코디언 안에서 질문 → 답변 → Enter → 감정 선택 순서가 유지된다.
- 캘린더에서는 Enter 후 textarea가 사라지고, Q 아래에 사용자가 쓴 답변이 읽기 카드로 남는다.
- 캘린더 월 선택 UI는 년/월 컬럼 스크롤 방식으로 바꿨다.
- 홈 타이틀은 "오늘의 마음"으로 바꿨다.
- 홈 호수 원형 영역을 조금 더 크게 조정했다.
- 미분류 원석은 호수/상세에는 그대로 유지하되, 오늘의 원석함에는 들어가지 않게 했다.
- mock API의 저장 질문 문구도 최신 자기인지 질문으로 맞췄다.

## 검증 완료

- RED 확인: `npm test -- src/routes/Home.test.ts`에서 미분류 제외 기대값 실패 확인
- Targeted frontend tests: PASS, 22/22
- Full frontend tests: PASS, 33/33
- Frontend build: PASS
- Browser smoke: PASS
- Browser console: errors 0

## 남은 주의점

- 현재 변경은 로컬 작업 상태에 반영되어 있으며, 별도 커밋/푸시는 아직 수행하지 않았다.
