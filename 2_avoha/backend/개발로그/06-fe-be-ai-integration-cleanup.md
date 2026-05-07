# 06 · FE↔BE↔Chatbot 통합 정상화 + 더미/UX 정리 (Pivot 회복 세션)

- **날짜**: 2026-05-07
- **파트**: Frontend + Chatbot(AI) + BE 개발로그
- **상태**: 완료. production 배포 검증 끝. 채집권 동기화는 OAuth 로그인 + provider_user_key 매핑된 사용자 한정.

## 목표

직전 commit `f8af130` ("Pivot avoha frontend UI")로 인해 OAuth 흐름이 통째로 우회되고 모든 화면이 더미/fallback에 의존하게 된 상태에서 출발. 이 세션에서 다음을 모두 정상화한다:

1. 카카오 OAuth 흐름 복원 (FE만 깨졌음, BE는 멀쩡)
2. fallback/더미 제거 + 빈 상태 카피로 정직하게 표시
3. 두 화면(Home/Analysis)에 흩어져 있던 감정 카테고리 매핑을 단일 진실로 통합
4. Home에 잠자고 있던 fieldToday/pet-store 인프라 활성화
5. 마스코트 클릭으로 보석이 의도 없이 사라지는 UX 함정 차단
6. **채집권 mismatch 근본 해결** — chatbot의 인메모리 카운터를 `collection_tickets` DB로 동기화
7. chatbot OpenRouter 4초 timeout 잦음 완화

## 핵심 결정

| 결정 | 내용 | 이유 |
|---|---|---|
| AuthGate를 `e78849b` 시점 코드로 git checkout 복원 | 직전 커밋이 fetchMe/Navigate 게이트를 통째로 들어내고 dev-user setState로 강제 인증 | 새로 짜는 것보다 정확한 직전 정상 코드 그대로가 안전 |
| 401 처리는 `lib/api.ts` 인터셉터에서 단일화 | PSL 도메인(*.up.railway.app) 때문에 쿠키 차단 → Bearer 토큰이 유일 인증 경로 | 두 경로(쿠키/JWT)에서 갈라지지 않게 한 곳에서 모음 |
| 더미 fallback 제거 (Home `gemCounts`, Analysis `buildFallbackItems`) | OAuth 복구 후엔 진짜 0건 상태도 가짜로 채워져 보임 → 사용자 혼란 | 빈 상태 카피로 정직하게 표시 + next action 안내 |
| `lib/emotion-category.ts` 공용 헬퍼 추출 | Home과 Analysis가 raw emotion → 5대 카테고리 매핑을 **각자** 들고 있어서 `serenity`/`untroubled`가 Home에선 카운팅 누락되던 분류 불일치 | 단일 진실. 새 카테고리 추가 시도 한 곳만 수정 |
| Home의 fieldToday 보석 layer를 287×287 별도 컨테이너로 가둠 | 백엔드는 0..1 정규좌표(field-store에서 0..100% 변환). 부모 div 전체 폭에 매핑하면 모바일 폭에 따라 원 밖으로 튀어나감 | 좌표 의미와 렌더 영역 일치 |
| zustand `persist` 적용 (`avoha-pet`) + `partialize` 화이트리스트 | 다마고치 상태 새로고침 휘발 + 메서드는 직렬화 불가 | 단일 디바이스 가정 충분, 향후 BE 동기화는 `syncFromServer` 대기 |
| z-index 명시 분리 (배경 0 / 보석 1 / 날짜·마스코트 2) | 동률 + DOM 순서 의존은 누가 순서 바꾸는 순간 깨짐 | 의도를 코드로 박음 |
| 마스코트 클릭 = 먹이기 흐름 **삭제** | 시각 피드백 0 + BE 동기화 0 + 의도치 않은 클릭으로 보석 사라짐. 데모 단계에서 가장 큰 UX 함정 | 추후 명시적 인터랙션(예: 별도 먹이기 버튼) + BE `consumed_at` 영구 반영 흐름으로 재구성 예정 |
| `mascot.png` `onError`를 `useState<boolean>` 기반으로 교체 | 기존 코드는 `e.currentTarget.parentElement!.innerHTML = ...`로 React 우회 + DOM 직접 주입 | React 패턴 일관, 잠재 XSS 패턴 회피 |
| **chatbot 채집권을 `collection_tickets` 테이블로 동기화** | 인메모리 dict와 BE의 `/me` 응답이 영원히 어긋남 | provider_user_key → users.id 조회 후 UPSERT + FOR UPDATE 단일 TX. 미로그인 사용자는 인메모리 fallback 유지 |
| chatbot OpenRouter timeout 4s → 10s | 카카오 콜백 모드(useCallback:true)라 5초 제한 회피, free tier가 burst 시 4-8초 걸림 | 직접 호출 경로(봇테스트)는 가끔 timeout 노출 가능하지만 production 채널은 콜백이라 무영향 |
| Critical/Important 리뷰 이슈는 즉시 fix, nice-to-have는 명시적으로 보류 | `useMemo` 캐시 over-engineering, 보석 silhouette 차별 렌더는 디자인 결정 필요 | 데모 직전 우선순위 체계화 |

