# D — Done

Status: completed

## 요약
홈 화면 마스코트(로기)가 호수 원을 벗어나/잘리던 문제를 해결.
근본 원인은 위치 중앙정렬 `transform`과 breathe 애니메이션 `transform`이 같은
엘리먼트에서 충돌(애니메이션이 중앙정렬을 덮어씀)한 것. 두 transform을 별도 div로 분리하고,
클램프를 아바타 실제 외곽(세로 1.15배 + glow)을 반영한 타원형으로 보정.

## 변경 파일
- `frontend/src/routes/Home.tsx` (+21 / -11)
  - 마스코트 래퍼 transform/animation 분리(바깥=위치, 안쪽=breathe).
  - 상수 `MASCOT_HEIGHT_RATIO`, `MASCOT_GLOW_MARGIN`, `MASCOT_HALF_W/H` 추가.
  - `clampMascotPositionToLake` 단일 원형 → 타원형(가로/세로 분리 반경) 클램프.
- `worklogs/20260611-185830-home-mascot-clip-fix/` (이 devlog)

## 완료 체크리스트
- [x] 원인 규명(transform 충돌 + 클램프 외곽 과소평가)
- [x] transform 분리 적용
- [x] 클램프 타원화 적용
- [x] 단위 테스트 17/17 통과
- [x] tsc --noEmit 통과
- [x] Playwright 5방향 스모크 — 전 방향 잘림 없음 확인
- [x] 임시 검증 파일 정리

## 남은 리스크 / Remaining risks
- 초협소 화면(<344px)에서 호수 stage 가로 오버플로는 별개 이슈로 미해결(이번 범위 밖).
- 스모크는 단일 viewport·mock 모드 기준.
- (원칙) 사용자가 별도로 요청하기 전 deploy는 하지 않음 — 이번 범위는 git push 까지.
