# C - Check

Status: completed

## Automated checks
- `npm test -- Home.test.ts --run`
  - Pass: 7/7 tests.
- `npm test -- --run`
  - Pass: 4 test files, 35/35 tests.
- `npm run build`
  - Pass: TypeScript build and Vite production build succeeded.
- `python -m py_compile ai/chatbot/main.py`
  - Pass: no syntax errors.

## Browser smoke
- Dev server: `http://127.0.0.1:5175/`.
- Login: clicked “개발용으로 바로 입장”.
- Home:
  - Confirmed the page renders with a multi-emotion lake record and three 오늘의 원석함 items.
  - First browser-vision check after moving the joystick into the circle still found the bottom-right joystick visually clipped near the circle/screen edge.
  - After moving joystick further inward, browser-vision check reported no clear right-edge clipping and no unnatural escape outside the large circle. It noted spacing between joystick and nearby gem area is a little tight but usable.
- Calendar:
  - Opened Calendar route and selected a date with 3 emotions.
  - Daily modal opened with date/X header and record region present.
  - Browser console check: no console messages or JavaScript errors.

## Known verification limits
- Original Notion attachment pixels were not directly downloadable from API/browser in this session because Notion returned `file://` attachment placeholders and browser access required login.
- Visual verification therefore used the live local UI rather than the original Notion screenshots.
