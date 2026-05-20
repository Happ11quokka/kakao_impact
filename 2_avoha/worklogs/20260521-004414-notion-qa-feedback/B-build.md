# B - Build

Status: completed

## Implemented changes

### Home multi-emotion and unclassified handling
- `frontend/src/routes/Home.tsx`
  - `buildTodayGemBoxItems` now expands `confirmedEmotionCodes` so a multi-emotion record creates one item per confirmed emotion in 오늘의 원석함.
  - `needs_confirmation` records are excluded from 오늘의 원석함.
  - Lake stones still display `needs_confirmation` as `unclassified`, avoiding AI guess leakage.
  - Active record sheet uses all confirmed emotion badges for multi-emotion records.

### Home circular UI overflow fix
- `frontend/src/routes/Home.tsx`
  - Added `buildHomeLakeCircleStyle()` helper.
  - Lake circle now uses `overflow: hidden` so contents do not visually escape the circular boundary.
  - Added `buildHomeJoystickStyle()` helper.
  - Joystick was first moved inside the circle, then adjusted further inward (`right: 40`, `bottom: 40`) after browser vision showed it still looked clipped near the right/bottom edge.

### Calendar modal and flow polish
- `frontend/src/routes/Calendar.tsx`
  - Daily record modal header uses sticky positioning for date and close button.
  - Candidate/미분류 confirmation path skips self-awareness question and directly exposes emotion selection.
  - Self-awareness answer submission hides the textarea and shows the submitted answer under the question before the emotion grid.

### Analysis self-reflection CTA
- `frontend/src/routes/Analysis.tsx`
  - “자기회고 남기기” CTA uses a stronger active style when reflection text exists.

### Chatbot flow
- `ai/chatbot/main.py`
  - Added audio URL detection and unsupported-audio response path.
  - Removed delayed/callback-style leading response for 오늘 분석 quick reply path.
  - Multi-emotion save-complete response now includes a web link card/button.

## Tests added/updated
- `frontend/src/routes/Home.test.ts`
  - Multi-emotion records expand into multiple 오늘의 원석함 items.
  - Multi-emotion lake stone gem layout avoids overlap inside one circular stone.
  - Lake circle clips overflow and joystick style stays inside the circle.
  - Active recap sheet builds all confirmed emotion badges.
