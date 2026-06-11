# A — Audit

Status: completed

## 코드 위치 매핑
- 마스코트 렌더: `frontend/src/routes/Home.tsx` 마스코트 래퍼 div (`mascotPosition` 사용, `ChibiAvatar`).
- 위치 가둠: `clampMascotPositionToLake()` (`Home.tsx`, export 함수 — 테스트 대상).
- 조이스틱 이동 루프: `useEffect`의 `requestAnimationFrame` tick에서 매 프레임
  `clampMascotPositionToLake({ x: x + vx*dt*SPEED, y: ... })`.
- 관련 상수: `MASCOT_SIZE=58`, `LAKE_MOVE_RADIUS=48`, `LAKE_CIRCLE_SIZE=304`.
- breathe 키프레임: `@keyframes mascotBreathe { transform: translateY/scale }` (`Home.tsx` style 블록).
- 아바타 컴포넌트: `frontend/src/components/field/ChibiAvatar.tsx`
  → `height = size * 1.15`, 내부 `<svg style={{ overflow: 'visible' }}>` + glow 필터.

## 근본 원인 (2개)
1. **transform 덮어쓰기 (주 원인).**
   마스코트 래퍼 div가 인라인 `transform: translate(-50%,-50%)`(중앙정렬)와
   `animation: mascotBreathe`(키프레임이 `transform`을 재정의)를 동시에 가짐.
   CSS 애니메이션 재생 중에는 키프레임의 `transform`이 인라인 transform을 **완전히 대체** →
   중앙정렬이 사라지고 마스코트가 좌상단 기준으로 그려져 ~29px 오른쪽/~33px 아래로 이동 →
   원 가장자리에서 `overflow:hidden`에 잘림. (간헐적으로 보였던 이유: 가장자리로 갈 때만 체감)
   - 참고: `HomeField.tsx`에는 이미 동일 교훈 주석("breathe는 캐릭터에만 — transform 간섭 분리")이
     있으나 Home.tsx만 분리가 안 돼 있었음.

2. **클램프가 아바타 외곽 과소평가 (보조 원인).**
   `clampMascotPositionToLake`가 `MASCOT_SIZE/2`(=29)를 가로·세로 반경에 동일 적용.
   실제 아바타는 세로 `58*1.15≈66.7px` + SVG `overflow:visible` + glow로 외곽이 더 큼 →
   위/아래 끝에서 클램프 여유(약 2%)를 넘겨 미세 잘림 가능.

## 현재 동작
- 기존 클램프는 원형(반경 단일) + d≤radius일 때 사각 no-op 클램프.
- transform 버그로 인해 클램프가 막는 "의도 중심"과 실제 렌더 위치가 어긋나 있었음.
