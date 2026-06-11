# B — Build

Status: completed

## 변경 파일
`frontend/src/routes/Home.tsx` (1 file, +21 / -11)

### 1) transform 충돌 분리 (주 수정)
마스코트 래퍼를 바깥/안쪽 2개 div로 분리:
- 바깥 div: 위치 + `transform: translate(-50%,-50%)` + `transition`만 담당 (애니메이션 제거).
- 안쪽 div: `animation: mascotBreathe ...`만 담당.
- 그 안에 기존 `filter` div + `<ChibiAvatar>` 유지.

→ breathe의 `transform` 키프레임이 더 이상 중앙정렬 transform을 덮어쓰지 않음.
HomeField.tsx에서 쓰던 패턴과 동일하게 정렬.

### 2) 클램프 타원화 + 외곽 반영 (보조 수정)
- 새 상수 추가:
  - `MASCOT_HEIGHT_RATIO = 1.15` (ChibiAvatar height 비율)
  - `MASCOT_GLOW_MARGIN = 6` (glow/breathe lift 외곽 여유 px)
  - `MASCOT_HALF_W = MASCOT_SIZE/2 + MARGIN` (= 35)
  - `MASCOT_HALF_H = (MASCOT_SIZE*1.15)/2 + MARGIN` (≈ 39.35)
- `clampMascotPositionToLake`: 단일 원형 반경 → 가로/세로 분리 반경(`radiusX`, `radiusY`)
  기반 **타원 클램프**로 변경.
  - `norm = hypot(dx/radiusX, dy/radiusY)`, `norm>1`이면 `scale=1/norm`로 타원 경계에 투영.
  - 원은 정사각(304x304)이라 % ↔ px 동일 비율이 성립.

## 테스트
- 별도 신규 테스트 추가 없음. 기존 `frontend/src/routes/Home.test.ts`의
  클램프 경계 테스트(`x:98/y:98/corner` → ≤91, ≤41)가 새 로직에도 유효해 회귀 가드로 사용.
  (수동 계산상 right→86.5, down→85.1, corner hypot→35.8 으로 전부 통과)
