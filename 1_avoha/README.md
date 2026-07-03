# 소확행 (Sohwakhaeng) — MVP

일상 속 '소소하지만 확실한 행복'을 기록하고, 지도 위에 남기며, 취미 추천과 포인트로 보상받는 모바일 웹앱 MVP.

## 주요 기능

- **온보딩 / 로그인** — 첫 진입 플로우
- **홈 지도** — 내가 기록한 소확행 장소를 지도에서 확인
- **기록하기** — 사진/메모 캡처 → 챗봇 대화 → 인사이트 요약 → 포인트 적립
- **취미 추천** — 사용자 기록 기반 취미 큐레이션
- **프로필** — 누적 기록과 포인트 확인

## 기술 스택

- **Framework**: React 19 + TypeScript + Vite 6
- **Routing**: React Router v7
- **State**: Zustand
- **Styling**: Tailwind CSS v4
- **Map**: Leaflet + React-Leaflet
- **Validation**: Zod
- **Testing**: Vitest + Testing Library + fast-check

## 실행 방법

```bash
npm install
npm run dev         # 개발 서버
npm run build       # 프로덕션 빌드
npm run preview     # 빌드 결과 미리보기
npm test            # 유닛 테스트
```

## 디렉토리 구조

```
1_avoha/
├── src/
│   ├── components/   # 화면 단위 View 컴포넌트
│   ├── store/        # Zustand 스토어
│   ├── lib/          # 유틸리티
│   ├── services/     # 외부 연동 로직
│   ├── data/         # 목업 데이터
│   └── types/        # 공용 타입
├── tests/            # 유닛 / 속성 기반 테스트
├── index.html
└── vite.config.ts
```
