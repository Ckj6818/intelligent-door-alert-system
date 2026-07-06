FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HEADLESS=1 \
    BACKEND_UPLOAD_URL=http://backend:8081/api/alerts/upload

# OpenCV / YOLO 运行所需的系统库
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# 先安装 CPU 版 PyTorch（约 200MB），避免 ultralytics 拉取 1GB+ CUDA 包导致构建 OOM
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir opencv-python-headless requests flask \
    && pip install --no-cache-dir ultralytics

COPY doorAlert.py .

CMD ["python", "doorAlert.py"]
