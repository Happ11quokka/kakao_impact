# A - Audit

Status: completed

## Notion source
- Page ID: `366e315d-c81c-8081-93a9-d67daeb1d119`
- API markdown/toggle content was read, including nested toggle sections.
- API found 17 image blocks. The Notion API markdown exposes them as `file://{...attachment...permissionRecord...}` placeholders rather than downloadable URLs, and the browser path opens a Notion login page, so the original Notion image pixels are not directly fetchable in this session.
- To compensate for the image-specific complaint, the local implemented UI was opened in the browser and inspected with vision after changes.

## Requirement-to-code mapping

### Calendar daily record modal
- Requirement: record content first, self-awareness question after; spacing adjusted; sticky date/X header while scrolling.
- Files: `frontend/src/routes/Calendar.tsx`, `frontend/src/lib/reclassify-flow.ts`, `frontend/src/routes/Calendar.test.ts`.
- Existing/current behavior after previous build step: modal renders daily records with sticky header and revised reclassification/confirmation flow.

### Calendar unclassified emotion flow
- Requirement: 미분류 감정 should open emotion selection immediately without self-awareness question.
- Files: `frontend/src/routes/Calendar.tsx`.
- Current behavior: candidate/needs_confirmation branch bypasses self-awareness answer and goes directly to emotion grid.

### Analysis self-reflection CTA
- Requirement: 자기회고 작성 시 “자기회고 남기기” tile/button becomes darker/active.
- File: `frontend/src/routes/Analysis.tsx`.
- Current behavior: active style changes when the reflection text has content.

### Home multi-emotion display and unclassified semantics
- Requirement: multi-emotion records should display the same number of visible collected emotion stones; `needs_confirmation` should remain visible in the lake but be excluded from 오늘의 원석함.
- Files: `frontend/src/routes/Home.tsx`, `frontend/src/routes/Home.test.ts`.
- Current behavior: `buildTodayGemBoxItems` expands confirmed emotion arrays into separate gem-box items, and `needs_confirmation` is hidden from the gem box but still shown in the lake as unclassified.

### Home circular UI overflow
- Requirement from Notion text near two images: “원 밖으로 튀어나오는 게 좀 불편”.
- File: `frontend/src/routes/Home.tsx`.
- Finding: the home lake circle previously allowed overflow and the joystick sat partly outside the circle (`bottom: -34`). Browser vision confirmed the first fix still left the joystick visually clipped near the right/bottom edge, so it required a second adjustment.

### Chatbot flow
- Requirements: 오늘 분석 quick reply should not show a leading filler sentence; multi-emotion save should include web-site 안내/link; 음성메시지 should not be incorrectly treated as a plain daily record.
- File: `ai/chatbot/main.py`.
- Current behavior after previous build step: quick analysis uses direct response path; multi-save response includes a web link card; audio URLs are rejected with unsupported-media guidance.
