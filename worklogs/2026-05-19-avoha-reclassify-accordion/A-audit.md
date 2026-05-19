# Audit

## Existing Home flow
- `Home.tsx` has a bottom-sheet style record detail.
- Confirmed `emotion_classification` records with `webReviewedAt === null` show a bottom action `감정 재분류하기`.
- Previous turn removed question flow and left only meditation.
- The current requirement reverses that: reclassification should be repeatable and question-first.

## Existing Calendar flow
- `Calendar.tsx` has `DatePanel` with per-record `RecordDetail`.
- `calendarRecordNeedsReclassification(record)` currently returns true only for `needs_confirmation` or records without confirmed emotion.
- Therefore confirmed/reclassified records do not show a reclassify action.
- The picker is rendered once at the bottom of the popup via `pickerRecord`, which conflicts with the new requirement that it must appear as a per-record accordion/toggle.

## Data/API
- `useRecordsStore.confirmEmotion` supports `{ interaction, reflectionType }` only.
- `/records/{id}/confirm-emotion` stores emotion status and event props, but does not persist a web-entered reclassification reflection answer.
- `RecordDto` already has optional `questionText`/`answerText`, and backend `ChatbotRecord` has `answer_text`, so adding `reflectionAnswer` is low-risk.

## Test boundary
- Add pure helper tests for:
  - all records can open reclassification action (`buildRecordReclassifyAction`).
  - answer text must be non-empty before emotion picking (`canAdvanceReclassifyReflection`).
  - Home reclassify options are question-first.
- UI browser smoke remains required for accordion placement.
