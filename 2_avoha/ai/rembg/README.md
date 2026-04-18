# 아보하 · AI rembg (누끼 서비스)

유저 사진의 배경을 제거해 "스티커"로 변환하는 HTTP 서비스. Python + FastAPI.

## 스택
- Python 3.11
- FastAPI + Uvicorn
- rembg (u2net_lite, CPU)
- Pillow (PNG 최적화)
- boto3 (Railway Volume S3-호환 저장 시)

## 디렉토리
```
rembg/
├── app/
│   ├── main.py                 # FastAPI 앱
│   ├── processor.py            # rembg 래퍼 + 폴백 판정
│   └── storage.py              # Volume / signed URL
├── tests/
│   └── fixtures/               # 샘플 이미지 10장
├── Dockerfile
├── requirements.txt
└── .env.example
```

## 엔드포인트
| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/remove-bg` | multipart `file` → `{ url, polaroid_fallback, confidence }` |
| `GET` | `/healthz` | Railway 헬스체크 |

### 폴백 로직
- 모델 confidence < 0.5 → `polaroid_fallback=true` 반환 (프론트는 폴라로이드 프레임으로 감쌈)
- 처리시간 > 15s → 타임아웃, 폴백 반환
- 얼굴만 있는 이미지 → mediapipe face detection 보조, 폴백 없이 head-cutout 리턴

## 인접 파트 인터페이스
- **Backend**: `POST /remove-bg` 호출 (Railway 내부망 `http://avoha-rembg:8000`)
- 결과 저장: Railway Volume 마운트 `/data/stickers/{user_id}/{uuid}.png`
- 외부 접근: signed URL 만료 24시간

## 첫 실행
```bash
cd 2_avoha/ai/rembg
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 배포
```bash
docker build -t avoha-rembg .
railway up                      # Railway CLI
```

## 환경변수
```
VOLUME_PATH=/data/stickers
SIGNED_URL_SECRET=
MAX_IMAGE_MB=10
MODEL_NAME=u2net_lite
LOG_LEVEL=info
```

## 성능 SLA
- p50 ≤ 3s, p95 ≤ 8s (1 vCPU / 1 GB)
- 동시 처리 2건 (BullMQ 쪽에서 concurrency 제어)

## 작업 리스트
- [x] **RB-1** Dockerfile + requirements.txt (u2net_lite 모델 선로드)
- [x] **RB-2** `POST /remove-bg` 엔드포인트 + Pydantic 스키마
- [x] **RB-3** 폴백 판정 (confidence threshold)
- [x] **RB-4** Volume 마운트 + signed URL 발급
- [x] **RB-5** 헬스체크 + 메모리 리크 모니터
- [ ] **RB-6** 샘플 10장 fixture 테스트
