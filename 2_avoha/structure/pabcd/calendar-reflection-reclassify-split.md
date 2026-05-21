# PABCD — Calendar reflection/reclassification split

## Plan
- Surface: `frontend/src/routes/Calendar.tsx` date popup record detail accordion.
- User flow target:
  1. User opens a confirmed/reclassified record detail.
  2. User can type a one-line reflection and complete that writing step independently.
  3. The `작성완료` CTA is light green while no text is entered, becomes dark green once typing starts, and after click the reflection box becomes completed/read-only.
  4. Under `작성완료`, user also has a separate `감정 재분류하기` CTA styled like the existing `닫기` pill so reclassification is clearly a separate action.
  5. Clicking `감정 재분류하기` opens the emotion grid; saving emotions still persists selected emotions and the reflection answer when present.

## Audit
- Add helper tests before JSX changes for CTA visual states and split-flow state.
- Verify RED first with targeted Vitest.

## Build
- Add narrow helper functions for reflection completion button style and secondary reclassify button style.
- Split accordion state: reflection completion state is local UI state; picker opens only from the new secondary reclassify CTA.
- Keep existing emotion save API path unchanged.

## Check
- RED: `npm test -- Calendar.test.ts` failed on missing split-flow helper exports.
- GREEN: `npm test -- Calendar.test.ts` passed, then visual smoke suggested a little more separation before the emotion grid.
- RED/GREEN polish: added `buildReclassifyEmotionPickerStyle`; targeted Calendar tests passed.
- Full verification: `npm test` passed 90/90; `npm run build` passed with only existing Vite chunk-size/dynamic-import warnings.
- Browser smoke: local dev server on `http://127.0.0.1:5173/`; Calendar popup flow confirmed with console-computed styles (`작성완료` dark while typed, completed state `rgba(61, 96, 80, 0.62)`, emotion picker margin `14px`) and visual check.

## Done
- User flow split is implemented: one-line reflection completion no longer opens emotion selection; `감정 재분류하기` is a separate close-pill-colored action under it.
