# 소확행 (Sohwakhaeng) — 1차 MVP 테스트

일상 속 '소소하지만 확실한 행복'을 기록하는 모바일 웹앱. **투자자 데모용 1차 MVP**로, 유로그([`2_Ulog/`](../2_Ulog/)) 이전에 "기록 → 보상" 가설을 검증하기 위해 만들었습니다. 메인 프로젝트와 코드·자산을 공유하지 않습니다.

---

## 주요 기능

### 🗺 홈 지도
- 내가 기록한 소확행 장소가 **지도 위에 마커로** 쌓입니다 (Leaflet)
- 기록이 늘수록 나만의 행복 지도가 완성되는 경험

### 📸 기록하기
- 사진/메모 캡처 → **챗봇 대화**로 그 순간을 풀어내기 → **AI 인사이트 요약** 카드
- 사진 EXIF에서 위치·시간을 자동 추출해 지도에 연결
- 기록을 마치면 **포인트 적립** — 보상 루프의 시작점

### 🎯 취미 추천
- 쌓인 기록을 바탕으로 취향에 맞는 **취미 큐레이션** 제공

### 👤 프로필
- 누적 기록 수·적립 포인트 확인

### 🚪 온보딩 / 로그인
- 첫 진입 시 서비스 컨셉 안내 플로우

---

## 기술 스택

- **Framework**: React 19 + TypeScript + Vite 6
- **Routing**: React Router v7 · **State**: Zustand · **Styling**: Tailwind CSS v4
- **Map**: Leaflet + React-Leaflet · **Validation**: Zod
- **Testing**: Vitest + Testing Library + fast-check (속성 기반 테스트)

## 실행 방법

```bash
npm install
npm run dev         # 개발 서버
npm run build       # 프로덕션 빌드
npm test            # 유닛 테스트
```

## 디렉토리 구조 (기능 → 코드 위치)

```
1_avoha/
├── src/
│   ├── components/   화면 단위 View — 지도·기록·추천·프로필 컴포넌트
│   ├── store/        Zustand 스토어 — 기록·포인트 상태
│   ├── services/     외부 연동 — EXIF 추출, 챗봇/AI 목업 호출
│   ├── data/         데모용 목업 데이터 (장소·취미·인사이트)
│   ├── lib/          유틸리티
│   └── types/        공용 타입
└── tests/            유닛 / 속성 기반(fast-check) 테스트
```
