FROM python:3.11-slim

WORKDIR /app

# OS deps for rembg + Pillow + mediapipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 모델 선로드 (u2net_lite) — 빌드 시점에 다운로드
RUN python -c "from rembg import new_session; new_session('u2net_lite')"

COPY app/ app/

ENV MODEL_NAME=u2net_lite \
    VOLUME_PATH=/data/stickers \
    MAX_IMAGE_MB=10 \
    LOG_LEVEL=info

VOLUME ["/data/stickers"]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
