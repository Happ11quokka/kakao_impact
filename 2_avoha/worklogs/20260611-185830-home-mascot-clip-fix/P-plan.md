# P — Plan

Status: completed

## Goal
홈 화면(`routes/Home.tsx`)에서 마스코트 "로기"(ChibiAvatar)가 조이스틱으로 움직일 때
호수 원을 벗어나/가장자리에서 잘리는 현상을 제거한다.

## Source requirements
- 사용자 보고: "홈화면에서 마스코트가 화면을 벗어나는 경우가 좀 생긴다" (간헐적).
- 마스코트는 호수 원(`buildHomeLakeCircleStyle`, `overflow: hidden`) 안에서만 머물러야 함.
- 조이스틱으로 어느 방향 끝까지 밀어도 캐릭터 전체가 보여야 함(잘림 없음).

## Approach
1. **transform 충돌 분리**: 위치 중앙정렬 transform(`translate(-50%,-50%)`)과
   breathe 애니메이션(`transform` 키프레임)을 한 엘리먼트에서 분리 → 바깥/안쪽 div로 나눔.
2. **클램프 보정**: `clampMascotPositionToLake`가 아바타 실제 외곽(세로 1.15배 + glow)을
   반영하도록 가로/세로 반경을 분리해 타원형 클램프로 변경.

## Non-goals
- 마스코트 SVG 디자인/모션 자체 변경(없음 — 동작만 보존).
- HomeField.tsx 등 다른 화면 수정.
- 사용자가 명시적으로 요청하기 전의 배포/deploy (이번 범위는 push까지만, deploy 별도).