## 파일 트리 (이번 세션 변경/신규)

```
2_avoha/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── AuthGate.tsx                  복원 (e78849b)
│   │   ├── lib/
│   │   │   └── emotion-category.ts           신규 — 5대 카테고리 매핑 단일 진실
│   │   ├── routes/
│   │   │   ├── Home.tsx                      더미 제거, fieldToday 시각화, 287x287 컨테이너,
│   │   │   │                                 z-index 분리, error UI, onError React 패턴, 클릭 비활성화
│   │   │   └── Analysis.tsx                  buildFallbackItems 삭제, 빈 상태 4곳(summary/journey/detail/question/care),
│   │   │                                     mapEmotionToCategory → emotion-category로 통합
│   │   └── stores/
│   │       └── pet-store.ts                  zustand persist 적용 (avoha-pet), STAGE_THRESHOLDS Exclude<egg>,
│   │                                         syncFromServer expToNext 주석, hydration race 가이드 주석
│   └── .env.local                            (로컬 dev 시도 시 신규, production 직결로 결국 제거됨)
├── ai/
│   └── chatbot/
│       └── main.py                           _get_user_uuid / _db_get_remaining / _db_decrement_ticket 헬퍼 신규,
│                                             get_remaining_count / check_and_increment / check_and_increment_n
│                                             모두 DB 우선 + 인메모리 fallback 패턴, OpenRouter timeout 4s→10s
└── backend/
    └── 개발로그/
        ├── README.md                         BE-15(anxiety dead 의심) 추가, 06 인덱스 추가
        ├── 05-fe-be-integration-analysis.md  (이전 세션 분석 — 이번 세션의 입력)
        └── 06-fe-be-ai-integration-cleanup.md   본 문서
```

## 커밋 시퀀스 (시간순)

```
bdb6f04 |FIX| AuthGate 카카오 OAuth 복원 — fetchMe/Navigate 게이트 되돌림
8ecd751 |CHORE| frontend 재배포 트리거 — Railway redeploy가 latest commit이 아닌
                이전 successful image를 재사용해서 빈 commit으로 git-watch 강제 발동
f5e5512 |FIX| 더미 fallback 제거 (Home gemCounts, Analysis buildFallbackItems) + 빈 상태 카피
3bc94a4 |REFACTOR| 감정 카테고리 매핑 통합 + Analysis 빈 상태 분기 보강
dfafda4 |DOC| BE 개발로그 — anxiety 카테고리 dead 의심 (BE-15) 메모
ac72b53 |FEAT| Home 오늘 드롭 원석 시각화 + pet-store 영속화
4f32df2 |FIX| Home 좌표 부정합 + z-index 명시 + error UI + onError React 패턴화
3775b95 |FIX| 마스코트 클릭 = 먹이기 흐름 비활성화
84a42dd |FIX| 채집권 동기화 — chatbot이 collection_tickets 직접 UPDATE
8b6a9d2 |FIX| chatbot OpenRouter timeout 4s → 10s
```

