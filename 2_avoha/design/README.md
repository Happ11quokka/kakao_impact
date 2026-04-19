# 아보하 · Design

픽셀 RPG × 따뜻한 디지털 저녁 컨셉. Figma + Kenney 팩 + 자체 픽셀 스프라이트.
운영 페르소나 브랜드: **닥토 공방** (카톡 채널·랜딩 공통 시그널).

## 산출물 경로
```
design/
├── brand/
│   ├── tokens.css              # HEX → CSS 변수 (복사용)
│   ├── typography.md
│   └── voice-tone.md
├── sprites/
│   ├── avatar/                 # 32×32, 4프레임 idle (.gitkeep)
│   ├── gems/                   # 10종 × 4등급 = 40개 (+ 참고 PNG)
│   ├── particles/              # 세공 8프레임 (.gitkeep)
│   └── ui-icons/               # Kenney 재가공 (.gitkeep)
├── wireframes/
│   ├── W-01-kakao-channel.png  # (미작성 시 생략)
│   ├── W-02-home-field-*.png   # 홈 필드 시간대별 캡처 3종
│   ├── W-03-inventory.png
│   ├── W-04-workshop.png
│   ├── W-05-collection-book.png
│   └── W-06-mypage.png
├── deliverables/               # 프론트 배포용 최종 PNG/SVG
│   ├── logo/
│   ├── favicon/
│   ├── pwa-icons/              # 192·512
│   ├── landing/
│   └── kakao-channel/          # 프로필·커버·하단 메뉴
├── CREDITS.md                  # Kenney·폰트 저작권 표기
└── figma-link.md               # Figma 공유 URL
```

### 현재 레포에 반영된 파일 (정리 기준일 기준)

| 경로 | 설명 |
| --- | --- |
| `wireframes/W-02-home-field-dawn.png` | 홈 필드 · 새벽/아침 톤 (실행 화면 캡처) |
| `wireframes/W-02-home-field-afternoon.png` | 홈 필드 · 낮 톤 |
| `wireframes/W-02-home-field-dusk.png` | 홈 필드 · 저녁 톤 |
| `sprites/gems/감정 원석_4단계.png` | 감정 원석 4단계 참고 이미지 |
| `brand/tokens.css` · `typography.md` · `voice-tone.md` | README **DE-1** 대응 초안 |
| `CREDITS.md` · `figma-link.md` | 표기·링크용 스텁 (내용 보강 필요) |

코드 작업은 주로 `2_avoha/frontend/src/routes/HomeField.tsx` 쪽이며, 위 PNG는 디자인 산출물로 `wireframes/`에 두었습니다.

## 컬러 토큰 (소확행 계승 + 픽셀 확장)
| 토큰 | HEX | 용도 |
|---|---|---|
| `--coral` | `#E8614D` | 포인트 액션(세공 버튼) |
| `--mint` | `#3AAFA9` | 평온·여유 감정 & CTA 보조 |
| `--amber` | `#E8A838` | 채집권·포만감 |
| `--pixel-bg-dawn` | `#F4EBD9` | 홈 필드 08:00 레이어 |
| `--pixel-bg-dusk` | `#3A3E5B` | 홈 필드 18:00 레이어 |
| `--ink` | `#1B1C26` | 본문 텍스트 |
| `--parchment` | `#FBF7EE` | 카드/도감 배경 |

## 타이포
- 본문: Noto Sans KR 400/700
- 제목·도감: Noto Serif KR 700 + 픽셀 윤곽 stroke
- 숫자·지수: DungGeunMo (픽셀 한글체, 상업 이용 OK)

## 10종 감정 × 보석 매핑 (PRD v1.1 — 3 카테고리)
| 카테고리 | 감정 (code) | 보석 | Hex |
|---|---|---|---|
| 평온 | 무탈 (`untroubled`) | 월장석 | `#E8EAF0` |
| 평온 | 평온 (`serenity`) | 아쿠아마린 | `#A0D8EF` |
| 행복 | 뿌듯 (`pride`) | 황수정 | `#F2C14E` |
| 행복 | 기쁨 (`joy`) | 루비 | `#E8614D` |
| 행복 | 만족 (`satisfaction`) | 앰버 | `#E8A838` |
| 행복 | 설렘 (`flutter`) | 로즈쿼츠 | `#F6B6C1` |
| 부정 | 슬픔 (`sadness`) | 사파이어 | `#2E4B8C` |
| 부정 | 짜증 (`annoyance`) | 가넷 | `#8E2F2F` |
| 부정 | 후회 (`regret`) | 연수정 | `#8A7E72` |
| 부정 | 위로 (`solace`) | 오팔 | `#E8D8CF` |

카테고리별 공통 실루엣(평온=둥근 자갈, 행복=각진 크리스탈, 부정=비대칭 조각)으로 색맹 접근성 확보.

## 광물 등급 표기 (4단계)
| Tier | 명칭 | 비주얼 컨셉 |
|---|---|---|
| 1 | **돌멩이** | 무광 텍스처, 단색 그라데이션 없음 |
| 2 | **반짝이는 원석** | 가장자리 하이라이트, 조각 결 표현 |
| 3 | **영롱한 보석** | 투명도 + 내부 빛 반사 |
| 4 | **마법의 크리스탈** | 오로라 발광 + 파티클 오라 |

## 인접 파트 인터페이스
- **Frontend**: `design/deliverables/` → `2_avoha/frontend/public/` 로 수동 복사 (빌드 스크립트 `scripts/sync-assets.sh`)
- **Backend**: `design/brand/tokens.css` 의 Hex → `emotions` 테이블 seed 값과 동기화
- **Ops console**: 동일 토큰 + 브랜드 가이드 준수

## 접근성 원칙
- 색상 외 형태로 감정 구분 (원석 실루엣 10종 고유화)
- `alt` 전수 작성
- `prefers-reduced-motion` → 파티클 생략

## 외부 에셋 & 라이선스
| 팩 | 라이선스 | 비고 |
|---|---|---|
| Kenney 1-Bit Pack | CC0 | 타일·가구 |
| Kenney Pixel RPG Icons | CC0 | UI 아이콘 |
| DungGeunMo | 자유 상업 | 픽셀 한글체 |
| Noto Sans/Serif KR | SIL OFL | Google Fonts |

`CREDITS.md` 에 팩 버전·다운로드 날짜 기재 필수.

## 작업 리스트
- [x] **DE-1** 컬러·타이포 토큰 초안 (`brand/tokens.css`, `typography.md`, `voice-tone.md`) — 프론트 `theme.css`와 맞춰가며 보강
- [ ] **DE-2** Kenney 팩 다운로드·저작권 표기 (`CREDITS.md`)
- [ ] **DE-3** 아바타 idle 4프레임 스프라이트시트
- [ ] **DE-4** 10종 감정 원석 × 4등급(돌멩이/원석/보석/크리스탈) = 40 스프라이트
- [ ] **DE-5** 세공 파티클 8프레임 시퀀스
- [ ] **DE-6** 카톡 채널 프로필·커버·하단 메뉴 아이콘
- [ ] **DE-7** 랜딩 페이지 (Figma → 정적 HTML)
- [ ] **DE-8** 빈 상태·에러 상태 일러스트
- [ ] **DE-9** 푸시·알림톡 카드 템플릿
- [ ] **DE-10** 로고·파비콘·PWA 아이콘 세트 (192, 512)
