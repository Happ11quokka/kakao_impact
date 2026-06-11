# C — Check

Status: completed

## 자동 검증
- 단위 테스트: `npx vitest run src/routes/Home.test.ts` → **pass: 17/17**
  (클램프 경계 테스트 포함 통과 — 회귀 없음).
- 타입체크: `npx tsc --noEmit` → **pass (exit 0)**.

## 브라우저 스모크 (Playwright, viewport 412x900 @2x)
- 로컬 dev 서버(`vite`, mock API 모드) 기동 → 로그인 화면에서 "개발용으로 바로 입장" 통과 → 홈 진입.
- 조이스틱을 5방향(우/좌/하/상/우하단 대각)으로 끝까지 밀고, 마스코트 SVG와
  호수 원의 경계 inset(원 안쪽 여백, px)을 측정.

측정 결과 — **모든 방향 inset 양수 = 잘림 없음**:

| 방향 | 가장 빠듯한 변 inset(px) |
|------|--------------------------|
| right | right ≈ 17.5 |
| left | left ≈ 90.4 / right ≈ 155 |
| down | bottom ≈ 14.8 (최소) |
| up | top ≈ 85.6 |
| downright | right ≈ 37.9 / bottom ≈ 52.2 |

- 시각 확인(스크린샷): 초기/down/downright 모두 로기가 원 안에 온전히 표시됨.
- 최소 여유(아래 ~14.8px)가 glow 확산(~3px)보다 충분히 커 glow까지 원 안에 들어옴.

## 검증 한계 / Known verification limits
- 단일 viewport(412px)에서만 스모크. 매우 좁은 화면(<344px)에서 호수 stage(304px, flexShrink:0)
  자체가 폰 프레임을 가로로 넘는 별개 이슈는 이번 범위 밖(미검증).
- 콘솔 404 2건 관측 → mock API 이미지 리소스 누락으로, 이번 수정과 무관.
- 실제 카카오 로그인/실서버 데이터 경로는 미검증(mock 모드 기준).