## chatbot 채집권 동기화 — 동작 모델

기존(broken):
```
카톡 → chatbot → user_count(인메모리) -1 → 카톡 응답 "4개 남음"
                                                     ↑
                                                     └ 서버 재시작 시 휘발
웹 /me → BE → collection_tickets SELECT remaining → 5
                                                    ↑
                                                    └ chatbot이 한 번도 차감 안 함
```

수정 후:
```
카톡 → chatbot
        ├─ _get_user_uuid(provider_user_key) → users.id
        ├─ user UUID 있음:
        │   _db_decrement_ticket(uuid, n)  → UPSERT + FOR UPDATE TX
        │   ├─ INSERT collection_tickets ON CONFLICT DO NOTHING
        │   ├─ SELECT remaining FOR UPDATE
        │   ├─ actual = min(n, remaining)
        │   └─ UPDATE remaining = remaining - actual
        │   COMMIT → (actual, remaining) 반환
        └─ user UUID 없음 (미로그인): 인메모리 user_count 차감 (기존 동작 그대로)

웹 /me → BE → collection_tickets SELECT remaining → 동일 값
```

**경계 조건**:
- OAuth 로그인했지만 LoginCallback에서 `setProviderUserKey()` 누락 → 매핑 안 됨, fallback 인메모리
- DB 일시 실패 → 자동 fallback 인메모리, 다음 호출 시 재시도

## API 변경 요약

| Method | Path | 변경 |
|---|---|---|
| (chatbot 내부 헬퍼) | — | `_get_user_uuid`, `_db_get_remaining`, `_db_decrement_ticket` 3종 신규 |
| BE 측 변경 | — | **없음**. `/me`, `/inventory/*`, `/auth/*` 등 모두 그대로 — chatbot이 같은 테이블을 보도록 align한 것 |

## 검증 (production)

| 항목 | 결과 |
|---|---|
| `/health` | 200 |
| `/health/ready` | 200, db OK 141ms, redis OK 33ms |
| `/auth/kakao/login` | 302 → kauth.kakao.com authorize URL with signed state |
| `/me` (no token) | 401 (정상 게이트) |
| frontend 새 번들 hash 갱신 | 매 commit마다 갱신 확인 (BysFU → DBXuOiii → BfDExq9y → CLhw3XDH → ApSVkf50 → Dyd38K_j → aWDysxFR) |
| 더미 흔적 검색 (`buildFallbackItems`/`sample-`/`sadness:N`/`mapEmotionToCategory`) | 0건 |
| persist 키 검색 (`avoha-pet`/`todayDrops`/`persist`) | 모두 번들 포함 |
| 카카오 OAuth flow | 사용자 직접 시크릿창 테스트 → 카톡 닉네임/프로필 정상 표시 |

## 삽질 로그

### 1. Railway 빌드 30분 hang

**증상**: `bdb6f04` push 직후 frontend 서비스 deployment `4c83123a`가 30분째 BUILDING. Nixpacks 카드 출력 후 Docker stage 진입 못 함.

**원인**: Railway Metal builder 큐 적체. 우리 변경(1파일 36줄)이 가벼움 + commit 자체는 정상이었음. 외부 변수.

**해결**: dashboard에서 deployment Cancel → CLI `railway redeploy` 시도했으나 거부 ("latest deployment is currently building"). 결국 사용자가 dashboard에서 cancel 누르고 그 후 `railway redeploy`.

**교훈**: `railway redeploy`는 **이전 successful deployment의 image를 재사용**하는 명령이지 새 git commit을 가져오지 않음. 새 commit을 강제 빌드시키려면 git push가 유일한 트리거. 빈 commit 패턴 (`git commit --allow-empty`)이 필요한 상황 있음.

