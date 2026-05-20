# P - Plan: Notion QA feedback 반영

## Goal
Notion 토글 QA 피드백을 `2_avoha` 현재 구현에 정확히 반영한다. 특히 Calendar, Home, Analysis의 UI/데이터 표시가 사용자 의도와 맞도록 개선한다.

## Source requirements
- Calendar 일일 기록 창: 기록 내용이 먼저, 자기인지 질문은 그 다음.
- Calendar: 자기인지 질문과 기록 내용 사이 간격 정리.
- Calendar: 자기인지 답변 입력 영역 바로 아래 작성완료 CTA 추가/정렬.
- Calendar: 미분류 감정은 자기인지 질문 없이 바로 감정 선택 창.
- Analysis: 자기회고 입력 시 “자기회고 남기기” 탭/버튼 색상 진하게 활성화.
- Home: 카카오톡 다중 감정 수집 시 수집 감정 개수와 동일하게 감정원석 표시.
- Home: 다중 감정 중 하나를 수집해도 남은 감정의 수집 CTA 유지.
- Calendar/date modal: 스크롤 시 날짜와 X 헤더 sticky.
- Circle UI: 원 밖으로 튀어나오는 요소 overflow 수정.
- Chatbot: 오늘 분석 quick reply 선행 문장 제거, 복수 감정 플로우 웹사이트 안내 누락, 음성메시지 기록 처리 확인.

## Approach
1. A 단계에서 `frontend/src/routes/*`, `frontend/src/lib/*`, `frontend/src/stores/*`, backend chatbot/record routes를 읽어 요구사항별 구현 위치와 현재 동작을 매핑한다.
2. UI-heavy 변경은 pure helper 테스트를 먼저 만들 수 있으면 RED-GREEN으로 진행한다.
3. JSX/CSS만의 visual polish는 변경 후 build + browser smoke + console 확인으로 검증한다.
4. 모든 변경 내용은 `B-build.md`, 검증은 `C-check.md`, 최종 요약은 `D-done.md`에 기록한다.

## Non-goals
- Notion에서 이미 완료 체크된 항목 재작업.
- 이미지 픽셀 기반 세부 디자인 복제. 단, 이미지가 지칭한 텍스트 요구사항은 반영.
- 사용자가 요청하지 않은 push/deploy.
