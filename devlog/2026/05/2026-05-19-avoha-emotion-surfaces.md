# Devlog: Avoha emotion surfaces @ 2026-05-19 20:43 KST

Project: kakao_impact / 2_avoha
Path: /Users/chan/developer/workspace/kakao/kakao_impact/2_avoha
Commit: 67a06e9
Related PABCD run: worklogs/2026-05-19-avoha-reclassify-accordion/

## Intent

Avoha의 홈, 캘린더, 감정분석에서 감정 기록 표시와 재분류 UX를 더 일관되게 만든다. 핵심은 사용자가 확정된 감정도 다시 돌아보고, 자기인지 질문을 거친 뒤 감정을 다시 고를 수 있게 하는 것이다.

## Changed

- Home
  - `오늘의 마음 호수` 문구를 `오늘의 마음`으로 정리했다.
  - 마음 호수 원형 영역을 조금 키워 시각적 중심감을 강화했다.
  - 미분류 원석은 호수/상세에서는 유지하지만, `오늘의 원석함`에는 넣지 않도록 했다.
  - 다중 감정 원석을 하나의 원석 안에서 겹치지 않게 배치하는 helper/test를 유지했다.

- Calendar
  - 날짜 팝업의 각 기록 카드 안에 감정 분류/재분류 아코디언을 노출했다.
  - 모든 기록은 필요하면 다시 감정을 고를 수 있다.
  - 자기인지 질문 답변 입력 중에는 감정 선택이 열리지 않고, Enter 후에만 열린다.
  - Enter 후에는 textarea를 숨기고, Q 아래에 사용자의 답변을 읽기 카드로 남긴다.
  - 월 선택 UI는 년/월 컬럼 스크롤 방식으로 바꿨다.

- Data/API
  - 재분류 시 `reflectionAnswer`를 API/store/backend 경로로 전달한다.
  - backend `/confirm-emotion`은 자기인지 답변을 `answer_text`에 저장한다.
  - mock API의 자기인지 질문 문구도 최신 문구로 맞췄다.

- Analysis / surface consistency
  - 캘린더, 홈, 분석 화면에서 미분류/다중 감정 표시 기준이 어긋나지 않도록 테스트와 렌더링을 조정했다.

## Why

- 미분류 기록은 사용자가 아직 확정하지 않은 상태이므로, 확정 감정처럼 `오늘의 원석함`에 들어가면 보상/저장 완료처럼 오해될 수 있다.
- 반대로 미분류 원석 자체를 홈 호수에서 숨기면 사용자가 오늘 남긴 기록을 발견하고 분류할 계기가 줄어든다. 그래서 `호수에는 남기고, 원석함에서는 제외`가 현재 UX에 맞다.
- 재분류는 단순히 버튼을 다시 누르는 기능보다, 자기인지 질문을 통해 사용자가 자기 감정을 한 번 더 바라보게 하는 흐름이 제품 가치와 잘 맞다.
- Calendar의 재분류 textarea는 Enter 후 계속 남아 있으면 다음 단계가 복잡해 보이므로, 답변 카드로 전환해 감정 선택 단계가 더 깔끔하게 보이도록 했다.

## Files Touched

- 2_avoha/backend/app/routes/records.py
- 2_avoha/frontend/src/lib/api.ts
- 2_avoha/frontend/src/lib/reclassify-flow.ts
- 2_avoha/frontend/src/lib/reclassify-flow.test.ts
- 2_avoha/frontend/src/routes/Analysis.tsx
- 2_avoha/frontend/src/routes/Analysis.test.ts
- 2_avoha/frontend/src/routes/Calendar.tsx
- 2_avoha/frontend/src/routes/Calendar.test.ts
- 2_avoha/frontend/src/routes/Home.tsx
- 2_avoha/frontend/src/routes/Home.test.ts
- 2_avoha/frontend/src/stores/records-store.ts
- worklogs/2026-05-19-avoha-reclassify-accordion/

## Verification

- `npm test -- src/routes/Home.test.ts` initially failed after changing the expected behavior for excluding unconfirmed records from the today gem box. This confirmed RED for the new behavior.
- `npm test -- src/routes/Home.test.ts src/routes/Calendar.test.ts src/lib/reclassify-flow.test.ts`: PASS, 22/22.
- `npm test`: PASS, 33/33.
- `npm run build`: PASS.
- Browser smoke:
  - Home title changed to `오늘의 마음`.
  - Home lake still shows unclassified stones.
  - Today gem box excludes unclassified stones.
  - Calendar month picker opens with scrollable year/month options.
  - Calendar reclassify accordion hides textarea after Enter and shows the submitted answer below Q.
  - Browser console errors/messages: 0.

## Follow-up

- Decide whether `devlog/` should become the durable project-level devlog convention, or whether PABCD `worklogs/` are sufficient for active feature runs.
- If devlog continues, add a small index file later, e.g. `devlog/README.md` or `devlog/INDEX.md`, to link entries by project/date.
- Future Avoha work should keep the semantic rule explicit:
  - `needs_confirmation` = 미분류 원석.
  - 미분류 원석 may appear in discovery/detail surfaces.
  - 미분류 원석 should not appear as confirmed inventory/reward.

## AI Notes

This entry was created after the feature commit was pushed. Before this file, this repo did not have a dedicated `devlog/` directory; the ongoing continuity artifact was the PABCD worklog under `worklogs/2026-05-19-avoha-reclassify-accordion/`.