### 2. `railway redeploy`가 잘못된 commit 빌드

**증상**: cancel + `railway redeploy --service frontend -y` 후 새 deployment `ef2edbf6`가 commit `f8af1305` (이전, 망가진) 빌드 중.

**원인**: 위 #1의 교훈. redeploy는 latest **successful** image를 다시 deploy.

**해결**: `git commit --allow-empty` + `git push origin main`으로 새 commit `8ecd751` 만들어 git-watch 강제 발동 → Railway가 새 commit 자동 감지 → 빌드 시작.

**교훈**: production 배포 트리거는 git push가 가장 신뢰 가능. CLI `redeploy`는 "환경변수만 바뀌었을 때" 같은 좁은 용도.

### 3. zsh `status` read-only 변수 충돌

**증상**: bash polling 스크립트의 `status=$(...)` 라인에서 `(eval):3: read-only variable: status` 즉시 실패 (exit 1).

**원인**: zsh 환경에서 `$status`는 read-only 내장 변수.

**해결**: 변수명을 `dep_status`로 변경.

**교훈**: 크로스 셸 스크립트는 일반 변수명 회피 (`status`, `path`, `argv`, `pipestatus` 등 zsh 특수).

### 4. Vite 번들 hash 동일 출현

**증상**: 빌드 로그에서 `index-BysFU-I9.js`가 두 번 나타남. 동일 source면 같은 hash가 나오는 게 정상이지만, AuthGate 변경 후에도 같은 hash라 의심.

**원인**: 첫 번째는 **이전 SUCCESS 빌드의 로그** (railway logs --build이 latest SUCCESS 가져옴). 두 번째 (실제 새 빌드)에서는 `index-DBXuOiii.js`로 hash 갱신됨. 즉 다른 deployment.

**교훈**: `railway logs --service X --build`가 어떤 deployment의 로그인지 deployment ID와 함께 확인 필요.

### 5. `Critical 좌표 부정합` — 코드 리뷰가 아니었으면 놓쳤을 것

**증상**: Home의 보석들이 마스코트 287×287 원 밖으로 튀어나갈 가능성. 백엔드는 0..1을 주고 store가 0..100%로 변환, 그러나 부모 div는 287x287이 아닌 화면 전체 폭(335-391px).

**원인**: 좌표 시스템과 렌더 영역의 의미 분리가 안 됐음.

**해결**: 287×287 absolute layer를 별도로 만들어 보석들 그 안에 가둠. `pointerEvents: none`, `zIndex: 1`.

**교훈**: 백엔드가 정규좌표 줄 때 그 좌표가 **어떤 영역 기준**인지 contract 명시 필요. `field/today` 응답 스키마에 "원형 디스크 / 사각형 / 사용자 정의" 같은 hint 추가 후보.

### 6. OpenRouter Gemma free tier timeout 빈도

**증상**: 사용자가 카톡 메시지 보내면 "현재 세공소에 광물이 몰려…" (`classify_emotion()` TIMEOUT 분기) 응답이 자주 발생.

**원인**: timeout 4.0s가 카카오 5초 제한을 의식한 보수적 값. 그러나 production은 콜백 모드(`useCallback:true`)라 5초 제한 회피됨. free tier burst 시 4-8초 걸리는 사례 잦음.

**해결**: timeout 4 → 10초.

**교훈**: 카카오 5초 제한은 **첫 응답에만** 적용 (콜백 모드면 더 그렇다). BackgroundTask 안의 외부 API 호출은 callbackUrl 만료(\~1분) 안에만 들어오면 됨. 여기서 보수적으로 4초 잡으면 free tier에서 사용자 경험 무너짐.

### 7. chatbot의 채집권은 인메모리 ↔ BE는 DB

**증상**: 사용자 보고 "카톡엔 4개 남았다, 웹엔 5/5".

