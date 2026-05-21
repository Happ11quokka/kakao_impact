# PABCD — Home joystick and Calendar popup UX corrections

## Plan
- User-visible bugs:
  1. Home joystick is still inside the circular lake. It should be visually outside the circle, toward the lower-right, so it does not cover the user's emotional lake content.
  2. Calendar one-line reflection completion currently leaves a `작성완료됨` button. After completion, the button should disappear so the completed text becomes the focus.
  3. Calendar self-awareness question became too subtle. It should stay below the record content, but return to a clear boxed section for user recognition.
- Push target: current `main` branch in `/Users/chan/developer/workspace/kakao/kakao_impact/2_avoha`.

## Audit
- Browser visual check confirmed the Home joystick is still mostly inside the lake circle.
- Add/adjust helper tests before code changes:
  - Joystick style uses negative right/bottom offsets and circle wrapper allows visible overflow.
  - Calendar reflection section is a boxed block, not just a divider.
  - Reflection submit style becomes `display: none` after completion.

## Build
- Moved Home joystick onto a visible stage outside the clipped lake circle.
- Restored Calendar record self-awareness question to a clear boxed section below the record content.
- Removed the completed reflection button after `작성완료`; the completed answer remains, and `감정 재분류하기` remains as the next separate action.

## Check
- Targeted RED: `npm test -- Home.test.ts Calendar.test.ts` failed on the intended missing/wrong helper contracts.
- GREEN: targeted Home/Calendar tests passed.
- Full frontend verification: `npm test` passed 90/90; `npm run build` passed with only existing Vite chunk-size/dynamic-import warnings.
- Browser visual check: Home joystick is now outside the lake circle; Calendar no longer shows `작성완료됨`, keeps `감정 재분류하기`, and record self-awareness question computed style is boxed.

## Done
- Committed and pushed to `origin/main`.
- Commit: `ea2fe46` (`fix: align Avoha emotion flow and calendar UX`).
