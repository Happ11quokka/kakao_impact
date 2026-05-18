# D — Done: 감정분석 Recap UX 개편

## 완료 요약

감정분석 화면을 사용자의 PABCD 하네스 기준으로 개편했다.

완료된 변화:

- 감정요약 카드 안 원석 표시를 `감정 요약 원석함`으로 감싸 직관성을 높임.
- 후속 피드백을 반영해 감정요약 카드/원석함 크기를 줄여 한눈에 보기 좋게 조정.
- 감정패턴 시각화 영역을 아코디언 UI로 변경하고 기본 접힘 상태로 조정.
- 기존 `계열별 세부 감정 분석`을 제거하고 `주간·월간 감정 recap` 가로 슬라이드로 대체.
- recap 테마 선택 시 inline으로 길게 펼치지 않고 팝업/바텀시트로 기록을 표시.
- 직접 기간 선택 시 시작일/종료일을 사용자가 고를 수 있게 구현.
- 감정분석 탭에서 `시간대별 감정원석 분포`부터 아래의 부가 섹션을 제거.
- 챗봇 자기인지 질문/답변은 캘린더 날짜 팝업의 기록 내용 아래에서 보이도록 이동.
- backend `/records` 응답과 frontend 타입/mock에 자기인지 질문/답변 필드를 연결.

## 검증 완료

- `npm test -- Analysis.test.ts` PASS
- `npm test -- Calendar.test.ts` PASS
- `npm test` PASS
- `npm run build` PASS
- `python -m py_compile app/routes/records.py app/db/models.py` PASS
- 브라우저 `/analysis` 확인 PASS
- 브라우저 `/calendar` 날짜 기록 팝업에서 자기인지 질문/답변 확인 PASS
- 브라우저 console JS error 없음

## 남은 선택지

- 현재는 `questionText`가 있는 경우에만 질문 블록을 보여준다.
- 추후 실제 backend/DB에서 기존 운영 데이터에 `question_id/question_text/answer_text`가 어느 테이블명으로 들어오는지 더 확정되면 migration/adapter를 정리할 수 있다.
- 캘린더 팝업의 질문/답변 UI는 현재 기록 내용 아래에 compact 카드로 표시된다. 답변 편집 기능은 이번 범위에 포함하지 않았다.
