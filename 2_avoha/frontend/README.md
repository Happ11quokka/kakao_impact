# 로기 · Frontend

모바일 웹/PWA. 카톡 채널 **"닥토 공방"** 하단 메뉴에서 링크 클릭 → 즉시 진입.

## 스택
- **빌드**: Vite 6, TypeScript 5.7
- **UI**: React 19, Tailwind CSS v4 (`@theme` 토큰), Framer Motion
- **상태**: Zustand (`auth`, `inventory`, `crafting`, `field`)
- **라우팅**: React Router v7
- **PWA**: vite-plugin-pwa (manifest + Workbox 오프라인 캐시)
- **테스트**: Vitest + React Testing Library + fast-check
- **E2E**: Playwright (3 시나리오)

## 라우트
| Path | 화면 | 비고 |
|---|---|---|
| `/` | HomeField | 픽셀 횡스크롤 맵, 오늘 드롭 아이템 |
| `/inventory` | Inventory | 4×4 그리드(광물·스티커 탭) · 등급 테두리 돌멩이/원석/보석/크리스탈 |
| `/workshop` | Workshop | 드래그앤드롭 세공 |
| `/book` | CollectionBook | 도감 + 레시피 카드 |
| `/me` | MyPage | 로기 지수·설정 |
| `/login/callback` | LoginCallback | Kakao OAuth 콜백 |

## 인접 파트 인터페이스
- **Backend (HTTP)**: `VITE_API_BASE_URL` 환경변수. 엔드포인트 목록은 [PRD 4.4](../../docs/avoha/2026-04-17-avoha-prd.md)
- **Backend (SSE)**: `GET /sse/inventory` 로 실시간 아이템 드롭 수신
- **Design**: `public/sprites/`, `public/gems/` 에 디자이너 산출물 배치

## 첫 실행
```bash
cd 2_avoha/frontend
cp .env.example .env    # VITE_API_BASE_URL, VITE_KAKAO_APP_KEY
npm install
npm run dev             # http://localhost:5173
```

## 환경변수
```
VITE_API_BASE_URL=http://localhost:3000
VITE_KAKAO_APP_KEY=
VITE_SSE_PATH=/sse/inventory
```

## 성능 예산
- LCP < 2.5s, TTI < 3.5s (3G Slow)
- 초기 번들 < 180 KB gzip (스프라이트 atlas는 lazy)
- Lighthouse 접근성 ≥ 90, PWA ≥ 90

## 작업 리스트 (PRD 3.6)
- [ ] **FE-1** 프로젝트 스캐폴드 (Vite + Tailwind + PWA)
- [ ] **FE-2** 디자인 토큰·팔레트 CSS 변수, pixelated 렌더링
- [ ] **FE-3** Kakao OAuth 클라이언트 콜백 + 세션
- [ ] **FE-4** `api-client` + auth 인터셉터
- [ ] **FE-5** 홈 필드 (3-layer 패럴랙스, 아바타 idle)
- [ ] **FE-6** 4×4 인벤토리 그리드·스티커 탭 + 등급 테두리(돌멩이/원석/보석/크리스탈)
- [ ] **FE-7** 세공소 드래그앤드롭 + 레시피 판정
- [ ] **FE-8** SSE 실시간 인벤토리 반영
- [ ] **FE-9** 도감 (수집률·실루엣·레시피 카드)
- [ ] **FE-10** 마이페이지 + 로기 지수 그래프 (Recharts)
- [ ] **FE-11** PWA manifest, 오프라인 캐시
- [ ] **FE-12** E2E 스모크 테스트