**원인**: 두 시스템이 **완전히 별개의 store**를 봄. chatbot main.py:88-118의 `user_count = {}`는 인메모리 dict. BE `services/tickets.py`의 `get_today_tickets`는 `collection_tickets` 테이블 SELECT/UPSERT. 챗봇이 차감해도 BE DB는 그대로. 서버 재시작 시 인메모리도 휘발.

**해결**: chatbot이 같은 `collection_tickets` 테이블을 보도록 헬퍼 3종 추가 + 기존 함수 모두 DB 우선 / 인메모리 fallback 패턴.

**교훈**: 두 서비스가 같은 사용자 자원을 다룰 때 source of truth를 단일화. chatbot이 이미 `users.provider_user_key`로 `gems` 테이블에 INSERT하던 패턴(직전 commit `2ef000e`)이 있었음 — 같은 패턴을 채집권에도 적용.

## 코드 리뷰 (`superpowers:code-reviewer`) 운용 결과

이 세션에서 두 번 외부 리뷰 에이전트 호출 — 결과 모두 즉시 fix.

| 라운드 | 대상 | Critical | Important | 처리 |
|---|---|---|---|---|
| 1 | `f5e5512` 더미 제거 | 0 | 카테고리 매핑 불일치, 빈 상태 분기 누락 (3곳), 용어 흔들림 | 다음 commit `3bc94a4`에서 모두 fix |
| 2 | `ac72b53` Home viz + persist | 1 (좌표 부정합) | 4 (hydration race, z-index, error UI, syncFromServer contract) | `4f32df2`에서 Critical + Important 모두 fix |

## 남은 작업 (이번 세션 범위 밖)

### 차기 우선순위
- **BE-13** `GET /catalog/emotions` — CollectionBook 도감화 (현재 정적 그리드)
- **BE-14** `chatbot ↔ users` 매핑 검증 스크립트 — `provider_user_key` NULL row 감지
- **BE-15** anxiety 카테고리 dead — 시드에 추가 / 디자인 슬롯 제거 / calm 재배치 중 결정
- 사진 채집 흐름의 `stickers` 테이블 ↔ `gems` 테이블 연결 강화 (현재 사진은 stickers, 원석은 gems 별도)

### 의도적 미처리 (다음 세션 후보)
- 보석 silhouette(`pebble`/`crystal`/`fragment`) 차별 렌더 (디자인 결정 필요)
- `useMemo` 캐시 — 데모 단계 over-engineering
- 빈 상태 카피에 카카오톡 챗봇 딥링크 버튼 (현재 텍스트만)
- `pet-store` BE 동기화 — `GET/PUT /me/pet` 신규 (멀티 디바이스 시연 필요해질 때)
- vitest 테스트 추가 — `lib/emotion-category` 매핑, `pet-store` persist round-trip, `field-store` 0..1→0..100, Home 빈 상태 회귀

### chatbot 인메모리 fallback의 의미
이번 세션에서 미로그인(provider_user_key→user.id 매핑 실패) 사용자에 대한 인메모리 fallback을 유지함. 장기적으로는 chatbot도 사용자 처음 만나면 자동으로 `users` row를 생성하는 흐름이 깨끗함. 단 OAuth `kakao_id` 없이 `provider_user_key`만으로 user 생성 시 `users.kakao_id NOT NULL` 제약과 충돌 — 스키마 조정 또는 임시 placeholder 필요. 별도 BE 작업으로 분리.

## 참조

- 직전 세션 분석: [`./05-fe-be-integration-analysis.md`](./05-fe-be-integration-analysis.md)
- chatbot CLAUDE.md (동작 모델 상세): [`../../ai/chatbot/CLAUDE.md`](../../ai/chatbot/CLAUDE.md)
- Railway 프로젝트: `intelligent-wholeness` / production
  - backend: `https://backend-production-3172.up.railway.app`
  - frontend: `https://frontend-production-09f81.up.railway.app`
  - chatbot: 별도 서비스 (Procfile 기반 uvicorn)
