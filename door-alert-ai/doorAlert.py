"""
Intelligent Door Alert — 边缘 AI 视觉检测节点

流水线：
  摄像头/视频帧 → YOLOv8n(+ByteTrack) 行人跟踪 → 综合接近度门控
  → YuNet/SFace 身份识别（姿态/清晰度过滤 + track 投票锁定）
  → UNAUTHORIZED：多帧确认后告警上报
  → AUTHORIZED：通行日志上报（不上报告警工单）
"""

import os

os.environ["OPENCV_LOG_LEVEL"] = "ERROR"

import base64
import glob
import io
import json
import math
import cv2
import time
import threading
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import requests
from concurrent.futures import ThreadPoolExecutor
from requests.adapters import HTTPAdapter
from ultralytics import YOLO

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    Image = ImageDraw = ImageFont = None

# 跨平台中文字体候选（Windows / Linux / macOS / Docker）
_CN_FONT_PATHS = (
    # Windows
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    # Linux / Docker（Noto / 文泉驿）
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/arphic/uming.ttc",
    # macOS
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
)
_cn_font_cache = {}
_cn_font_resolved_path = None


def _iter_cn_font_paths():
    """环境变量覆盖 + 内置回退链。"""
    env_path = os.environ.get("CN_FONT_PATH", "").strip()
    if env_path:
        yield env_path
    for path in _CN_FONT_PATHS:
        yield path
    # 额外扫描常见目录（避免发行版路径差异）
    scan_dirs = (
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        os.path.expanduser("~/.fonts"),
        os.path.expanduser("~/Library/Fonts"),
    )
    keywords = ("noto", "cjk", "wqy", "uming", "hei", "song", "pingfang", "msyh")
    for root in scan_dirs:
        if not os.path.isdir(root):
            continue
        try:
            for dirpath, _, filenames in os.walk(root):
                for name in filenames:
                    lower = name.lower()
                    if not lower.endswith((".ttf", ".ttc", ".otf")):
                        continue
                    if any(k in lower for k in keywords):
                        yield os.path.join(dirpath, name)
        except OSError:
            continue


def _resolve_cn_font(size=22):
    global _cn_font_resolved_path
    if ImageFont is None:
        return None
    key = int(size)
    if key in _cn_font_cache:
        return _cn_font_cache[key]
    for path in _iter_cn_font_paths():
        if not path or not os.path.isfile(path):
            continue
        try:
            font = ImageFont.truetype(path, key)
            _cn_font_cache[key] = font
            if _cn_font_resolved_path != path:
                _cn_font_resolved_path = path
                print(f"[INFO] 中文字体: {path}")
            return font
        except OSError:
            continue
    _cn_font_cache[key] = None
    if _cn_font_resolved_path is None:
        print("[WARN] 未找到中文字体，画面中文可能无法显示（可设 CN_FONT_PATH）")
        _cn_font_resolved_path = ""
    return None


def put_cn_text(
    img,
    text,
    org,
    color=(255, 255, 255),
    font_size=22,
    thickness=2,
    bg_color=None,
    bg_alpha=0.68,
):
    """
    在 BGR 图上绘制高对比度中英文混排文字（支持描边与半透明底衬，精确定位防越界重叠）。
    org=(x, y) 中 x 为文字左边界，y 为文字底部基线（与 OpenCV putText 一致）。
    """
    if not text:
        return img
    x, y = int(org[0]), int(org[1])
    font = _resolve_cn_font(font_size)
    if Image is None or font is None:
        cv2.putText(
            img, text, (x, y),
            cv2.FONT_HERSHEY_SIMPLEX, max(0.4, font_size / 32.0), color, thickness,
        )
        return img
    text = str(text)
    ih, iw = img.shape[:2]
    stroke_w = max(1, int(round(thickness * 0.7)))
    try:
        l, t, r, b = font.getbbox(text, stroke_width=stroke_w)
    except TypeError:
        try:
            l, t, r, b = font.getbbox(text)
        except Exception:
            l, t, r, b = 0, 0, int(font_size * len(text)), int(font_size * 1.3)
    except Exception:
        l, t, r, b = 0, 0, int(font_size * len(text)), int(font_size * 1.3)

    tw = max(1, int(r - l))
    th = max(1, int(b - t))
    pad_x = 6 if bg_color is not None else (stroke_w + 2)
    pad_y = 4 if bg_color is not None else (stroke_w + 2)

    # 限制在画面内，防止贴边时裁切或越界
    vx1 = max(pad_x, min(x, max(pad_x, iw - tw - pad_x)))
    vy2 = max(th + pad_y, min(y, max(th + pad_y, ih - pad_y)))
    vy1 = vy2 - th
    vx2 = vx1 + tw

    rx1 = max(0, vx1 - pad_x)
    ry1 = max(0, vy1 - pad_y)
    rx2 = min(iw, vx2 + pad_x)
    ry2 = min(ih, vy2 + pad_y)
    if rx2 <= rx1 or ry2 <= ry1:
        return img

    patch = img[ry1:ry2, rx1:rx2]
    if bg_color is not None:
        bg_patch = np.empty_like(patch)
        bg_patch[:, :] = (int(bg_color[0]), int(bg_color[1]), int(bg_color[2]))
        cv2.addWeighted(bg_patch, float(bg_alpha), patch, 1.0 - float(bg_alpha), 0, patch)

    pil_patch = Image.fromarray(cv2.cvtColor(patch, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_patch)
    fill = (int(color[2]), int(color[1]), int(color[0]))
    dx = (vx1 - rx1) - int(l)
    dy = (vy1 - ry1) - int(t)
    try:
        draw.text(
            (dx, dy),
            text,
            font=font,
            fill=fill,
            stroke_width=stroke_w,
            stroke_fill=(12, 14, 18),
        )
    except TypeError:
        draw.text((dx + 1, dy + 1), text, font=font, fill=(12, 14, 18))
        draw.text((dx, dy), text, font=font, fill=fill)
    img[ry1:ry2, rx1:rx2] = cv2.cvtColor(np.asarray(pil_patch), cv2.COLOR_RGB2BGR)
    return img

# ================= 全局配置项 =================
CONF_THRESHOLD = float(os.environ.get("CONF_THRESHOLD", "0.45"))
# YOLO 推理间隔（秒）；GPU 下可更短以提升跟手感
INFERENCE_INTERVAL = float(os.environ.get("INFERENCE_INTERVAL", "0.12"))
# YOLO 输入边长；GPU 可用 416，CPU 可改环境变量 YOLO_IMGSZ=320
YOLO_IMGSZ = int(os.environ.get("YOLO_IMGSZ", "416"))
# 推理前先把帧缩到该宽度
YOLO_FRAME_MAX_WIDTH = int(os.environ.get("YOLO_FRAME_MAX_WIDTH", "640"))
# 优先 nano（更快）；无文件时用 medium
_default_yolo = "yolov8n.pt" if os.path.isfile("yolov8n.pt") else "yolov8m.pt"
YOLO_WEIGHTS = os.environ.get("YOLO_WEIGHTS", _default_yolo)
# 推理设备：auto=有 CUDA 用 GPU，否则 CPU；可强制 YOLO_DEVICE=cpu / 0 / cuda:0
YOLO_DEVICE = os.environ.get("YOLO_DEVICE", "auto")


def resolve_yolo_device():
    """解析 YOLO 推理设备，并打印一次硬件信息。"""
    explicit = (YOLO_DEVICE or "auto").strip().lower()
    if explicit not in ("", "auto"):
        # 兼容 0 / cuda / cuda:0
        if explicit.isdigit():
            return f"cuda:{explicit}"
        if explicit == "cuda":
            return "cuda:0"
        return YOLO_DEVICE.strip()
    try:
        import torch

        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            print(f"[INFO] 检测到 GPU，YOLO 使用 CUDA: {name}")
            return "cuda:0"
        print("[INFO] 未检测到可用 CUDA，YOLO 使用 CPU")
    except Exception as exc:
        print(f"[INFO] 无法检测 CUDA（{exc}），YOLO 使用 CPU")
    return "cpu"
BACKEND_UPLOAD_URL = os.environ.get(
    "BACKEND_UPLOAD_URL",
    "http://localhost:8081/api/alerts/upload",
)
DEVICE_ID = int(os.environ.get("DEVICE_ID", "1"))
HEADLESS = os.environ.get("HEADLESS", "0").strip() in ("1", "true", "yes")
VIDEO_LOOP = os.environ.get("VIDEO_LOOP", "1").strip() in ("1", "true", "yes")
HEARTBEAT_INTERVAL = float(os.environ.get("HEARTBEAT_INTERVAL", "10"))
# 前端 YOLO 实时预览（MJPEG）：默认本机 8090
STREAM_ENABLE = os.environ.get("STREAM_ENABLE", "1").strip() in ("1", "true", "yes")
STREAM_PORT = int(os.environ.get("STREAM_PORT", "8090"))
STREAM_MAX_WIDTH = int(os.environ.get("STREAM_MAX_WIDTH", "640"))
STREAM_JPEG_QUALITY = int(os.environ.get("STREAM_JPEG_QUALITY", "60"))
STREAM_FPS = float(os.environ.get("STREAM_FPS", "8"))

_stream_lock = threading.Lock()
_stream_jpeg = None  # 最新一帧 JPEG bytes，供 MJPEG 推送

# ================= 人脸识别 / 接近度门控 =================
FACE_DISTANCE_THRESHOLD = float(os.environ.get("FACE_DISTANCE_THRESHOLD", "0.55"))
AUTHORIZED_FACES_DIR = os.environ.get("AUTHORIZED_FACES_DIR", "authorized_faces")
# 综合接近度阈值：低于此值不做人脸推理、不触发告警
PROXIMITY_ALERT_THRESHOLD = float(os.environ.get("PROXIMITY_ALERT_THRESHOLD", "0.35"))
# 接近度融合权重：面积占比 / 接地点垂直位置 / (1-透视距离因子)
PROX_W_AREA = float(os.environ.get("PROX_W_AREA", "0.35"))
PROX_W_Y = float(os.environ.get("PROX_W_Y", "0.40"))
PROX_W_D = float(os.environ.get("PROX_W_D", "0.25"))
# ROI 警戒区：相对帧宽高的归一化矩形 x1,y1,x2,y2（脚点落在区内才告警/识别）
# 默认几乎全图；例如 "0.15,0.35,0.85,1.0" 表示画面下方门前区域
_ROI_RAW = os.environ.get("ALERT_ROI_NORM", "0.0,0.25,1.0,1.0").strip()
USE_BYTETRACK = os.environ.get("USE_BYTETRACK", "1").strip() in ("1", "true", "yes")
# 人脸质量：最小边长(px)、Laplacian 清晰度下限、姿态对称度上限（越小越正脸）
FACE_MIN_SIDE = int(os.environ.get("FACE_MIN_SIDE", "48"))
FACE_MIN_SHARPNESS = float(os.environ.get("FACE_MIN_SHARPNESS", "35.0"))
FACE_MAX_YAW_ASYM = float(os.environ.get("FACE_MAX_YAW_ASYM", "0.28"))
# track 投票窗口长度；授权锁定后保持身份
TRACK_VOTE_WINDOW = int(os.environ.get("TRACK_VOTE_WINDOW", "5"))
TRACK_LOCK_AUTH = os.environ.get("TRACK_LOCK_AUTH", "1").strip() in ("1", "true", "yes")
# 人脸比对最小间隔（秒）
FACE_CHECK_INTERVAL = float(os.environ.get("FACE_CHECK_INTERVAL", "0.12"))
# 识别结果缓存时长（秒）：命中后复用
FACE_CACHE_TTL = float(os.environ.get("FACE_CACHE_TTL", "5.0"))
# 人脸 ROI 最长边：与底库同路径编码；240 在准度与速度间折中
FACE_ROI_MAX_SIDE = int(os.environ.get("FACE_ROI_MAX_SIDE", "240"))
# 空间缓存容差（像素）
FACE_CACHE_POS_TOL = float(os.environ.get("FACE_CACHE_POS_TOL", "160"))
# 是否回退 dlib HOG（慢）；默认关闭，优先 OpenCV YuNet
FACE_USE_HOG_FALLBACK = os.environ.get("FACE_USE_HOG_FALLBACK", "0").strip() in (
    "1", "true", "yes",
)
YUNET_MODEL_PATH = os.environ.get(
    "YUNET_MODEL_PATH",
    os.path.join("models", "face_detection_yunet_2023mar.onnx"),
)
SFACE_MODEL_PATH = os.environ.get(
    "SFACE_MODEL_PATH",
    os.path.join("models", "face_recognition_sface_2021dec.onnx"),
)
# SFace 余弦相似度：>= 授权；<= 明确陌生人；中间为「识别中」不告警
SFACE_COSINE_THRESHOLD = float(os.environ.get("SFACE_COSINE_THRESHOLD", "0.363"))
SFACE_REJECT_THRESHOLD = float(os.environ.get("SFACE_REJECT_THRESHOLD", "0.28"))
# 高置信授权可立刻通行（无需多帧）
SFACE_STRONG_AUTH = float(os.environ.get("SFACE_STRONG_AUTH", "0.45"))
# dlib：距离越小越像；超过 REJECT 才算明确陌生人
FACE_REJECT_DISTANCE = float(os.environ.get("FACE_REJECT_DISTANCE", "0.70"))
# 多帧确认：抑制走近时侧脸误报未授权
UNAUTH_CONFIRM_FRAMES = int(os.environ.get("UNAUTH_CONFIRM_FRAMES", "3"))
AUTH_CONFIRM_FRAMES = int(os.environ.get("AUTH_CONFIRM_FRAMES", "2"))

# ================= 性能优化项 =================
# GPU 下 YOLO 半精度推理（默认关闭以避免旧版 ultralytics 每帧打印 half 弃用警告；可设 YOLO_HALF=1 开启）
YOLO_HALF = os.environ.get("YOLO_HALF", "0").strip() in ("1", "true", "yes")
# 启动预热：避免第一个行人出现时首帧卡顿
MODEL_WARMUP = os.environ.get("MODEL_WARMUP", "1").strip() in ("1", "true", "yes")
# 人脸识别并发数（多人同框 / 尾随场景下同时识别前 N 个目标）
FACE_MAX_WORKERS = max(1, int(os.environ.get("FACE_MAX_WORKERS", "2")))
# 检测框 EMA 平滑系数（0 关闭；越大越跟手，越小越平稳）
BOX_EMA_ALPHA = float(os.environ.get("BOX_EMA_ALPHA", "0.6"))
# 底库照片 YuNet 检测前的最大边长（证件照 / 大图先缩放）
BANK_DETECT_MAX_SIDE = int(os.environ.get("BANK_DETECT_MAX_SIDE", "640"))

# 复用 TCP 连接（Keep-Alive），心跳与告警上报不再每次三次握手
_http = requests.Session()
_http.mount("http://", HTTPAdapter(pool_connections=4, pool_maxsize=8))
_http.mount("https://", HTTPAdapter(pool_connections=4, pool_maxsize=8))

# 实时遥测（/health 返回，供管理端绘制真实 FPS / 推理耗时）
_telemetry_lock = threading.Lock()
_telemetry = {
    "fps": 0.0,
    "yolo_ms": 0.0,
    "face_ms": 0.0,
    "persons": 0,
    "device": "",
    "engine": "",
    "half": False,
    "face_bank": 0,
    "low_light": False,
    "updated_at": 0.0,
}


def update_telemetry(**kwargs):
    with _telemetry_lock:
        _telemetry.update(kwargs)
        _telemetry["updated_at"] = time.time()


def _ema(prev, value, alpha=0.3):
    """遥测数值指数平滑，曲线不抖。"""
    if not prev:
        return float(value)
    return float(prev) * (1.0 - alpha) + float(value) * alpha


# OpenCV DNN 模型非线程安全：每个线程持有独立的 YuNet / SFace 实例
_model_tls = threading.local()

# sface | dlib；启动时按模型可用性自动选择
FACE_ENGINE = "dlib"

AUTH_STATUS_AUTHORIZED = "AUTHORIZED"
AUTH_STATUS_UNAUTHORIZED = "UNAUTHORIZED"
UNAUTHORIZED_DISPLAY_NAME = "未授权人员/陌生人"

# 白名单原子引用（热加载时整表替换，禁止 clear+extend 竞态）
_face_bank_lock = threading.Lock()
_face_bank = {"encodings": np.zeros((0, 0), dtype=np.float32), "names": []}

# ByteTrack 轨迹元数据：track_id -> 首次出现/滞留/身份投票
_track_lock = threading.Lock()
_track_meta = {}

# ================= 时间窗防抖（存储与算力流控） =================
COOL_DOWN_INTERVAL = 10  # 秒：未授权告警冷却（可被心跳热更新）
PASSAGE_LOG_INTERVAL = 10  # 秒：授权通行日志节流
last_alert_time = 0.0
last_passage_log_time = 0.0
_alert_cooldown = {}

# 估算距离 D_est（无标定，系数可调；保留 proximity 作为告警门控）
DIST_K1 = float(os.environ.get("DIST_K1", "1.15"))
DIST_K2 = float(os.environ.get("DIST_K2", "2.40"))
DIST_DANGER_M = float(os.environ.get("DIST_DANGER_M", "1.5"))
DIST_WARNING_M = float(os.environ.get("DIST_WARNING_M", "3.0"))
TRACK_HISTORY_LEN = 30
LOITER_SECONDS = float(os.environ.get("LOITER_SECONDS", "5"))
TAILGATE_ENABLE = os.environ.get("TAILGATE_ENABLE", "1").strip() in ("1", "true", "yes")
TAILGATE_CLOSE_PX = float(os.environ.get("TAILGATE_CLOSE_PX", "180"))
CLAHE_LUMINANCE = float(os.environ.get("CLAHE_LUMINANCE", "70"))
_ROI_POLY_RAW = os.environ.get("ALERT_ROI_POLYGON", "").strip()

ALERT_TYPE_INTRUSION = "INTRUSION"
ALERT_TYPE_TAILGATING = "TAILGATING"
ALERT_TYPE_LOITERING = "LOITERING"

OFFLINE_CACHE_DIR = os.environ.get(
    "OFFLINE_CACHE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "offline_cache")
)
OFFLINE_MAX_ITEMS = int(os.environ.get("OFFLINE_MAX_ITEMS", "100"))
OFFLINE_MAX_BYTES = int(os.environ.get("OFFLINE_MAX_BYTES", str(50 * 1024 * 1024)))

_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
_low_light = {"active": False, "checked_at": 0.0, "mean": 255.0}
_offline_lock = threading.Lock()


def _parse_roi_norm(raw):
    try:
        parts = [float(x.strip()) for x in raw.split(",")]
        if len(parts) != 4:
            raise ValueError("need 4 floats")
        x1, y1, x2, y2 = parts
        x1, y1 = max(0.0, min(1.0, x1)), max(0.0, min(1.0, y1))
        x2, y2 = max(0.0, min(1.0, x2)), max(0.0, min(1.0, y2))
        if x2 <= x1 or y2 <= y1:
            raise ValueError("invalid box")
        return (x1, y1, x2, y2)
    except Exception:
        return (0.0, 0.25, 1.0, 1.0)


ALERT_ROI_NORM = _parse_roi_norm(_ROI_RAW)


def _parse_roi_polygon(raw):
    """归一化多边形 'x,y;x,y;...'，至少 3 点；否则返回 None，回退矩形 ROI。"""
    if not raw:
        return None
    pts = []
    for part in raw.split(";"):
        xy = part.split(",")
        if len(xy) != 2:
            continue
        try:
            pts.append((float(xy[0].strip()), float(xy[1].strip())))
        except ValueError:
            continue
    return pts if len(pts) >= 3 else None


ALERT_ROI_POLYGON = _parse_roi_polygon(_ROI_POLY_RAW)


def _build_bank_matrix(encodings):
    """
    白名单特征 → 连续 float32 矩阵。
    SFace 预先 L2 归一化，比对时只需一次矩阵乘 known @ vec 即得余弦相似度。
    """
    if encodings is None or len(encodings) == 0:
        return np.zeros((0, 0), dtype=np.float32)
    mat = np.ascontiguousarray(np.asarray(encodings, dtype=np.float32).reshape(len(encodings), -1))
    if FACE_ENGINE == "sface":
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        mat = mat / np.maximum(norms, 1e-8)
    return mat


def get_face_bank():
    """返回当前白名单快照 (matrix, names)；引用在锁内读取，替换为原子操作。"""
    with _face_bank_lock:
        return _face_bank["encodings"], _face_bank["names"]


def set_face_bank(encodings, names):
    """在锁外构建新矩阵，再原子替换引用，避免热加载瞬间后台读到空表。"""
    mat = _build_bank_matrix(encodings)
    new_names = list(names)
    with _face_bank_lock:
        _face_bank["encodings"] = mat
        _face_bank["names"] = new_names
    update_telemetry(face_bank=len(set(new_names)))


def compute_proximity(x1, y1, x2, y2, frame_h, frame_w):
    """
    综合接近度：
      area_ratio = Area(bbox)/Area(frame)
      y_norm     = y2 / Y_max          （脚点越靠下越大）
      d_factor    = (Y_max - y2)/Y_max （透视距离因子，越小越近）
      proximity  = w_a*area + w_y*y_norm + w_d*(1-d_factor)
    返回: proximity, area_ratio, d_factor, y_norm, in_roi
    """
    fh = float(max(1, frame_h))
    fw = float(max(1, frame_w))
    bb_area = max(0.0, float(x2 - x1) * float(y2 - y1))
    area_ratio = bb_area / (fh * fw + 1e-5)
    y_norm = float(y2) / (fh + 1e-5)
    d_factor = (fh - float(y2)) / (fh + 1e-5)
    proximity = (
        PROX_W_AREA * area_ratio
        + PROX_W_Y * y_norm
        + PROX_W_D * (1.0 - d_factor)
    )
    # 脚点是否落在 ROI 警戒区（多边形优先，否则矩形）
    foot_x = (float(x1) + float(x2)) * 0.5 / (fw + 1e-5)
    foot_y = float(y2) / (fh + 1e-5)
    in_roi = _foot_in_roi(foot_x, foot_y, fw, fh)
    return float(proximity), float(area_ratio), float(d_factor), float(y_norm), bool(in_roi)


def _foot_in_roi(foot_x_norm, foot_y_norm, frame_w, frame_h):
    if ALERT_ROI_POLYGON:
        poly = np.array(
            [[p[0] * frame_w, p[1] * frame_h] for p in ALERT_ROI_POLYGON],
            dtype=np.float32,
        )
        px = float(foot_x_norm) * float(frame_w)
        py = float(foot_y_norm) * float(frame_h)
        return cv2.pointPolygonTest(poly, (px, py), False) >= 0
    rx1, ry1, rx2, ry2 = ALERT_ROI_NORM
    return (rx1 <= foot_x_norm <= rx2) and (ry1 <= foot_y_norm <= ry2)


def estimate_distance_m(y1, y2, frame_h):
    """
    无标定估算距离（米）。
    d_factor = (Ymax - y2) / (h + eps)
    D_est = K1 * ln(1 + d_factor) + K2 * ((Ymax - y2) / Ymax)^2
    """
    fh = float(max(1, frame_h))
    h_box = max(1.0, float(y2) - float(y1))
    d_factor_h = (fh - float(y2)) / (h_box + 1e-5)
    y_term = max(0.0, (fh - float(y2)) / fh)
    d_est = DIST_K1 * math.log(1.0 + max(0.0, d_factor_h)) + DIST_K2 * (y_term ** 2)
    return float(max(0.05, d_est)), float(d_factor_h)


def distance_band(d_est):
    if d_est <= DIST_DANGER_M:
        return "DANGER"
    if d_est <= DIST_WARNING_M:
        return "WARNING"
    return "NORMAL"


def _motion_from_history(hist):
    """脚点序列：靠近 / 远离 / 横向路过。"""
    if not hist or len(hist) < 6:
        return "Unknown"
    x0, y0, d0, _t0 = hist[0]
    x1, y1, d1, _t1 = hist[-1]
    dy = y1 - y0
    dx = abs(x1 - x0)
    if d1 + 0.12 < d0 and dy > 4:
        return "Approaching"
    if d1 > d0 + 0.12:
        if dx > 28:
            return "Passing"
        return "Leaving"
    if dx > 36 and abs(dy) < 18:
        return "Passing"
    return "Unknown"


def _update_track_meta(track_id, now, *, foot_xy=None, d_est=None, in_roi=False):
    """维护轨迹、ROI 滞留时长与最近 30 个脚点。"""
    if track_id is None:
        return 0.0, "Unknown"
    with _track_lock:
        meta = _track_meta.get(track_id)
        if meta is None:
            meta = {
                "first_seen": now,
                "last_seen": now,
                "votes": [],
                "locked": False,
                "locked_status": None,
                "locked_name": "",
                "face_distance": None,
                "face_similarity": None,
                "history": [],
                "motion": "Unknown",
                "quality_face": False,
                "roi_enter": None,
            }
            _track_meta[track_id] = meta
        else:
            meta["last_seen"] = now
        if foot_xy is not None:
            hist = meta.setdefault("history", [])
            hist.append((float(foot_xy[0]), float(foot_xy[1]), float(d_est or 0.0), now))
            if len(hist) > TRACK_HISTORY_LEN:
                del hist[:-TRACK_HISTORY_LEN]
            meta["motion"] = _motion_from_history(hist)
        if in_roi:
            if meta.get("roi_enter") is None:
                meta["roi_enter"] = now
            dwell = max(0.0, now - meta["roi_enter"])
        else:
            meta["roi_enter"] = None
            dwell = 0.0
        stale = [
            tid for tid, m in _track_meta.items()
            if now - m.get("last_seen", 0) > 30.0
        ]
        for tid in stale:
            _track_meta.pop(tid, None)
        if track_id not in _track_meta:
            return dwell, "Unknown"
        return dwell, _track_meta[track_id].get("motion", "Unknown")


def _mark_quality_face(track_id):
    if track_id is None:
        return
    with _track_lock:
        meta = _track_meta.get(track_id)
        if meta is not None:
            meta["quality_face"] = True


def _track_quality_face(track_id):
    if track_id is None:
        return False
    with _track_lock:
        meta = _track_meta.get(track_id)
        return bool(meta and meta.get("quality_face"))


def _track_apply_vote(track_id, result):
    """
    将单次识别结果写入 track 滑动窗口；授权可锁定。
    返回用于展示/上报的稳定状态 dict 或 None。
    """
    if track_id is None or not result or not result.get("face_found"):
        return None
    with _track_lock:
        meta = _track_meta.get(track_id)
        if meta is None:
            return None
        if result.get("face_found") and not result.get("quality_reject"):
            meta["quality_face"] = True
        if meta.get("locked") and TRACK_LOCK_AUTH:
            return {
                "auth_status": meta.get("locked_status"),
                "recognized_name": meta.get("locked_name", ""),
                "face_distance": meta.get("face_distance"),
                "face_similarity": meta.get("face_similarity"),
                "face_found": True,
                "from_track_lock": True,
            }
        # 质量拒绝帧：不进投票、不累加未授权
        if result.get("quality_reject"):
            return {
                "auth_status": None,
                "recognized_name": "",
                "face_distance": result.get("face_distance"),
                "face_similarity": result.get("face_similarity"),
                "face_found": True,
                "quality_reject": True,
            }
        status = result.get("auth_status")
        meta["votes"].append(
            {
                "auth_status": status,
                "recognized_name": result.get("recognized_name", ""),
                "face_distance": result.get("face_distance"),
                "face_similarity": result.get("face_similarity"),
            }
        )
        if len(meta["votes"]) > TRACK_VOTE_WINDOW:
            meta["votes"] = meta["votes"][-TRACK_VOTE_WINDOW:]
        votes = meta["votes"]
        auth_votes = [v for v in votes if v["auth_status"] == AUTH_STATUS_AUTHORIZED]
        unauth_votes = [v for v in votes if v["auth_status"] == AUTH_STATUS_UNAUTHORIZED]
        if auth_votes:
            best = max(
                auth_votes,
                key=lambda v: (v.get("face_similarity") is not None, v.get("face_similarity") or 0),
            )
            if TRACK_LOCK_AUTH and len(auth_votes) >= max(1, AUTH_CONFIRM_FRAMES):
                meta["locked"] = True
                meta["locked_status"] = AUTH_STATUS_AUTHORIZED
                meta["locked_name"] = best.get("recognized_name", "")
                meta["face_distance"] = best.get("face_distance")
                meta["face_similarity"] = best.get("face_similarity")
            return {
                "auth_status": AUTH_STATUS_AUTHORIZED,
                "recognized_name": best.get("recognized_name", ""),
                "face_distance": best.get("face_distance"),
                "face_similarity": best.get("face_similarity"),
                "face_found": True,
            }
        if len(unauth_votes) >= UNAUTH_CONFIRM_FRAMES:
            return {
                "auth_status": AUTH_STATUS_UNAUTHORIZED,
                "recognized_name": UNAUTHORIZED_DISPLAY_NAME,
                "face_distance": unauth_votes[-1].get("face_distance"),
                "face_similarity": unauth_votes[-1].get("face_similarity"),
                "face_found": True,
            }
        # 仍在投票中
        return {
            "auth_status": None,
            "recognized_name": "",
            "face_distance": result.get("face_distance"),
            "face_similarity": result.get("face_similarity"),
            "face_found": True,
        }


def _track_locked_identity(track_id):
    if track_id is None:
        return None
    with _track_lock:
        meta = _track_meta.get(track_id)
        if not meta or not meta.get("locked"):
            return None
        return {
            "auth_status": meta.get("locked_status"),
            "recognized_name": meta.get("locked_name", ""),
            "face_distance": meta.get("face_distance"),
            "face_similarity": meta.get("face_similarity"),
            "face_found": True,
            "from_track_lock": True,
            "from_confirmed_cache": True,
        }

# 人脸识别缓存 / 异步调度（线程间共享）
_face_cache_lock = threading.Lock()
_face_cache = {
    "cx": 0.0,
    "cy": 0.0,
    "ts": 0.0,
    "auth_status": None,
    "recognized_name": "",
    "face_distance": None,
    "face_similarity": None,
}
_face_job_lock = threading.Lock()
# inflight: 正在识别的目标键（track_id 或 "pos"）；last_submit: 每个目标上次提交时间
_face_job = {
    "inflight": set(),
    "last_submit": {},
}
# 人脸识别线程池：复用线程，避免每次识别都新建 OS 线程；支持多人并发识别
_face_executor = ThreadPoolExecutor(
    max_workers=FACE_MAX_WORKERS, thread_name_prefix="face"
)
# 告警 / 通行上报线程池
_upload_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="upload")
_last_noface_log = 0.0

# 多帧确认：按「新的识别结果」累计，禁止主循环同帧重复加分
_confirm_lock = threading.Lock()
_confirm_state = {
    "cx": 0.0,
    "cy": 0.0,
    "auth_streak": 0,
    "unauth_streak": 0,
    "last_sample_ts": 0.0,
}

# 未确认的原始比对结果（短 TTL，供多帧确认消费；不直接触发告警）
_RAW_FACE_TTL = 1.2
_raw_face_lock = threading.Lock()
_raw_face = {
    "cx": 0.0,
    "cy": 0.0,
    "ts": 0.0,
    "auth_status": None,
    "recognized_name": "",
    "face_distance": None,
    "face_similarity": None,
    "face_found": False,
}


# =====================================================================
#  人脸识别模块：预加载 128 维特征 + 触发式比对
# =====================================================================

def _imread_bgr(path):
    """支持中文路径的 BGR 读图（cv2.imread 在含中文路径时常失败）。"""
    try:
        data = np.fromfile(path, dtype=np.uint8)
        if data.size == 0:
            return None
        return cv2.imdecode(data, cv2.IMREAD_COLOR)
    except Exception:
        return cv2.imread(path)


def _resolve_face_engine():
    """优先 SFace（快），否则 dlib face_recognition。"""
    global FACE_ENGINE
    if _get_sface_recognizer() is not None:
        FACE_ENGINE = "sface"
        return FACE_ENGINE
    try:
        import face_recognition  # noqa: F401

        FACE_ENGINE = "dlib"
    except ImportError:
        FACE_ENGINE = "none"
    return FACE_ENGINE


def _resize_max_side(bgr, max_side):
    h, w = bgr.shape[:2]
    side = max(h, w)
    if max_side <= 0 or side <= max_side:
        return bgr
    scale = max_side / float(side)
    return cv2.resize(
        bgr, (max(1, int(w * scale)), max(1, int(h * scale))),
        interpolation=cv2.INTER_AREA,
    )


def _encoding_from_bgr(bgr, face_recognition=None):
    """
    底库照片 → 特征向量。

    底库一般是单人证件照 / 大头照：优先在「整张图」上跑 YuNet。
    旧实现先套用实时流的「人体框上 60%」裁剪，大头照会被裁掉嘴和下巴，
    导致关键点偏移、同人相似度偏低。整图检测失败时才回退头肩 ROI 裁剪
    （适用于上传的是全身照的情况）。SFace 会按 5 点关键点 alignCrop
    到 112x112，因此与实时流的特征空间一致。
    """
    if bgr is None or bgr.size == 0:
        return None
    full = _resize_max_side(bgr, BANK_DETECT_MAX_SIDE)
    h, w = full.shape[:2]

    if FACE_ENGINE == "sface" or _get_sface_recognizer() is not None:
        feat = _sface_feature_from_bgr(full)
        if feat is None:
            roi = _crop_face_roi(full, 0, 0, w, h)
            if roi is not None:
                feat = _sface_feature_from_bgr(roi)
        return feat

    if face_recognition is None:
        try:
            import face_recognition as face_recognition
        except ImportError:
            return None
    roi = full
    locs = _yunet_face_locations(full)
    if not locs:
        crop = _crop_face_roi(full, 0, 0, w, h)
        if crop is not None:
            locs = _yunet_face_locations(crop)
            if locs:
                roi = crop
    if not locs:
        return None
    rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
    return _encode_face_crop(rgb, locs[0], face_recognition)


def load_authorized_faces(folder=None):
    """
    扫描 authorized_faces/：每人原图 + 水平翻转双模板特征。
    比对时对同人多个模板取最大相似度。
    """
    if folder is None:
        folder = AUTHORIZED_FACES_DIR

    known_encodings = []
    known_names = []

    if not os.path.isdir(folder):
        print(f"[WARN] 授权人脸目录不存在: {folder}，人脸对比功能将不可用")
        return known_encodings, known_names

    engine = _resolve_face_engine()
    face_recognition = None
    if engine == "none":
        print(
            "[WARN] 未找到 SFace 模型且 face_recognition 未安装，人脸对比不可用。"
        )
        return known_encodings, known_names
    if engine == "dlib":
        import face_recognition as face_recognition
    print(f"[INFO] 人脸特征引擎: {engine}")

    valid_exts = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
    files = sorted(
        f for f in os.listdir(folder)
        if f.lower().endswith(valid_exts) and not f.startswith(".")
    )

    if not files:
        print(f"[WARN] 授权人脸目录 {folder} 中没有图片，人脸对比将不可用")
        return known_encodings, known_names

    print(f"[INFO] 正在加载授权人脸库（共 {len(files)} 张照片，含水平翻转模板）...")
    people = 0
    for file in files:
        filepath = os.path.join(folder, file)
        try:
            bgr = _imread_bgr(filepath)
            if bgr is None:
                print(f"  ✗ 无法读取: {file}")
                continue
            name = os.path.splitext(file)[0]
            templates = []
            for tag, img in (("原图", bgr), ("翻转", cv2.flip(bgr, 1))):
                encoding = _encoding_from_bgr(img, face_recognition)
                if encoding is None and engine == "dlib" and face_recognition is not None:
                    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    encs = face_recognition.face_encodings(rgb)
                    encoding = encs[0] if encs else None
                if encoding is not None:
                    templates.append(encoding)
            if templates:
                for enc in templates:
                    known_encodings.append(enc)
                    known_names.append(name)
                people += 1
                print(f"  ✓ 已加载: {name}（{len(templates)} 模板）")
            else:
                print(f"  ✗ 未检测到人脸: {file}（请更换清晰正脸照片）")
        except Exception as exc:
            print(f"  ✗ 加载失败: {file} -> {exc}")

    print(
        f"[INFO] 授权人脸库加载完成，共 {people} 人 / {len(known_encodings)} 条模板特征"
    )
    return known_encodings, known_names


def maybe_hot_reload_faces(state):
    """
    检测 authorized_faces/.reload，构建新白名单后原子替换全局引用。
    禁止对旧 list 执行 clear()+extend()，避免后台线程读到空表。
    """
    reload_flag = os.path.join(AUTHORIZED_FACES_DIR, ".reload")
    if not os.path.isfile(reload_flag):
        return
    try:
        mtime = os.path.getmtime(reload_flag)
        if mtime <= state.get("last_reload_mtime", 0):
            return
        enc, names = load_authorized_faces()
        set_face_bank(enc, names)
        state["last_reload_mtime"] = mtime
        uniq = sorted(set(names))
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[INFO] 人脸库热加载完成，当前授权人员 {len(uniq)} 人: {uniq}"
        )
    except Exception as exc:
        print(f"[WARN] 人脸库热加载失败: {exc}")


def _bbox_center(x1, y1, x2, y2):
    return (x1 + x2) * 0.5, (y1 + y2) * 0.5


def _cache_hit(cx, cy, now):
    """目标中心接近且未过期时复用上次识别结果。"""
    with _face_cache_lock:
        if _face_cache["auth_status"] is None:
            return None
        if now - _face_cache["ts"] > FACE_CACHE_TTL:
            return None
        dx = cx - _face_cache["cx"]
        dy = cy - _face_cache["cy"]
        tol = FACE_CACHE_POS_TOL
        if (dx * dx + dy * dy) > (tol * tol):
            return None
        return {
            "auth_status": _face_cache["auth_status"],
            "recognized_name": _face_cache["recognized_name"],
            "face_distance": _face_cache["face_distance"],
            "face_similarity": _face_cache.get("face_similarity"),
        }


def _update_face_cache(cx, cy, result, *, allow_unauth=False):
    """
    缓存识别结论。
    - 已授权：始终缓存
    - 未授权：仅多帧确认后（allow_unauth=True）才缓存，避免侧脸误报锁死 5s
    - 识别中 / 未检出：不缓存
    """
    if not result or not result.get("face_found"):
        return
    auth = result.get("auth_status")
    if auth == AUTH_STATUS_AUTHORIZED:
        pass
    elif auth == AUTH_STATUS_UNAUTHORIZED and allow_unauth:
        pass
    else:
        return
    with _face_cache_lock:
        _face_cache["cx"] = cx
        _face_cache["cy"] = cy
        _face_cache["ts"] = time.time()
        _face_cache["auth_status"] = auth
        _face_cache["recognized_name"] = result.get("recognized_name", "")
        _face_cache["face_distance"] = result.get("face_distance")
        _face_cache["face_similarity"] = result.get("face_similarity")


def _update_raw_face_result(cx, cy, result, track_id=None, note=True):
    """写入短时原始比对结果，并按新样本累计确认 streak（有 track_id 时按轨迹独立累计）。"""
    if not result or not result.get("face_found"):
        return
    ts = float(result.get("result_ts") or time.time())
    result = dict(result)
    result["result_ts"] = ts
    with _raw_face_lock:
        _raw_face["cx"] = cx
        _raw_face["cy"] = cy
        _raw_face["ts"] = ts
        _raw_face["auth_status"] = result.get("auth_status")
        _raw_face["recognized_name"] = result.get("recognized_name", "")
        _raw_face["face_distance"] = result.get("face_distance")
        _raw_face["face_similarity"] = result.get("face_similarity")
        _raw_face["face_found"] = True
    if track_id is not None:
        with _track_lock:
            meta = _track_meta.get(track_id)
            if meta is not None:
                meta["raw"] = {
                    "auth_status": result.get("auth_status"),
                    "recognized_name": result.get("recognized_name", ""),
                    "face_distance": result.get("face_distance"),
                    "face_similarity": result.get("face_similarity"),
                    "ts": ts,
                }
    if note:
        _note_face_sample(cx, cy, result, track_id=track_id)


def _track_raw_hit(track_id, now):
    """按轨迹取最近一次原始比对结果（多人同框时不会被另一个人覆盖）。"""
    if track_id is None:
        return None
    with _track_lock:
        meta = _track_meta.get(track_id)
        raw = meta.get("raw") if meta else None
        if not raw or now - raw.get("ts", 0.0) > _RAW_FACE_TTL:
            return None
        return {
            "auth_status": raw.get("auth_status"),
            "recognized_name": raw.get("recognized_name", ""),
            "face_distance": raw.get("face_distance"),
            "face_similarity": raw.get("face_similarity"),
            "from_confirmed_cache": False,
        }


def _raw_face_hit(cx, cy, now):
    with _raw_face_lock:
        if not _raw_face.get("face_found"):
            return None
        if now - _raw_face["ts"] > _RAW_FACE_TTL:
            return None
        dx = cx - _raw_face["cx"]
        dy = cy - _raw_face["cy"]
        tol = FACE_CACHE_POS_TOL
        if (dx * dx + dy * dy) > (tol * tol):
            return None
        return {
            "auth_status": _raw_face["auth_status"],
            "recognized_name": _raw_face["recognized_name"],
            "face_distance": _raw_face["face_distance"],
            "face_similarity": _raw_face.get("face_similarity"),
            "from_confirmed_cache": False,
        }


def _apply_cache_to_detections(detections):
    """主循环立刻套用后台识别结果 / track 锁定身份，不必等下一轮 YOLO。"""
    if not detections:
        return
    now = time.time()
    for det in detections:
        prox = det.get("proximity_ratio", det.get("area_ratio", 0))
        if prox < PROXIMITY_ALERT_THRESHOLD or not det.get("in_roi", True):
            continue
        locked = _track_locked_identity(det.get("track_id"))
        if locked is not None:
            _apply_identity_to_det(det, locked)
            det["danger_level"] = 0
            continue
        if det.get("auth_status") in (AUTH_STATUS_AUTHORIZED, AUTH_STATUS_UNAUTHORIZED):
            continue
        tid = det.get("track_id")
        if tid is not None:
            # 有轨迹：只信任本轨迹的结果，避免把旁边授权人员的身份「借」给陌生人
            cached = _track_raw_hit(tid, now)
            from_confirmed = False
        else:
            cx, cy = _bbox_center(det["x1"], det["y1"], det["x2"], det["y2"])
            cached = _cache_hit(cx, cy, now)
            from_confirmed = cached is not None
            if cached is None:
                cached = _raw_face_hit(cx, cy, now)
                from_confirmed = False
        if cached is None:
            continue
        det["auth_status"] = cached["auth_status"]
        det["recognized_name"] = cached["recognized_name"]
        det["face_distance"] = cached["face_distance"]
        det["face_similarity"] = cached.get("face_similarity")
        det["from_confirmed_cache"] = from_confirmed
        if det["auth_status"] == AUTH_STATUS_AUTHORIZED:
            det["danger_level"] = 0
        elif det["auth_status"] == AUTH_STATUS_UNAUTHORIZED:
            det["danger_level"] = 3 if prox >= 0.45 else 2


def _confirm_same_target(cx, cy):
    """目标位置跳变则清零 streak。"""
    dx = cx - _confirm_state["cx"]
    dy = cy - _confirm_state["cy"]
    tol = FACE_CACHE_POS_TOL
    if (dx * dx + dy * dy) > (tol * tol):
        _confirm_state["auth_streak"] = 0
        _confirm_state["unauth_streak"] = 0
        _confirm_state["last_sample_ts"] = 0.0
    _confirm_state["cx"] = cx
    _confirm_state["cy"] = cy


def _apply_streak_sample(state, result, sample_ts):
    """对一个 streak 状态（全局或某条轨迹）累计一次新样本。"""
    if sample_ts <= state.get("last_sample_ts", 0.0):
        return
    state["last_sample_ts"] = sample_ts
    if result.get("quality_reject"):
        state["unauth_streak"] = 0
        return
    auth = result.get("auth_status")
    if auth == AUTH_STATUS_AUTHORIZED:
        sim = result.get("face_similarity")
        strong = (
            FACE_ENGINE == "sface"
            and isinstance(sim, (int, float))
            and float(sim) >= SFACE_STRONG_AUTH
        )
        state["unauth_streak"] = 0
        if strong:
            state["auth_streak"] = AUTH_CONFIRM_FRAMES
        else:
            state["auth_streak"] = state.get("auth_streak", 0) + 1
    elif auth == AUTH_STATUS_UNAUTHORIZED:
        state["auth_streak"] = 0
        state["unauth_streak"] = state.get("unauth_streak", 0) + 1
    else:
        # 识别中：打断累计
        state["unauth_streak"] = 0
        state["auth_streak"] = 0


def _note_face_sample(cx, cy, result, track_id=None):
    """
    仅在每次新的识别结果上累计 streak（由人脸线程调用）。
    禁止主循环对同一结果反复 +1。
    质量拒绝帧：打断未授权累计，不记为陌生人。
    有 track_id 时按轨迹独立累计，避免多人并发识别时样本互相串扰。
    """
    if not result or not result.get("face_found"):
        return
    sample_ts = float(result.get("result_ts") or time.time())
    if track_id is not None:
        with _track_lock:
            meta = _track_meta.get(track_id)
            if meta is not None:
                _apply_streak_sample(meta.setdefault("streak", {}), result, sample_ts)
                return
    with _confirm_lock:
        _confirm_same_target(cx, cy)
        _apply_streak_sample(_confirm_state, result, sample_ts)


def _get_streaks(track_id):
    """返回 (auth_streak, unauth_streak)；有轨迹用轨迹的，否则用全局位置版。"""
    if track_id is not None:
        with _track_lock:
            meta = _track_meta.get(track_id)
            if meta is not None:
                st = meta.get("streak") or {}
                return st.get("auth_streak", 0), st.get("unauth_streak", 0)
    with _confirm_lock:
        return _confirm_state["auth_streak"], _confirm_state["unauth_streak"]


def stabilize_auth_for_action(det):
    """
    根据已累计的识别样本决定是否可上报。
    未确认时把 det 显示为识别中（auth_status=None）。
    """
    auth = det.get("auth_status")
    cx, cy = _bbox_center(det["x1"], det["y1"], det["x2"], det["y2"])

    locked = _track_locked_identity(det.get("track_id"))
    if locked is not None:
        _apply_identity_to_det(det, locked)
        return locked.get("auth_status")

    # 已写入长期缓存的结论：直接信任（已授权 / 已确认未授权）
    if det.get("from_confirmed_cache") or det.get("from_track_lock"):
        return auth

    if auth == AUTH_STATUS_AUTHORIZED:
        sim = det.get("face_similarity")
        strong = (
            FACE_ENGINE == "sface"
            and isinstance(sim, (int, float))
            and float(sim) >= SFACE_STRONG_AUTH
        )
        with_track = det.get("track_id")
        auth_streak, _ = _get_streaks(with_track)
        if auth_streak >= AUTH_CONFIRM_FRAMES or strong:
            _update_face_cache(
                cx,
                cy,
                {
                    "face_found": True,
                    "auth_status": AUTH_STATUS_AUTHORIZED,
                    "recognized_name": det.get("recognized_name", ""),
                    "face_distance": det.get("face_distance"),
                    "face_similarity": det.get("face_similarity"),
                },
            )
            return AUTH_STATUS_AUTHORIZED
        det["auth_status"] = None
        return None

    if auth == AUTH_STATUS_UNAUTHORIZED:
        _, unauth_streak = _get_streaks(det.get("track_id"))
        if unauth_streak >= UNAUTH_CONFIRM_FRAMES:
            _update_face_cache(
                cx,
                cy,
                {
                    "face_found": True,
                    "auth_status": AUTH_STATUS_UNAUTHORIZED,
                    "recognized_name": det.get(
                        "recognized_name", UNAUTHORIZED_DISPLAY_NAME
                    ),
                    "face_distance": det.get("face_distance"),
                    "face_similarity": det.get("face_similarity"),
                },
                allow_unauth=True,
            )
            return AUTH_STATUS_UNAUTHORIZED
        det["auth_status"] = None
        det["recognized_name"] = ""
        return None

    return None


def _crop_face_roi(frame_bgr, x1, y1, x2, y2):
    """
    取人体框上半部分（头肩）并等比缩放到 FACE_ROI_MAX_SIDE 内。
    比整框做人脸更准、更快。
    """
    h, w = frame_bgr.shape[:2]
    x1c, y1c = max(0, int(x1)), max(0, int(y1))
    x2c, y2c = min(w, int(x2)), min(h, int(y2))
    box_h = y2c - y1c
    box_w = x2c - x1c
    if box_h < 40 or box_w < 30:
        return None

    # 上 60%：覆盖头肩，避免下巴被裁掉导致特征漂移
    y2_face = y1c + max(int(box_h * 0.60), 36)
    y2_face = min(y2_face, y2c)
    pad_x = int(box_w * 0.16)
    x1f, x2f = x1c + pad_x, x2c - pad_x
    if x2f - x1f < 24:
        x1f, x2f = x1c, x2c

    roi = frame_bgr[y1c:y2_face, x1f:x2f]
    if roi is None or roi.size == 0:
        return None
    roi = _enhance_face_roi(roi)

    rh, rw = roi.shape[:2]
    max_side = max(rh, rw)
    if max_side > FACE_ROI_MAX_SIDE:
        scale = FACE_ROI_MAX_SIDE / float(max_side)
        roi = cv2.resize(
            roi,
            (max(1, int(rw * scale)), max(1, int(rh * scale))),
            interpolation=cv2.INTER_AREA,
        )
    return roi


def _get_yunet_detector(input_w, input_h):
    """
    OpenCV YuNet 人脸检测器（比 dlib HOG 快一个数量级）。
    线程局部实例：多个人脸工作线程并发时互不干扰 setInputSize / forward。
    """
    if not os.path.isfile(YUNET_MODEL_PATH):
        return None
    detector = getattr(_model_tls, "yunet", None)
    if detector is None:
        try:
            detector = cv2.FaceDetectorYN.create(
                YUNET_MODEL_PATH,
                "",
                (input_w, input_h),
                0.65,  # score threshold
                0.3,   # nms
                5000,
            )
            _model_tls.yunet = detector
            _model_tls.yunet_size = (input_w, input_h)
            if not getattr(_get_yunet_detector, "_logged", False):
                _get_yunet_detector._logged = True
                print(f"[INFO] YuNet 人脸检测已加载: {YUNET_MODEL_PATH}")
        except Exception as exc:
            print(f"[WARN] YuNet 加载失败: {exc}")
            return None
    elif getattr(_model_tls, "yunet_size", None) != (input_w, input_h):
        try:
            detector.setInputSize((input_w, input_h))
            _model_tls.yunet_size = (input_w, input_h)
        except Exception as exc:
            print(f"[WARN] YuNet setInputSize 失败: {exc}")
    return detector


def _get_sface_recognizer():
    """OpenCV SFace 特征提取（比 dlib 编码快数倍）；线程局部实例。"""
    recognizer = getattr(_model_tls, "sface", None)
    if recognizer is not None:
        return recognizer
    if not os.path.isfile(SFACE_MODEL_PATH):
        return None
    try:
        recognizer = cv2.FaceRecognizerSF.create(SFACE_MODEL_PATH, "")
        _model_tls.sface = recognizer
        if not getattr(_get_sface_recognizer, "_logged", False):
            _get_sface_recognizer._logged = True
            print(f"[INFO] SFace 人脸识别已加载: {SFACE_MODEL_PATH}")
    except Exception as exc:
        print(f"[WARN] SFace 加载失败: {exc}")
        return None
    return recognizer


def _yunet_best_face_row(bgr_roi):
    """YuNet 最高置信度人脸行（含关键点，供 SFace alignCrop）。"""
    h, w = bgr_roi.shape[:2]
    if h < 24 or w < 24:
        return None
    detector = _get_yunet_detector(w, h)
    if detector is None:
        return None
    try:
        _, faces = detector.detect(bgr_roi)
    except Exception:
        return None
    if faces is None or len(faces) == 0:
        return None
    return max(faces, key=lambda f: float(f[-1]))


def _assess_face_quality(bgr_roi, face_row):
    """
    YuNet 5 点姿态对称度 + 最小尺寸 + Laplacian 清晰度。
    返回 (ok, reason)；不通过时调用方保持「识别中」，不累加未授权。
    face_row: x,y,w,h, re,le,nose,rcm,lcm, score
    """
    if face_row is None or bgr_roi is None or bgr_roi.size == 0:
        return False, "noface"
    x, y, fw, fh = map(float, face_row[:4])
    if min(fw, fh) < float(FACE_MIN_SIDE):
        return False, "small"
    try:
        re_x, re_y = float(face_row[4]), float(face_row[5])
        le_x, le_y = float(face_row[6]), float(face_row[7])
        nt_x, nt_y = float(face_row[8]), float(face_row[9])
        rcm_x = float(face_row[10])
        lcm_x = float(face_row[12])
    except (IndexError, TypeError, ValueError):
        return False, "landmarks"
    eye_span = abs(le_x - re_x) + 1e-5
    mid_eye_x = (le_x + re_x) * 0.5
    yaw_asym = abs(nt_x - mid_eye_x) / eye_span
    mouth_span = abs(lcm_x - rcm_x) + 1e-5
    mid_mouth_x = (lcm_x + rcm_x) * 0.5
    mouth_asym = abs(nt_x - mid_mouth_x) / mouth_span
    # 双眼高度差也反映侧脸/倾斜
    eye_roll = abs(le_y - re_y) / (fh + 1e-5)
    asym = max(yaw_asym, 0.6 * mouth_asym, eye_roll)
    if asym > FACE_MAX_YAW_ASYM:
        return False, "pose"
    h, w = bgr_roi.shape[:2]
    x1, y1 = max(0, int(x)), max(0, int(y))
    x2, y2 = min(w, int(x + fw)), min(h, int(y + fh))
    if x2 - x1 < 12 or y2 - y1 < 12:
        return False, "small"
    crop = bgr_roi[y1:y2, x1:x2]
    try:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        sharp = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    except Exception:
        return False, "blur"
    if sharp < FACE_MIN_SHARPNESS:
        return False, "blur"
    return True, "ok"


def _yunet_face_locations(bgr_roi):
    """
    YuNet 定位人脸，通常数毫秒~几十毫秒。
    返回 face_recognition 格式: (top, right, bottom, left)
    """
    best = _yunet_best_face_row(bgr_roi)
    if best is None:
        return []
    h, w = bgr_roi.shape[:2]
    x, y, fw, fh = map(float, best[:4])
    pad = 0.10 * max(fw, fh)
    top = max(0, int(y - pad))
    left = max(0, int(x - pad))
    bottom = min(h, int(y + fh + pad))
    right = min(w, int(x + fw + pad))
    if bottom - top < 20 or right - left < 20:
        return []
    return [(top, right, bottom, left)]


def _sface_feature_from_bgr(bgr_roi, *, require_quality=False):
    """
    YuNet 定位 + SFace 对齐提特征。
    require_quality=True 时侧脸/模糊返回 (None, quality_reject_dict)。
    底库加载时 require_quality=False，仅返回特征向量或 None。
    """
    recognizer = _get_sface_recognizer()
    if recognizer is None or bgr_roi is None or bgr_roi.size == 0:
        return (None, None) if require_quality else None
    face_row = _yunet_best_face_row(bgr_roi)
    if face_row is None:
        return (None, None) if require_quality else None
    if require_quality:
        ok, reason = _assess_face_quality(bgr_roi, face_row)
        if not ok:
            return None, {
                "auth_status": None,
                "recognized_name": "",
                "face_distance": None,
                "face_similarity": None,
                "face_found": True,
                "quality_reject": True,
                "quality_reason": reason,
            }
    try:
        aligned = recognizer.alignCrop(bgr_roi, face_row)
        if aligned is None or aligned.size == 0:
            return (None, None) if require_quality else None
        feat = recognizer.feature(aligned)
        vec = np.asarray(feat, dtype=np.float64).reshape(-1)
        return (vec, None) if require_quality else vec
    except Exception:
        return (None, None) if require_quality else None


def _match_encoding(encoding, known_encodings, known_names):
    """
    三档判定：
      - 已授权
      - 识别中（模糊区间，不上报）
      - 明确未授权
    """
    if FACE_ENGINE == "sface":
        # known 已在 set_face_bank 中 L2 归一化：一次矩阵乘即得全部余弦相似度
        known = known_encodings
        vec = np.asarray(encoding, dtype=np.float32).reshape(-1)
        vec = vec / max(float(np.linalg.norm(vec)), 1e-8)
        sims = known @ vec
        # 全局最大值 = 同人多模板（原图+翻转）取最大后再跨人取最大
        best_idx = int(np.argmax(sims))
        best_sim = float(sims[best_idx])
        best_name = known_names[best_idx]
        best_distance = 1.0 - best_sim
        if best_sim >= SFACE_COSINE_THRESHOLD:
            return {
                "auth_status": AUTH_STATUS_AUTHORIZED,
                "recognized_name": best_name,
                "face_distance": best_distance,
                "face_found": True,
                "face_similarity": best_sim,
            }
        if best_sim > SFACE_REJECT_THRESHOLD:
            return {
                "auth_status": None,
                "recognized_name": "",
                "face_distance": best_distance,
                "face_found": True,
                "face_similarity": best_sim,
            }
        return {
            "auth_status": AUTH_STATUS_UNAUTHORIZED,
            "recognized_name": UNAUTHORIZED_DISPLAY_NAME,
            "face_distance": best_distance,
            "face_found": True,
            "face_similarity": best_sim,
        }

    distances = face_distance_np(known_encodings, encoding)
    # 全局最小距离 = 同人多模板取最小后再跨人取最小
    best_idx = int(np.argmin(distances))
    best_distance = float(distances[best_idx])
    best_name = known_names[best_idx]
    if best_distance < FACE_DISTANCE_THRESHOLD:
        return {
            "auth_status": AUTH_STATUS_AUTHORIZED,
            "recognized_name": best_name,
            "face_distance": best_distance,
            "face_found": True,
            "face_similarity": None,
        }
    if best_distance < FACE_REJECT_DISTANCE:
        return {
            "auth_status": None,
            "recognized_name": "",
            "face_distance": best_distance,
            "face_found": True,
            "face_similarity": None,
        }
    return {
        "auth_status": AUTH_STATUS_UNAUTHORIZED,
        "recognized_name": UNAUTHORIZED_DISPLAY_NAME,
        "face_distance": best_distance,
        "face_found": True,
        "face_similarity": None,
    }


def face_distance_np(known_encodings, encoding):
    """本地欧氏距离，避免每次 import face_recognition.face_distance。"""
    return np.linalg.norm(
        np.asarray(known_encodings, dtype=np.float32)
        - np.asarray(encoding, dtype=np.float32).reshape(1, -1),
        axis=1,
    )


def _encode_face_crop(rgb_roi, location, face_recognition, max_side=150):
    """
    按 YuNet 脸框裁剪（带边距）后缩放到 max_side，再用相对坐标编码。
    比整 ROI 上跑 dlib 快；必须保留真实脸框，不能伪造全图框。
    location: (top, right, bottom, left)
    """
    top, right, bottom, left = location
    rh, rw = rgb_roi.shape[:2]
    fh0, fw0 = bottom - top, right - left
    if fh0 < 24 or fw0 < 24:
        return None
    # 给 shape predictor 留边，避免关键点贴边导致 compute_face_descriptor 失败
    pad = int(0.30 * max(fh0, fw0))
    t = max(0, top - pad)
    l = max(0, left - pad)
    b = min(rh, bottom + pad)
    r = min(rw, right + pad)
    face = np.ascontiguousarray(rgb_roi[t:b, l:r])
    if face.size == 0:
        return None

    rel_top = top - t
    rel_left = left - l
    rel_bottom = bottom - t
    rel_right = right - l

    fh, fw = face.shape[:2]
    side = max(fh, fw)
    if side > max_side:
        scale = max_side / float(side)
        face = cv2.resize(
            face,
            (max(1, int(fw * scale)), max(1, int(fh * scale))),
            interpolation=cv2.INTER_AREA,
        )
        face = np.ascontiguousarray(face, dtype=np.uint8)
        rel_top = int(rel_top * scale)
        rel_left = int(rel_left * scale)
        rel_bottom = int(rel_bottom * scale)
        rel_right = int(rel_right * scale)
        fh, fw = face.shape[:2]
    else:
        face = np.ascontiguousarray(face, dtype=np.uint8)

    # 夹紧到图像内，保证框有效
    rel_top = max(0, min(rel_top, fh - 2))
    rel_left = max(0, min(rel_left, fw - 2))
    rel_bottom = max(rel_top + 2, min(rel_bottom, fh))
    rel_right = max(rel_left + 2, min(rel_right, fw))
    loc = [(rel_top, rel_right, rel_bottom, rel_left)]
    try:
        encodings = face_recognition.face_encodings(
            face, known_face_locations=loc, num_jitters=0
        )
    except Exception:
        return None
    if encodings:
        return np.asarray(encodings[0], dtype=np.float64)
    return None


def recognize_face_in_roi(frame_bgr, x1, y1, x2, y2, known_encodings, known_names):
    """
    人体上半身 ROI → YuNet 质量过滤 → SFace（优先）或 dlib 编码比对。
    侧脸/模糊：quality_reject，保持识别中，不累加未授权。
    未检出脸返回 face_found=False（不告警、不写缓存）。
    """
    pending = {
        "auth_status": None,
        "recognized_name": "",
        "face_distance": None,
        "face_found": False,
    }
    unauthorized = {
        "auth_status": AUTH_STATUS_UNAUTHORIZED,
        "recognized_name": UNAUTHORIZED_DISPLAY_NAME,
        "face_distance": None,
        "face_found": True,
    }

    # 白名单是 numpy 矩阵，不能用 `not arr` 判空
    if known_encodings is None or len(known_encodings) == 0:
        return unauthorized

    roi = _crop_face_roi(frame_bgr, x1, y1, x2, y2)
    if roi is None:
        return pending

    try:
        t0 = time.perf_counter()
        method = FACE_ENGINE if FACE_ENGINE != "none" else "yunet"
        encoding = None

        # 1) SFace 主路径（含姿态/清晰度过滤）
        if FACE_ENGINE == "sface" or _get_sface_recognizer() is not None:
            method = "sface"
            encoding, qrej = _sface_feature_from_bgr(roi, require_quality=True)
            if qrej is not None:
                ms = (time.perf_counter() - t0) * 1000
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] "
                    f"人脸质量拒绝 {ms:.0f}ms ({qrej.get('quality_reason')}) | 识别中"
                )
                return qrej

        # 2) dlib 回退（同样做 YuNet 质量过滤）
        if encoding is None and FACE_ENGINE != "sface":
            face_row = _yunet_best_face_row(roi)
            if face_row is not None:
                ok, reason = _assess_face_quality(roi, face_row)
                if not ok:
                    ms = (time.perf_counter() - t0) * 1000
                    print(
                        f"[{datetime.now().strftime('%H:%M:%S')}] "
                        f"人脸质量拒绝 {ms:.0f}ms ({reason}) | 识别中"
                    )
                    return {
                        "auth_status": None,
                        "recognized_name": "",
                        "face_distance": None,
                        "face_similarity": None,
                        "face_found": True,
                        "quality_reject": True,
                        "quality_reason": reason,
                    }
            try:
                import face_recognition
            except ImportError:
                face_recognition = None
            if face_recognition is not None:
                rgb_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
                rh, rw = rgb_roi.shape[:2]
                locations = _yunet_face_locations(roi)
                method = "yunet+dlib"
                if locations:
                    encoding = _encode_face_crop(
                        rgb_roi, locations[0], face_recognition
                    )
                area_ratio_est = max(0.0, (x2 - x1) * (y2 - y1)) / max(
                    1.0, float(frame_bgr.shape[0] * frame_bgr.shape[1])
                )
                if encoding is None and area_ratio_est >= 0.35:
                    margin_y, margin_x = max(2, rh // 16), max(2, rw // 16)
                    assumed = (margin_y, rw - margin_x, rh - margin_y, margin_x)
                    encoding = _encode_face_crop(
                        rgb_roi, assumed, face_recognition
                    )
                    if encoding is not None:
                        fast = _match_encoding(
                            encoding, known_encodings, known_names
                        )
                        if fast["auth_status"] == AUTH_STATUS_AUTHORIZED:
                            ms = (time.perf_counter() - t0) * 1000
                            print(
                                f"[{datetime.now().strftime('%H:%M:%S')}] "
                                f"人脸快路径 {ms:.0f}ms | 已授权 | "
                                f"{fast['recognized_name']} 距离="
                                f"{fast.get('face_distance'):.3f}"
                            )
                            return fast
                        encoding = None
                if (
                    encoding is None
                    and not locations
                    and FACE_USE_HOG_FALLBACK
                ):
                    locations = face_recognition.face_locations(
                        rgb_roi,
                        number_of_times_to_upsample=0,
                        model="hog",
                    )
                    method = "hog"
                    if locations:
                        encoding = _encode_face_crop(
                            rgb_roi, locations[0], face_recognition
                        )

        if encoding is None:
            global _last_noface_log
            ms = (time.perf_counter() - t0) * 1000
            now_log = time.time()
            if now_log - _last_noface_log >= 1.5:
                _last_noface_log = now_log
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] "
                    f"未检出人脸 {ms:.0f}ms（继续识别中）"
                )
            return pending

        result = _match_encoding(encoding, known_encodings, known_names)
        ms = (time.perf_counter() - t0) * 1000
        sim = result.get("face_similarity")
        if result.get("auth_status") == AUTH_STATUS_AUTHORIZED:
            status_txt = "已授权"
        elif result.get("auth_status") == AUTH_STATUS_UNAUTHORIZED:
            status_txt = "未授权"
        else:
            status_txt = "识别中"
        extra = (
            f" 相似度={sim:.3f}"
            if isinstance(sim, float)
            else f" 距离={result.get('face_distance')}"
        )
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"人脸识别 {ms:.0f}ms ({method}) | {status_txt} |{extra}"
        )
        return result
    except Exception as exc:
        print(f"[WARN] 人脸识别异常（保持识别中）: {exc}")
        return pending


def _apply_identity_to_det(det, identity):
    if not identity:
        return
    det["auth_status"] = identity.get("auth_status")
    det["recognized_name"] = identity.get("recognized_name", "")
    det["face_distance"] = identity.get("face_distance")
    det["face_similarity"] = identity.get("face_similarity")
    det["from_confirmed_cache"] = bool(
        identity.get("from_confirmed_cache") or identity.get("from_track_lock")
    )
    det["quality_reject"] = bool(identity.get("quality_reject"))


def _run_face_job(frame_bgr, x1, y1, x2, y2, known_encodings, known_names,
                  cx, cy, track_id=None, job_key=None):
    """
    后台人脸比对（线程池执行）。
    - 单帧原始结果计入 streak：投票过程中返回的「识别中」不再打断累计，
      陌生人确认所需样本数从「投票 3 帧 + 确认 3 帧」降为 3 帧。
    - 展示 / 缓存使用 track 投票结果，授权身份可锁定。
    """
    t0 = time.perf_counter()
    try:
        result = recognize_face_in_roi(
            frame_bgr, x1, y1, x2, y2, known_encodings, known_names
        )
        face_ms = (time.perf_counter() - t0) * 1000.0
        with _telemetry_lock:
            prev_ms = _telemetry.get("face_ms", 0.0)
        update_telemetry(face_ms=round(_ema(prev_ms, face_ms), 1))
        if not result or not result.get("face_found"):
            return
        result = dict(result)
        ts = time.time()
        result["result_ts"] = ts
        # 1) 原始单帧样本 → streak（质量拒绝帧会打断未授权累计）
        _note_face_sample(cx, cy, result, track_id=track_id)

        # 2) 投票结果 → 展示 / 缓存
        shown = result
        if track_id is not None:
            voted = _track_apply_vote(track_id, result)
            if voted is not None:
                shown = dict(voted)
                shown["result_ts"] = ts
        if shown.get("quality_reject"):
            # 侧脸/模糊：只刷新「识别中」
            _update_raw_face_result(cx, cy, {
                "face_found": True,
                "auth_status": None,
                "recognized_name": "",
                "face_distance": shown.get("face_distance"),
                "face_similarity": shown.get("face_similarity"),
                "quality_reject": True,
                "result_ts": ts,
            }, track_id=track_id, note=False)
            return
        sim = shown.get("face_similarity")
        strong = (
            shown.get("auth_status") == AUTH_STATUS_AUTHORIZED
            and FACE_ENGINE == "sface"
            and isinstance(sim, (int, float))
            and float(sim) >= SFACE_STRONG_AUTH
        )
        _update_raw_face_result(cx, cy, shown, track_id=track_id, note=False)
        if strong or shown.get("from_track_lock"):
            _update_face_cache(cx, cy, shown)
        elif (
            shown.get("auth_status") == AUTH_STATUS_AUTHORIZED
            and track_id is not None
        ):
            locked = _track_locked_identity(track_id)
            if locked:
                _update_face_cache(cx, cy, locked)
    except Exception:
        print("[WARN] 人脸识别任务异常（保持识别中）:")
        traceback.print_exc()
    finally:
        with _face_job_lock:
            _face_job["inflight"].discard(job_key)


def schedule_face_recognition(frame_bgr, det, known_encodings, known_names):
    """
    对 ROI 内的接近目标异步做人脸识别（线程池，最多 FACE_MAX_WORKERS 个并发）。
    - 已锁定 / 已确认缓存：直接复用，不再提交
    - 有原始结果：先用于展示，同时继续按间隔采样（旧实现会在 1.2s 内跳过采样，
      导致确认一个陌生人要等好几秒）
    """
    cx, cy = _bbox_center(det["x1"], det["y1"], det["x2"], det["y2"])
    now = time.time()
    track_id = det.get("track_id")

    locked = _track_locked_identity(track_id)
    if locked is not None:
        _apply_identity_to_det(det, locked)
        return

    cached = _cache_hit(cx, cy, now) if track_id is None else None
    if cached is not None:
        _apply_identity_to_det(det, {**cached, "from_confirmed_cache": True})
        return

    raw = _track_raw_hit(track_id, now) if track_id is not None else _raw_face_hit(cx, cy, now)
    if raw is not None:
        _apply_identity_to_det(det, raw)
    else:
        det["auth_status"] = None
        det["recognized_name"] = ""
        det["face_distance"] = None
        det["face_similarity"] = None
        det["from_confirmed_cache"] = False
        det["quality_reject"] = False

    job_key = track_id if track_id is not None else "pos"
    with _face_job_lock:
        inflight = _face_job["inflight"]
        last = _face_job["last_submit"].get(job_key, 0.0)
        if (
            job_key in inflight
            or len(inflight) >= FACE_MAX_WORKERS
            or (now - last) < FACE_CHECK_INTERVAL
        ):
            return
        inflight.add(job_key)
        _face_job["last_submit"][job_key] = now
        # 清理过期轨迹的提交记录
        if len(_face_job["last_submit"]) > 64:
            for k in [k for k, t in _face_job["last_submit"].items() if now - t > 30.0]:
                _face_job["last_submit"].pop(k, None)

    # frame_bgr 由 YOLO 线程每轮新拷贝且之后只读，可直接共享，省去整帧 copy
    try:
        _face_executor.submit(
            _run_face_job,
            frame_bgr,
            det["x1"], det["y1"], det["x2"], det["y2"],
            known_encodings, known_names, cx, cy, track_id, job_key,
        )
    except RuntimeError:
        with _face_job_lock:
            _face_job["inflight"].discard(job_key)


def build_person_detection(frame_bgr, x1, y1, x2, y2, confidence, frame_h, frame_w,
                           known_encodings, known_names, run_face=False,
                           track_id=None):
    """
    由单个 YOLO person 框构建检测结果（综合接近度 + ROI + track）。
    run_face=True 时仅对主目标调度异步人脸识别。
    """
    proximity, area_ratio, d_factor, y_norm, in_roi = compute_proximity(
        x1, y1, x2, y2, frame_h, frame_w
    )
    d_est, d_factor_h = estimate_distance_m(y1, y2, frame_h)
    band = distance_band(d_est)
    foot_x = (float(x1) + float(x2)) * 0.5
    foot_y = float(y2)
    dwell, motion = _update_track_meta(
        track_id, time.time(), foot_xy=(foot_x, foot_y), d_est=d_est, in_roi=in_roi
    )

    det = {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "confidence": confidence,
        "area_ratio": area_ratio,
        "proximity_ratio": proximity,
        "d_factor": d_factor,
        "d_factor_h": d_factor_h,
        "d_est": d_est,
        "distance_band": band,
        "y_norm": y_norm,
        "in_roi": in_roi,
        "track_id": track_id,
        "dwell_sec": dwell,
        "motion": motion,
        "auth_status": None,
        "recognized_name": "",
        "face_distance": None,
        "danger_level": 0,
        "alert_type": ALERT_TYPE_INTRUSION,
    }

    # 接近度不足或不在 ROI：不做人脸、不告警
    if proximity < PROXIMITY_ALERT_THRESHOLD or not in_roi:
        return det

    locked = _track_locked_identity(track_id)
    if locked is not None:
        _apply_identity_to_det(det, locked)
    elif run_face:
        schedule_face_recognition(frame_bgr, det, known_encodings, known_names)
    elif track_id is not None:
        raw = _track_raw_hit(track_id, time.time())
        if raw is not None:
            _apply_identity_to_det(det, raw)
    else:
        cx, cy = _bbox_center(x1, y1, x2, y2)
        cached = _cache_hit(cx, cy, time.time())
        if cached is not None:
            _apply_identity_to_det(det, {**cached, "from_confirmed_cache": True})

    if det["auth_status"] == AUTH_STATUS_AUTHORIZED:
        det["danger_level"] = 0
    elif det["auth_status"] == AUTH_STATUS_UNAUTHORIZED:
        det["danger_level"] = 3 if proximity >= 0.45 else 2

    return det


# =====================================================================
#  心跳 / 上报
# =====================================================================

def update_low_light_state(frame):
    """周期性用灰度均值判断弱光，供 CLAHE 与置信度微调。"""
    now = time.time()
    if now - _low_light["checked_at"] < 1.0:
        return _low_light["active"]
    if frame is None or frame.size == 0:
        return False
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean = float(gray.mean())
    _low_light["mean"] = mean
    _low_light["active"] = mean < CLAHE_LUMINANCE
    _low_light["checked_at"] = now
    return _low_light["active"]


def _enhance_face_roi(bgr):
    if not _low_light["active"] or bgr is None or bgr.size == 0:
        return bgr
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    l2 = _clahe.apply(l_ch)
    return cv2.cvtColor(cv2.merge((l2, a_ch, b_ch)), cv2.COLOR_LAB2BGR)


def apply_edge_config(cfg):
    """心跳下发的算法阈值，写入内存后下一帧生效。"""
    global COOL_DOWN_INTERVAL, SFACE_COSINE_THRESHOLD, DIST_DANGER_M, TAILGATE_ENABLE
    if not isinstance(cfg, dict):
        return
    changed = []
    if cfg.get("cooldownSec") is not None:
        COOL_DOWN_INTERVAL = max(1.0, float(cfg["cooldownSec"]))
        changed.append(f"cooldown={COOL_DOWN_INTERVAL:.0f}s")
    if cfg.get("faceMatchThreshold") is not None:
        SFACE_COSINE_THRESHOLD = float(cfg["faceMatchThreshold"])
        changed.append(f"face={SFACE_COSINE_THRESHOLD:.3f}")
    if cfg.get("dangerDistanceM") is not None:
        DIST_DANGER_M = float(cfg["dangerDistanceM"])
        changed.append(f"danger<={DIST_DANGER_M:.2f}m")
    if "tailgateEnabled" in cfg and cfg.get("tailgateEnabled") is not None:
        TAILGATE_ENABLE = bool(cfg.get("tailgateEnabled"))
        changed.append(f"tailgate={'on' if TAILGATE_ENABLE else 'off'}")
    if changed:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"边缘参数已热更新: {', '.join(changed)}"
        )


def _boxes_close(a, b, limit_px=None):
    limit = TAILGATE_CLOSE_PX if limit_px is None else limit_px
    acx = (a["x1"] + a["x2"]) * 0.5
    acy = (a["y1"] + a["y2"]) * 0.5
    bcx = (b["x1"] + b["x2"]) * 0.5
    bcy = (b["y1"] + b["y2"]) * 0.5
    return math.hypot(acx - bcx, acy - bcy) <= limit


def evaluate_scene_alerts(detections):
    """尾随与遮挡徘徊。返回 [(det, alert_type), ...]。"""
    extras = []
    zone = [
        d for d in detections
        if d.get("in_roi") and d.get("proximity_ratio", 0) >= PROXIMITY_ALERT_THRESHOLD
    ]
    if TAILGATE_ENABLE and len(zone) >= 2:
        auths = [d for d in zone if d.get("auth_status") == AUTH_STATUS_AUTHORIZED]
        unauths = [d for d in zone if d.get("auth_status") == AUTH_STATUS_UNAUTHORIZED]
        if auths and unauths:
            target = unauths[0]
            target["alert_type"] = ALERT_TYPE_TAILGATING
            extras.append((target, ALERT_TYPE_TAILGATING))
        elif len(auths) == 1:
            others = [d for d in zone if d is not auths[0]]
            if others and _boxes_close(auths[0], others[0]):
                target = others[0]
                target["alert_type"] = ALERT_TYPE_TAILGATING
                extras.append((target, ALERT_TYPE_TAILGATING))
    for det in zone:
        if det.get("motion") == "Passing":
            continue
        if det.get("auth_status") == AUTH_STATUS_AUTHORIZED:
            continue
        if det.get("dwell_sec", 0) >= LOITER_SECONDS and not _track_quality_face(det.get("track_id")):
            det["alert_type"] = ALERT_TYPE_LOITERING
            extras.append((det, ALERT_TYPE_LOITERING))
            break
    return extras


def _smooth_track_box(track_id, x1, y1, x2, y2):
    """对同一 track_id 的行人检测框做指数移动平均（EMA），抑制框抖动与距离跳变。"""
    if track_id is None or BOX_EMA_ALPHA <= 0.0 or BOX_EMA_ALPHA >= 1.0:
        return int(x1), int(y1), int(x2), int(y2)
    alpha = float(BOX_EMA_ALPHA)
    with _track_lock:
        meta = _track_meta.get(track_id)
        if meta is None:
            return int(x1), int(y1), int(x2), int(y2)
        prev = meta.get("ema_box")
        if prev is None:
            smoothed = (float(x1), float(y1), float(x2), float(y2))
        else:
            px1, py1, px2, py2 = prev
            smoothed = (
                alpha * float(x1) + (1.0 - alpha) * px1,
                alpha * float(y1) + (1.0 - alpha) * py1,
                alpha * float(x2) + (1.0 - alpha) * px2,
                alpha * float(y2) + (1.0 - alpha) * py2,
            )
        meta["ema_box"] = smoothed
    return int(round(smoothed[0])), int(round(smoothed[1])), int(round(smoothed[2])), int(round(smoothed[3]))


def _select_face_indices(candidates, max_count=None):
    """
    选取最多 max_count 个 ROI 内接近目标并发做人脸识别（优先未锁定身份且接近度高的目标）。
    多人同框 / 尾随场景下可同时识别前 N 个目标，无需排队等待。
    """
    limit = FACE_MAX_WORKERS if max_count is None else max(1, int(max_count))
    ranked = []
    for i, item in enumerate(candidates):
        prox, in_roi = item[0], item[1]
        tid = item[-1]
        if not in_roi or prox < PROXIMITY_ALERT_THRESHOLD:
            continue
        locked = _track_locked_identity(tid) is not None
        ranked.append((0 if not locked else 1, -prox, i))
    if not ranked:
        return set()
    ranked.sort()
    return {idx for _lock_flag, _neg_prox, idx in ranked[:limit]}


def _select_face_index(candidates):
    """兼容单目标索引选取。"""
    indices = _select_face_indices(candidates, max_count=1)
    return next(iter(indices), -1)


def resolve_heartbeat_url():
    """根据上报地址或显式配置解析心跳 URL。"""
    explicit = os.environ.get("BACKEND_HEARTBEAT_URL", "").strip()
    if explicit:
        return explicit
    base = os.environ.get("BACKEND_BASE_URL", "").strip()
    if not base:
        from urllib.parse import urlparse

        parsed = urlparse(BACKEND_UPLOAD_URL)
        base = f"{parsed.scheme}://{parsed.netloc}"
    return f"{base.rstrip('/')}/api/devices/{DEVICE_ID}/heartbeat"


BACKEND_HEARTBEAT_URL = resolve_heartbeat_url()


def update_stream_frame(frame_bgr):
    """把 YOLO 画框后的画面编码为 JPEG，供前端 MJPEG 实时预览。"""
    global _stream_jpeg
    if not STREAM_ENABLE or frame_bgr is None or frame_bgr.size == 0:
        return
    try:
        out = frame_bgr
        h, w = out.shape[:2]
        if w > STREAM_MAX_WIDTH:
            scale = STREAM_MAX_WIDTH / float(w)
            out = cv2.resize(
                out,
                (STREAM_MAX_WIDTH, max(1, int(h * scale))),
                interpolation=cv2.INTER_AREA,
            )
        ok, buf = cv2.imencode(
            ".jpg",
            out,
            [int(cv2.IMWRITE_JPEG_QUALITY), int(STREAM_JPEG_QUALITY)],
        )
        if not ok:
            return
        with _stream_lock:
            _stream_jpeg = buf.tobytes()
    except Exception:
        pass


def start_mjpeg_server():
    """后台线程启动 MJPEG HTTP 服务，供管理端嵌入实时检测画面。"""
    if not STREAM_ENABLE:
        print("[INFO] 实时预览推流已关闭（STREAM_ENABLE=0）")
        return

    class _MjpegHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            return

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path in ("/health", "/"):
                with _telemetry_lock:
                    telem = dict(_telemetry)
                body = json.dumps(
                    {"ok": True, "stream": "/video", "telemetry": telem},
                    ensure_ascii=False,
                ).encode("utf-8")
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path != "/video":
                self.send_response(404)
                self._cors()
                self.end_headers()
                return

            boundary = b"frame"
            self.send_response(200)
            self._cors()
            self.send_header(
                "Content-Type",
                "multipart/x-mixed-replace; boundary=frame",
            )
            self.end_headers()
            interval = 1.0 / max(1.0, STREAM_FPS)
            try:
                while True:
                    with _stream_lock:
                        jpeg = _stream_jpeg
                    if jpeg:
                        self.wfile.write(b"--" + boundary + b"\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n")
                        self.wfile.write(
                            f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii")
                        )
                        self.wfile.write(jpeg)
                        self.wfile.write(b"\r\n")
                        self.wfile.flush()
                    time.sleep(interval)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                return
            except Exception:
                return

    def _serve():
        try:
            server = ThreadingHTTPServer(("0.0.0.0", STREAM_PORT), _MjpegHandler)
            print(
                f"[INFO] YOLO 实时预览: http://localhost:{STREAM_PORT}/video "
                f"（管理端可嵌入该地址）"
            )
            server.serve_forever()
        except OSError as exc:
            print(f"[WARN] 实时预览端口 {STREAM_PORT} 启动失败: {exc}")

    threading.Thread(target=_serve, daemon=True).start()


def send_heartbeat():
    """向云端上报设备存活心跳，并应用下发的 edgeConfig。"""
    try:
        response = _http.post(BACKEND_HEARTBEAT_URL, timeout=1.5)
        if response.status_code == 200:
            try:
                res_json = response.json()
                if res_json.get("code") == 200:
                    data = res_json.get("data") or {}
                    if isinstance(data, dict) and data.get("edgeConfig"):
                        apply_edge_config(data.get("edgeConfig"))
                    print(
                        f"[{datetime.now().strftime('%H:%M:%S')}] "
                        f"心跳上报成功 deviceId={DEVICE_ID}"
                    )
                    flush_offline_cache(max_items=3)
                else:
                    print(
                        f"[{datetime.now().strftime('%H:%M:%S')}] "
                        f"[WARN] 心跳上报被后端拒绝: {res_json.get('message')}"
                    )
            except ValueError:
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] "
                    f"心跳上报成功 deviceId={DEVICE_ID}"
                )
        else:
            print(f"[WARN] 心跳上报失败 HTTP {response.status_code}")
    except Exception as exc:
        print(f"[WARN] 心跳上报异常: {exc}")


def heartbeat_loop():
    """后台线程：周期性发送心跳，维持大屏在线状态。"""
    while True:
        send_heartbeat()
        time.sleep(HEARTBEAT_INTERVAL)


def frame_to_jpeg_bytes(frame, quality=75):
    """将 BGR 帧单次编码为 JPEG bytes。"""
    ok, buf = cv2.imencode(
        ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    )
    if not ok:
        raise RuntimeError("JPEG 编码失败")
    return buf.tobytes()


def frame_to_jpeg_base64(frame, quality=75):
    """将 BGR 帧编码为 JPEG Base64 字符串（不含 data: 前缀）。"""
    return base64.b64encode(frame_to_jpeg_bytes(frame, quality=quality)).decode("ascii")


def build_alert_payload(frame, device_id, area_ratio, auth_status, recognized_name,
                        danger_level, alert_type=ALERT_TYPE_INTRUSION,
                        image_bytes=None):
    """
    构造上报 JSON（规格字段）+ 后端兼容字段。

    规格字段:
      auth_status / recognized_name / area_ratio / snapshot_base64
    兼容字段（现有 Spring Boot multipart 接口）:
      deviceId / proximityRatio / dangerLevel / recognizedName
    """
    if image_bytes is None:
        image_bytes = frame_to_jpeg_bytes(frame)
    snapshot_b64 = base64.b64encode(image_bytes).decode("ascii")
    return {
        # ---- 规格要求字段 ----
        "auth_status": auth_status,
        "recognized_name": recognized_name,
        "area_ratio": float(area_ratio),
        "snapshot_base64": snapshot_b64,
        # ---- 现有后端兼容字段 ----
        "deviceId": int(device_id),
        "proximityRatio": float(area_ratio),
        "dangerLevel": int(danger_level),
        "recognizedName": recognized_name,
        "authStatus": auth_status,
        "alertType": alert_type,
        "alert_type": alert_type,
    }


def log_authorized_passage(frame_clean, det):
    """授权用户正常通行：日志 + 异步上报后端通行记录（不上报告警工单）。"""
    global last_passage_log_time
    now = time.time()
    if now - last_passage_log_time < PASSAGE_LOG_INTERVAL:
        return
    last_passage_log_time = now

    dist = det.get("face_distance")
    dist_txt = f"{dist:.3f}" if dist is not None else "-"
    prox = det.get("proximity_ratio", det.get("area_ratio", 0.0))
    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] "
        f"[通行] 身份识别通过 | 姓名={det.get('recognized_name')} | "
        f"状态=已授权 | "
        f"接近度={prox:.3f} 面积比={det.get('area_ratio', 0):.3f} | "
        f"人脸距离={dist_txt} | track={det.get('track_id')}"
    )
    capture_frame = render_alert_capture(
        frame_clean,
        det["x1"], det["y1"], det["x2"], det["y2"],
        det["confidence"],
        auth_status=AUTH_STATUS_AUTHORIZED,
        recognized_name=det.get("recognized_name", ""),
    )
    _upload_executor.submit(
        save_and_post_alert_async,
        capture_frame,
        DEVICE_ID,
        prox,
        0,
        AUTH_STATUS_AUTHORIZED,
        det.get("recognized_name", ""),
        "PASSAGE",
    )


def save_and_post_alert_async(frame, device_id, area_ratio, danger_level,
                              auth_status, recognized_name,
                              alert_type=ALERT_TYPE_INTRUSION):
    """
    后台线程池：单次内存 JPEG 编码 + Keep-Alive Session 推送（无磁盘临时文件）。

    主循环严禁阻塞 I/O；使用 cv2.imencode + BytesIO 直接 multipart 上传。
    """
    try:
        image_bytes = frame_to_jpeg_bytes(frame, quality=75)
        payload = build_alert_payload(
            frame, device_id, area_ratio, auth_status, recognized_name,
            danger_level, alert_type, image_bytes=image_bytes,
        )

        preview = {
            k: (v[:48] + "...") if k == "snapshot_base64" and isinstance(v, str) else v
            for k, v in payload.items()
        }
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"告警 JSON 就绪: {preview}"
        )

        bio = io.BytesIO(image_bytes)

        form_data = {
            "deviceId": str(payload["deviceId"]),
            "proximityRatio": str(payload["proximityRatio"]),
            "dangerLevel": str(payload["dangerLevel"]),
            "recognizedName": payload["recognizedName"],
            "authStatus": payload["authStatus"],
            "auth_status": payload["auth_status"],
            "recognized_name": payload["recognized_name"],
            "area_ratio": str(payload["area_ratio"]),
            "alertType": payload.get("alertType") or ALERT_TYPE_INTRUSION,
            "alert_type": payload.get("alert_type") or ALERT_TYPE_INTRUSION,
        }
        files = {
            "file": ("capture.jpg", bio, "image/jpeg"),
        }
        response = _http.post(
            BACKEND_UPLOAD_URL,
            data=form_data,
            files=files,
            timeout=3.0,
        )

        if response.status_code == 200:
            print(
                f"[{datetime.now().strftime('%H:%M:%S')}] "
                f"告警上报成功 HTTP 200: {response.text[:200]}"
            )
            send_heartbeat()
        else:
            print(
                f"[{datetime.now().strftime('%H:%M:%S')}] "
                f"[WARN] 告警上报失败 HTTP {response.status_code}: {response.text[:200]}"
            )
            _enqueue_offline(image_bytes, form_data)

    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[WARN] 后端未启动或网络中断，已写入离线缓存: {exc}"
        )
        if "image_bytes" in locals() and "form_data" in locals():
            _enqueue_offline(image_bytes, form_data)
    except requests.exceptions.RequestException as exc:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[WARN] 告警 HTTP 请求异常，已写入离线缓存: {exc}"
        )
        if "image_bytes" in locals() and "form_data" in locals():
            _enqueue_offline(image_bytes, form_data)
    except Exception:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[ERROR] 异步告警线程异常（主监控不受影响）:"
        )
        traceback.print_exc()


def _offline_pairs():
    os.makedirs(OFFLINE_CACHE_DIR, exist_ok=True)
    jpgs = sorted(glob.glob(os.path.join(OFFLINE_CACHE_DIR, "*.jpg")))
    return jpgs


def _offline_total_bytes():
    total = 0
    if not os.path.isdir(OFFLINE_CACHE_DIR):
        return 0
    for name in os.listdir(OFFLINE_CACHE_DIR):
        path = os.path.join(OFFLINE_CACHE_DIR, name)
        if os.path.isfile(path):
            total += os.path.getsize(path)
    return total


def _trim_offline_cache():
    jpgs = _offline_pairs()
    while jpgs and (len(jpgs) > OFFLINE_MAX_ITEMS or _offline_total_bytes() > OFFLINE_MAX_BYTES):
        old = jpgs.pop(0)
        js = os.path.splitext(old)[0] + ".json"
        for path in (old, js):
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                pass
        print(f"[INFO] 离线缓存 FIFO 清理: {os.path.basename(old)}")


def _enqueue_offline(image_bytes, form_data):
    """断网时把 JPEG 与元数据写入本地 FIFO 目录。"""
    if not image_bytes:
        return
    with _offline_lock:
        os.makedirs(OFFLINE_CACHE_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
        base = os.path.join(OFFLINE_CACHE_DIR, stamp)
        with open(base + ".jpg", "wb") as handle:
            handle.write(image_bytes)
        meta = {
            k: v for k, v in form_data.items()
            if k != "snapshot_base64"
        }
        with open(base + ".json", "w", encoding="utf-8") as handle:
            json.dump(meta, handle, ensure_ascii=False)
        _trim_offline_cache()
        print(f"[INFO] 告警已写入离线缓存 {stamp}.jpg")


def flush_offline_cache(max_items=3):
    """心跳恢复后按时间顺序重传少量积压告警。"""
    with _offline_lock:
        jpgs = _offline_pairs()
        sent = 0
        for jpg in jpgs:
            if sent >= max_items:
                break
            js = os.path.splitext(jpg)[0] + ".json"
            if not os.path.isfile(js):
                continue
            try:
                with open(js, "r", encoding="utf-8") as handle:
                    meta = json.load(handle)
                with open(jpg, "rb") as handle:
                    image_bytes = handle.read()
                bio = io.BytesIO(image_bytes)
                response = _http.post(
                    BACKEND_UPLOAD_URL,
                    data=meta,
                    files={"file": ("capture.jpg", bio, "image/jpeg")},
                    timeout=3.0,
                )
                if response.status_code != 200:
                    print(f"[WARN] 离线重传失败 HTTP {response.status_code}，暂停本轮")
                    break
                os.remove(jpg)
                os.remove(js)
                sent += 1
                print(f"[INFO] 离线告警已重传并删除 {os.path.basename(jpg)}")
            except requests.exceptions.RequestException as exc:
                print(f"[WARN] 离线重传中断: {exc}")
                break
            except Exception:
                traceback.print_exc()
                break


def audible_beep():
    """触发本地蜂鸣器（模拟）。"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [警报] 本地警报器触发：滴滴滴！")


# =====================================================================
#  画面标注
# =====================================================================

def render_alert_capture(frame, x1, y1, x2, y2, confidence,
                         auth_status=AUTH_STATUS_UNAUTHORIZED, recognized_name=""):
    """生成带告警框的上传用渲染图。授权绿框，未授权红框。"""
    annotated = frame.copy()
    is_auth = auth_status == AUTH_STATUS_AUTHORIZED
    top_y = (y1 - 8) if y1 >= 38 else (y1 + 32)

    if is_auth:
        color = (0, 210, 70)
        label = f"已授权：{recognized_name} ({confidence:.2f})"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)
        put_cn_text(
            annotated, label, (x1 + 4, top_y), (100, 255, 140),
            font_size=22, bg_color=(16, 20, 26),
        )
    else:
        color = (0, 0, 245)
        label = f"未授权 ({confidence:.2f})"
        if recognized_name:
            label = f"{recognized_name} ({confidence:.2f})"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)
        put_cn_text(
            annotated, label, (x1 + 4, top_y), (110, 110, 255),
            font_size=22, bg_color=(16, 20, 26),
        )
        put_cn_text(
            annotated, "警告：未授权人员！", (24, 52), (80, 80, 255),
            font_size=28, bg_color=(16, 20, 26),
        )
    return annotated


def draw_roi_overlay(frame, alert=False):
    """半透明 ROI：常态绿色，告警红色。多边形存在时用 pointPolygon 同款顶点。"""
    h, w = frame.shape[:2]
    color = (0, 0, 220) if alert else (0, 180, 0)
    text_color = (110, 110, 255) if alert else (110, 235, 130)
    overlay = frame.copy()
    if ALERT_ROI_POLYGON:
        poly = np.array(
            [[int(p[0] * w), int(p[1] * h)] for p in ALERT_ROI_POLYGON],
            dtype=np.int32,
        )
        cv2.fillPoly(overlay, [poly], color)
        cv2.addWeighted(overlay, 0.16, frame, 0.84, 0, frame)
        cv2.polylines(frame, [poly], True, color, 2)
        label_x = int(poly[:, 0].max()) - 96
        label_y = int(poly[:, 1].min()) + 24
    else:
        rx1, ry1, rx2, ry2 = ALERT_ROI_NORM
        p1 = (int(rx1 * w), int(ry1 * h))
        p2 = (int(rx2 * w), int(ry2 * h))
        cv2.rectangle(overlay, p1, p2, color, -1)
        cv2.addWeighted(overlay, 0.14, frame, 0.86, 0, frame)
        cv2.rectangle(frame, p1, p2, color, 2)
        # 置于 ROI 右上角内侧，避免与左上角检测框标题重叠
        label_x = p2[0] - 96
        label_y = p1[1] + 24
    label_x = min(max(8, label_x), max(8, w - 96))
    label_y = min(max(24, label_y), h - 8)
    put_cn_text(
        frame, "ROI 警戒区", (label_x, label_y),
        text_color, font_size=14, bg_color=(16, 20, 26), bg_alpha=0.65,
    )


def draw_status_hud(frame):
    if _low_light.get("active"):
        put_cn_text(
            frame, "暗光增强 (CLAHE)", (12, 28),
            (0, 225, 255), font_size=16, bg_color=(16, 20, 26), bg_alpha=0.65,
        )


def draw_live_detection(frame, x1, y1, x2, y2, confidence, in_cooldown,
                        auth_status=None, recognized_name="", area_ratio=0.0,
                        proximity_ratio=None, track_id=None, dwell_sec=0.0,
                        in_roi=True, d_est=None, distance_band_name=None, motion=None):
    """实时预览绘制：授权绿框，未授权红框，识别中黄框，远处/区外灰框。"""
    h, _w = frame.shape[:2]
    prox = float(proximity_ratio if proximity_ratio is not None else area_ratio)
    tid_txt = f"#{track_id} " if track_id is not None else ""
    if auth_status == AUTH_STATUS_AUTHORIZED:
        color = (0, 210, 70)
        text_color = (90, 255, 130)
        label = f"{tid_txt}{recognized_name} ({confidence:.2f})"
    elif auth_status == AUTH_STATUS_UNAUTHORIZED:
        color = (0, 0, 245)
        text_color = (100, 100, 255)
        label = f"{tid_txt}陌生人 ({confidence:.2f})"
        if recognized_name:
            label = f"{tid_txt}{recognized_name} ({confidence:.2f})"
    elif prox >= PROXIMITY_ALERT_THRESHOLD and in_roi:
        color = (0, 200, 255)
        text_color = (70, 225, 255)
        label = f"{tid_txt}识别中… P={prox:.2f}"
    else:
        color = (180, 180, 180)
        text_color = (220, 220, 220)
        zone = "" if in_roi else "区外 "
        label = f"{tid_txt}{zone}行人 P={prox:.2f} ({confidence:.2f})"

    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    # 顶部主标签：若框顶空间充足则画在框外上方，否则画在框内左上角，绝不压框线
    top_y = (y1 - 6) if y1 >= 34 else (y1 + 26)
    top_x = (x1 + 2) if y1 >= 34 else (x1 + 6)
    put_cn_text(
        frame, label, (top_x, top_y),
        text_color, font_size=18, bg_color=(16, 20, 26), bg_alpha=0.72,
    )

    # 底部辅助信息合并为单行标签，防止贴底时多行文字挤压在同一点造成重叠乱码
    sub_parts = []
    if d_est is not None:
        if auth_status == AUTH_STATUS_AUTHORIZED:
            sub_parts.append(f"距离 {d_est:.1f}m")
        else:
            band = distance_band_name or distance_band(d_est)
            band_cn = {"DANGER": "近距", "WARN": "接近", "SAFE": "安全"}.get(band, band)
            sub_parts.append(f"距离 {d_est:.1f}m·{band_cn}")
    if motion and motion != "Unknown":
        motion_cn = {
            "Approaching": "靠近",
            "Leaving": "远离",
            "Passing": "路过",
        }.get(motion, motion)
        sub_parts.append(motion_cn)
    if track_id is not None and dwell_sec > 0.5:
        sub_parts.append(f"滞留 {dwell_sec:.1f}s")
    if in_cooldown and auth_status == AUTH_STATUS_UNAUTHORIZED:
        sub_parts.append("冷却中")

    if sub_parts:
        sub_text = " | ".join(sub_parts)
        # 若框底下方有足够余量则画在框外下方，否则画在框内左下角
        bot_y = (y2 + 22) if (y2 + 28 <= h) else (y2 - 8)
        bot_x = (x1 + 2) if (y2 + 28 <= h) else (x1 + 6)
        put_cn_text(
            frame, sub_text, (bot_x, bot_y),
            text_color, font_size=14, bg_color=(16, 20, 26), bg_alpha=0.72,
        )


# =====================================================================
#  视频源
# =====================================================================

def resolve_video_source():
    """
    解析视频输入源：
      - VIDEO_SOURCE=0 / 1           → 物理摄像头索引
      - VIDEO_SOURCE=/app/demo/x.mp4 → 演示视频
      - VIDEO_SOURCE=/app/demo/x.jpg → 静态图片
    """
    explicit = os.environ.get("VIDEO_SOURCE", "").strip()
    if explicit:
        if explicit.isdigit():
            return "camera", int(explicit)
        lower = explicit.lower()
        if lower.endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
            return "image", explicit
        return "file", explicit
    return "camera", int(os.environ.get("CAMERA_INDEX", "0"))


class FrameSource:
    """统一封装摄像头 / 视频文件 / 静态图片三种输入。"""

    def __init__(self):
        self.mode, self.source = resolve_video_source()
        self.cap = None
        self.static_frame = None
        self.api_preference = None

        if self.mode == "image":
            self.static_frame = cv2.imread(self.source)
            if self.static_frame is None:
                raise RuntimeError(f"无法读取演示图片: {self.source}")
            print(f"[INFO] 图片演示模式: {self.source}")
            return

        if self.mode == "camera":
            success = False
            import platform

            is_windows = platform.system() == "Windows"
            backend_api = cv2.CAP_DSHOW if is_windows else cv2.CAP_ANY

            print(f"[INFO] 正在尝试打开摄像头索引: {self.source}")
            try:
                cap = cv2.VideoCapture(self.source, backend_api)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    time.sleep(0.1)
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        self.cap = cap
                        self.api_preference = "DSHOW" if is_windows else "DEFAULT"
                        success = True
                        print(f"[INFO] 成功打开并读取摄像头索引: {self.source}")
                    else:
                        cap.release()
            except Exception:
                pass

            if not success:
                if os.path.exists("demo/demo.jpg"):
                    print(
                        "[INFO] 未检测到可用摄像头或权限受限，"
                        "已自动切换至 demo/demo.jpg 演示模式运行"
                    )
                    self.mode = "image"
                    self.source = "demo/demo.jpg"
                    self.static_frame = cv2.imread(self.source)
                    return
                hint = (
                    "Linux 容器请映射 devices: [/dev/video0:/dev/video0]；"
                    "Windows Docker 请改用 VIDEO_SOURCE=/app/demo/demo.mp4 或 .jpg"
                )
                raise RuntimeError(f"无法打开任何可用的摄像头视频源。{hint}")
        else:
            print(f"[INFO] 打开视频源 ({self.mode}): {self.source}")
            self.cap = cv2.VideoCapture(self.source)
            self.api_preference = "DEFAULT"
            if not self.cap.isOpened():
                hint = (
                    "Linux 容器请映射 devices: [/dev/video0:/dev/video0]；"
                    "Windows Docker 请改用 VIDEO_SOURCE=/app/demo/demo.mp4 或 .jpg"
                )
                raise RuntimeError(f"无法打开视频源: {self.source}。{hint}")

    def read(self):
        """返回 (ret, frame, is_fallback)。is_fallback=True 表示降级帧，不应告警。"""
        if self.mode == "image":
            return True, self.static_frame.copy(), False

        ret, frame = self.cap.read()
        if not ret or frame is None:
            if self.mode == "camera":
                print("[WARN] 摄像头读取帧失败，正在尝试重新连接摄像头...")
                self.cap.release()
                time.sleep(0.5)
                import platform

                backend_api = (
                    cv2.CAP_DSHOW if platform.system() == "Windows" else cv2.CAP_ANY
                )
                self.cap = cv2.VideoCapture(self.source, backend_api)

                if self.cap.isOpened():
                    self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
                    # 640x480：门禁够用，显著减轻解码与拷贝开销
                    self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    for _ in range(5):
                        ret, frame = self.cap.read()
                        if ret and frame is not None:
                            print("[INFO] 摄像头重新连接并读取成功！")
                            return True, frame, False
                        time.sleep(0.1)

                print("[WARN] 摄像头重连失败，临时展示演示图（不触发告警）。")
                if os.path.exists("demo/demo.jpg"):
                    demo_img = cv2.imread("demo/demo.jpg")
                    if demo_img is not None:
                        return True, demo_img, True
                return False, None, True

            if self.mode == "file" and VIDEO_LOOP:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = self.cap.read()
        return ret, frame, False

    def release(self):
        if self.cap is not None:
            self.cap.release()

    def __del__(self):
        self.release()


def pick_primary_detection(detections):
    """选取 ROI 内综合接近度最高、且达阈值的人员（含识别中）。"""
    best = None
    for det in detections:
        if not det.get("in_roi", True):
            continue
        prox = det.get("proximity_ratio", det.get("area_ratio", 0.0))
        if prox >= PROXIMITY_ALERT_THRESHOLD:
            if best is None or prox > best.get(
                "proximity_ratio", best.get("area_ratio", 0.0)
            ):
                best = det
    return best


def dispatch_detection_action(frame_clean, det, alert_type=ALERT_TYPE_INTRUSION):
    """
    根据身份识别结果分发动作：
      - AUTHORIZED  → 通行日志上报
      - UNAUTHORIZED → 冷却后异步告警上报
      - TAILGATING / LOITERING → 独立冷却的场景告警
    路过（Passing）的普通未授权入侵会被抑制。
    返回: True 表示本次触发了告警上报
    """
    global last_alert_time

    auth_status = det.get("auth_status")
    if alert_type == ALERT_TYPE_INTRUSION and auth_status == AUTH_STATUS_AUTHORIZED:
        log_authorized_passage(frame_clean, det)
        return False

    if alert_type == ALERT_TYPE_INTRUSION and det.get("motion") == "Passing":
        return False

    if alert_type == ALERT_TYPE_INTRUSION and auth_status != AUTH_STATUS_UNAUTHORIZED:
        return False

    prox = det.get("proximity_ratio", det.get("area_ratio", 0.0))
    if alert_type == ALERT_TYPE_INTRUSION and (
        prox < PROXIMITY_ALERT_THRESHOLD or not det.get("in_roi", True)
    ):
        return False

    now = time.time()
    cool_key = alert_type if alert_type != ALERT_TYPE_INTRUSION else "INTRUSION"
    if now - _alert_cooldown.get(cool_key, 0.0) < COOL_DOWN_INTERVAL:
        return False

    if alert_type == ALERT_TYPE_LOITERING and not auth_status:
        auth_status = AUTH_STATUS_UNAUTHORIZED
        det["recognized_name"] = det.get("recognized_name") or "遮挡徘徊"
    if alert_type == ALERT_TYPE_TAILGATING and not auth_status:
        auth_status = AUTH_STATUS_UNAUTHORIZED
        det["recognized_name"] = det.get("recognized_name") or "尾随人员"

    audible_beep()
    title_name = det.get("recognized_name", UNAUTHORIZED_DISPLAY_NAME)
    if alert_type == ALERT_TYPE_TAILGATING:
        title_name = title_name or "尾随闯入"
    elif alert_type == ALERT_TYPE_LOITERING:
        title_name = title_name or "遮挡徘徊"
    capture_frame = render_alert_capture(
        frame_clean,
        det["x1"], det["y1"], det["x2"], det["y2"],
        det["confidence"],
        auth_status=auth_status or AUTH_STATUS_UNAUTHORIZED,
        recognized_name=title_name,
    )
    danger = det.get("danger_level") or (3 if alert_type != ALERT_TYPE_INTRUSION else 2)
    _upload_executor.submit(
        save_and_post_alert_async,
        capture_frame,
        DEVICE_ID,
        prox,
        danger,
        auth_status or AUTH_STATUS_UNAUTHORIZED,
        title_name,
        alert_type,
    )
    _alert_cooldown[cool_key] = now
    if alert_type == ALERT_TYPE_INTRUSION:
        last_alert_time = now
    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] "
        f"告警上报触发: type={alert_type}, auth_status={auth_status}, "
        f"name={title_name}, "
        f"proximity={prox:.3f}, D={det.get('d_est')}, motion={det.get('motion')}, "
        f"track={det.get('track_id')}, danger={danger}"
    )
    return True


# =====================================================================
#  主流程
# =====================================================================

def _warmup_models(model, yolo_device, use_half=False):
    """启动时预热一次 YOLO + YuNet/SFace，消除首个行人进入画面时的首帧卡顿。"""
    if not MODEL_WARMUP:
        return
    t0 = time.perf_counter()
    try:
        dummy = np.zeros((YOLO_IMGSZ, YOLO_IMGSZ, 3), dtype=np.uint8)
        warm_kwargs = dict(
            imgsz=YOLO_IMGSZ,
            device=yolo_device,
            classes=[0],
            verbose=False,
        )
        if use_half:
            warm_kwargs["half"] = True
        model.predict(dummy, **warm_kwargs)
    except Exception as exc:
        print(f"[WARN] YOLO 预热跳过: {exc}")

    def _warm_face_worker():
        try:
            patch = np.zeros((160, 160, 3), dtype=np.uint8)
            _get_yunet_detector(160, 160)
            _get_sface_recognizer()
            _yunet_best_face_row(patch)
        except Exception:
            pass

    try:
        futs = [_face_executor.submit(_warm_face_worker) for _ in range(FACE_MAX_WORKERS)]
        for f in futs:
            f.result(timeout=3.0)
    except Exception:
        pass
    ms = (time.perf_counter() - t0) * 1000.0
    print(f"[INFO] 模型预热完成 ({ms:.0f}ms, half={use_half}, face_workers={FACE_MAX_WORKERS})")


def main():
    global last_alert_time

    yolo_device = resolve_yolo_device()
    use_half = bool(YOLO_HALF and str(yolo_device).startswith("cuda"))
    print(f"[INFO] 正在加载 YOLO 模型: {YOLO_WEIGHTS} (device={yolo_device}, half={use_half}) ...")
    model = YOLO(YOLO_WEIGHTS)
    try:
        model.to(yolo_device)
    except Exception as exc:
        print(f"[WARN] model.to({yolo_device}) 失败，将在推理时指定 device: {exc}")

    # ===== 预加载授权人脸库（双模板 + 预归一化矩阵 + 原子引用，支持 .reload 热更新） =====
    enc0, names0 = load_authorized_faces()
    set_face_bank(enc0, names0)
    update_telemetry(
        device=str(yolo_device),
        engine=str(FACE_ENGINE),
        half=use_half,
        face_bank=len(set(names0)),
    )
    _warmup_models(model, yolo_device, use_half=use_half)
    face_reload_state = {"last_reload_mtime": 0.0}
    reload_flag = os.path.join(AUTHORIZED_FACES_DIR, ".reload")
    if os.path.isfile(reload_flag):
        try:
            face_reload_state["last_reload_mtime"] = os.path.getmtime(reload_flag)
        except OSError:
            pass

    try:
        frame_source = FrameSource()
    except RuntimeError as exc:
        print(f"[ERROR] {exc}")
        return

    is_image_mode = frame_source.mode == "image"

    print(f"[INFO] 心跳地址: {BACKEND_HEARTBEAT_URL}，间隔 {HEARTBEAT_INTERVAL}s")
    print(f"[INFO] 告警冷却窗口: {COOL_DOWN_INTERVAL}s，上报地址: {BACKEND_UPLOAD_URL}")
    print(
        f"[INFO] 性能参数: device={yolo_device}, weights={YOLO_WEIGHTS}, "
        f"imgsz={YOLO_IMGSZ}, frame_w<={YOLO_FRAME_MAX_WIDTH}, "
        f"推理间隔={INFERENCE_INTERVAL}s, 人脸间隔={FACE_CHECK_INTERVAL}s, "
        f"缓存={FACE_CACHE_TTL}s, ROI<={FACE_ROI_MAX_SIDE}, "
        f"ByteTrack={'on' if USE_BYTETRACK else 'off'}"
    )
    if FACE_ENGINE == "sface":
        thr_desc = (
            f"授权>={SFACE_COSINE_THRESHOLD}, 拒绝<={SFACE_REJECT_THRESHOLD}, "
            f"强授权>={SFACE_STRONG_AUTH}"
        )
    else:
        thr_desc = (
            f"授权距离<{FACE_DISTANCE_THRESHOLD}, 拒绝距离>={FACE_REJECT_DISTANCE}"
        )
    bank_n = len(set(names0))
    print(
        f"[INFO] 人脸门控: engine={FACE_ENGINE}, P>={PROXIMITY_ALERT_THRESHOLD}, "
        f"ROI={ALERT_ROI_NORM}, {thr_desc}, "
        f"未授权确认={UNAUTH_CONFIRM_FRAMES}帧, "
        f"授权确认={AUTH_CONFIRM_FRAMES}帧, 授权人员={bank_n} 人"
    )
    print("[INFO] 支持管理端新增后热加载（原子替换白名单，检测 .reload）")
    if is_image_mode:
        print("[INFO] 当前为静态图片演示模式，仅执行一次检测与条件上报")
    start_mjpeg_server()
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    send_heartbeat()

    latest_frame = None
    frame_lock = threading.Lock()
    active_detections = []
    detections_lock = threading.Lock()
    running = True
    last_inference_time = 0.0

    demo_alert_sent = False
    demo_detections = []

    def yolo_inference_thread():
        nonlocal latest_frame, running, active_detections, last_inference_time

        print("[INFO] YOLO 推理后台线程已启动。")
        while running:
            frame_to_process = None
            with frame_lock:
                if latest_frame is not None:
                    frame_to_process = latest_frame.copy()
                    latest_frame = None

            now = time.time()
            if frame_to_process is not None and (now - last_inference_time) >= INFERENCE_INTERVAL:
                last_inference_time = now
                infer_frame = frame_to_process
                scale = 1.0
                fh, fw = infer_frame.shape[:2]
                if fw > YOLO_FRAME_MAX_WIDTH:
                    scale = YOLO_FRAME_MAX_WIDTH / float(fw)
                    infer_frame = cv2.resize(
                        infer_frame,
                        (YOLO_FRAME_MAX_WIDTH, max(1, int(fh * scale))),
                        interpolation=cv2.INTER_AREA,
                    )

                # ByteTrack 跟踪 person；GPU/CPU 由 yolo_device 指定
                t_yolo = time.perf_counter()
                low_light_active = update_low_light_state(frame_to_process)
                conf_now = CONF_THRESHOLD
                if low_light_active:
                    conf_now = max(0.15, CONF_THRESHOLD * 0.85)
                track_kwargs = dict(
                    conf=conf_now,
                    imgsz=YOLO_IMGSZ,
                    classes=[0],
                    device=yolo_device,
                    verbose=False,
                )
                if use_half:
                    track_kwargs["half"] = True
                if USE_BYTETRACK:
                    results = model.track(
                        infer_frame, persist=True, **track_kwargs
                    )
                else:
                    results = model(infer_frame, **track_kwargs)
                yolo_ms = (time.perf_counter() - t_yolo) * 1000.0

                h, w = frame_to_process.shape[:2]
                inv = (1.0 / scale) if scale > 0 else 1.0
                known_encodings, known_names = get_face_bank()
                candidates = []

                for result in results:
                    boxes = result.boxes
                    if boxes is None:
                        continue
                    for box in boxes:
                        x1, y1, x2, y2 = map(float, box.xyxy[0])
                        if scale != 1.0:
                            x1, y1, x2, y2 = x1 * inv, y1 * inv, x2 * inv, y2 * inv
                        x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
                        confidence = float(box.conf[0])
                        tid = None
                        if getattr(box, "id", None) is not None:
                            try:
                                tid = int(box.id[0])
                            except Exception:
                                tid = None
                        x1, y1, x2, y2 = _smooth_track_box(tid, x1, y1, x2, y2)
                        prox, _, _, _, in_roi = compute_proximity(
                            x1, y1, x2, y2, h, w
                        )
                        candidates.append(
                            (prox, in_roi, x1, y1, x2, y2, confidence, tid)
                        )

                # 支持并发识别前 FACE_MAX_WORKERS 个未锁定 ROI 目标（多人同框 / 尾随更快响应）
                face_indices = _select_face_indices(candidates, max_count=FACE_MAX_WORKERS)

                new_detections = []
                for i, (prox, in_roi, x1, y1, x2, y2, confidence, tid) in enumerate(
                    candidates
                ):
                    det = build_person_detection(
                        frame_to_process,
                        x1, y1, x2, y2,
                        confidence,
                        h, w,
                        known_encodings,
                        known_names,
                        run_face=(i in face_indices),
                        track_id=tid,
                    )
                    new_detections.append(det)

                with _telemetry_lock:
                    prev_yolo = _telemetry.get("yolo_ms", 0.0)
                update_telemetry(
                    yolo_ms=round(_ema(prev_yolo, yolo_ms), 1),
                    persons=len(new_detections),
                    low_light=bool(low_light_active),
                )

                with detections_lock:
                    active_detections = new_detections

            time.sleep(0.01)

    # -------------------- 静态图片演示模式 --------------------
    if is_image_mode:
        ret, frame, _ = frame_source.read()
        if not ret:
            print("[ERROR] 无法读取演示图片！")
            frame_source.release()
            return

        print("[INFO] 正在对演示图片执行 YOLO 推理...")
        known_encodings, known_names = get_face_bank()
        track_kwargs = dict(
            conf=CONF_THRESHOLD,
            imgsz=YOLO_IMGSZ,
            classes=[0],
            device=yolo_device,
            verbose=False,
        )
        if USE_BYTETRACK:
            results = model.track(frame, persist=True, **track_kwargs)
        else:
            results = model(frame, **track_kwargs)
        h, w = frame.shape[:2]
        demo_candidates = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confidence = float(box.conf[0])
                tid = None
                if getattr(box, "id", None) is not None:
                    try:
                        tid = int(box.id[0])
                    except Exception:
                        tid = None
                prox, area_r, _, _, in_roi = compute_proximity(x1, y1, x2, y2, h, w)
                demo_candidates.append(
                    (prox, in_roi, area_r, x1, y1, x2, y2, confidence, tid)
                )

        primary_idx = -1
        best_p = -1.0
        for i, (p, in_roi, *_rest) in enumerate(demo_candidates):
            if in_roi and p >= PROXIMITY_ALERT_THRESHOLD and p > best_p:
                best_p = p
                primary_idx = i

        for i, (prox, in_roi, area_r, x1, y1, x2, y2, confidence, tid) in enumerate(
            demo_candidates
        ):
            if i == primary_idx:
                det = build_person_detection(
                    frame, x1, y1, x2, y2, confidence, h, w,
                    known_encodings, known_names, run_face=False, track_id=tid,
                )
                if prox >= PROXIMITY_ALERT_THRESHOLD and in_roi:
                    face_result = recognize_face_in_roi(
                        frame, x1, y1, x2, y2, known_encodings, known_names
                    )
                    if not face_result.get("quality_reject"):
                        voted = _track_apply_vote(tid, face_result) if tid else None
                        use = voted or face_result
                        det["auth_status"] = use.get("auth_status")
                        det["recognized_name"] = use.get("recognized_name", "")
                        det["face_distance"] = use.get("face_distance")
                        det["face_similarity"] = use.get("face_similarity")
                        cx, cy = _bbox_center(x1, y1, x2, y2)
                        if use.get("auth_status") == AUTH_STATUS_AUTHORIZED:
                            _update_face_cache(cx, cy, use)
                        elif use.get("face_found"):
                            _update_raw_face_result(cx, cy, use)
                    if det["auth_status"] == AUTH_STATUS_AUTHORIZED:
                        det["danger_level"] = 0
                    elif det["auth_status"] == AUTH_STATUS_UNAUTHORIZED:
                        det["danger_level"] = 3 if prox >= 0.45 else 2
                demo_detections.append(det)
            else:
                demo_detections.append(
                    build_person_detection(
                        frame, x1, y1, x2, y2, confidence, h, w,
                        known_encodings, known_names, run_face=False,
                        track_id=tid,
                    )
                )

        if demo_detections:
            print(f"[INFO] 演示图片检测到 {len(demo_detections)} 个目标")
        else:
            print("[INFO] 演示图片未检测到目标")

        primary_det = pick_primary_detection(demo_detections)
        if primary_det is not None:
            if dispatch_detection_action(frame.copy(), primary_det):
                demo_alert_sent = True
            elif primary_det.get("auth_status") == AUTH_STATUS_AUTHORIZED:
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] "
                    f"演示模式：识别为授权用户 "
                    f"{primary_det.get('recognized_name')}，仅记录通行日志"
                )

        print("[INFO] 演示模式展示中，按 'q' 键退出...")
        while True:
            display = frame.copy()
            draw_roi_overlay(display, alert=any(
                d.get("auth_status") == AUTH_STATUS_UNAUTHORIZED for d in demo_detections
            ))
            draw_status_hud(display)
            for det in demo_detections:
                draw_live_detection(
                    display,
                    det["x1"], det["y1"], det["x2"], det["y2"],
                    det["confidence"],
                    in_cooldown=demo_alert_sent,
                    auth_status=det.get("auth_status"),
                    recognized_name=det.get("recognized_name", ""),
                    area_ratio=det.get("area_ratio", 0.0),
                    proximity_ratio=det.get("proximity_ratio"),
                    track_id=det.get("track_id"),
                    dwell_sec=det.get("dwell_sec", 0.0),
                    in_roi=det.get("in_roi", True),
                    d_est=det.get("d_est"),
                    distance_band_name=det.get("distance_band"),
                    motion=det.get("motion"),
                )

            if (
                primary_det is not None
                and primary_det.get("auth_status") == AUTH_STATUS_UNAUTHORIZED
            ):
                put_cn_text(
                    display, "警告：未授权人员！", (50, 50), (0, 0, 255), font_size=34,
                )

            put_cn_text(
                display, "[演示模式] 按 Q 退出",
                (10, display.shape[0] - 16), (0, 255, 255), font_size=22,
            )
            if demo_alert_sent:
                put_cn_text(
                    display, "未授权告警已上报（1/1）",
                    (10, display.shape[0] - 48), (0, 200, 200), font_size=20,
                )

            update_stream_frame(display)
            if not HEADLESS:
                cv2.imshow("智能门禁告警系统 - 边缘节点", display)
                key = cv2.waitKey(200) & 0xFF
                if key == ord("q"):
                    print("[INFO] 接收到退出指令，系统关闭...")
                    break
            else:
                time.sleep(1)

        frame_source.release()
        if not HEADLESS:
            cv2.destroyAllWindows()
        return

    # -------------------- 摄像头 / 视频模式 --------------------
    threading.Thread(target=yolo_inference_thread, daemon=True).start()
    fps_last_ts = time.perf_counter()

    while True:
        # 管理端新增授权人员后热加载人脸库（原子替换）
        maybe_hot_reload_faces(face_reload_state)

        ret, frame, is_fallback = frame_source.read()
        if not ret:
            print("[ERROR] 无法读取视频帧！")
            break

        now_perf = time.perf_counter()
        dt = max(1e-4, now_perf - fps_last_ts)
        fps_last_ts = now_perf
        with _telemetry_lock:
            prev_fps = _telemetry.get("fps", 0.0)
        update_telemetry(fps=round(_ema(prev_fps, min(60.0, 1.0 / dt), alpha=0.15), 1))

        if is_fallback:
            put_cn_text(
                frame, "[摄像头离线] 仅展示",
                (10, frame.shape[0] - 16), (0, 200, 200), font_size=22,
            )
            update_stream_frame(frame)
            if not HEADLESS:
                cv2.imshow("智能门禁告警系统 - 边缘节点", frame)
                if cv2.waitKey(200) & 0xFF == ord("q"):
                    print("[INFO] 接收到退出指令，系统关闭...")
                    running = False
                    break
            else:
                time.sleep(0.5)
            continue

        frame_clean = frame.copy()

        with frame_lock:
            latest_frame = frame_clean.copy()

        current_time = time.time()
        with detections_lock:
            current_detections = list(active_detections)
        # 后台人脸线程写完缓存后立刻反映到画面/上报，不必等下一轮 YOLO
        _apply_cache_to_detections(current_detections)

        draw_roi_overlay(frame, alert=any(
            d.get("in_roi") and (
                d.get("auth_status") == AUTH_STATUS_UNAUTHORIZED
                or (
                    d.get("auth_status") != AUTH_STATUS_AUTHORIZED
                    and d.get("distance_band") == "DANGER"
                )
                or d.get("alert_type") in (ALERT_TYPE_TAILGATING, ALERT_TYPE_LOITERING)
            )
            for d in current_detections
        ))
        draw_status_hud(frame)
        primary_det = pick_primary_detection(current_detections)
        in_cooldown = (current_time - last_alert_time) < COOL_DOWN_INTERVAL

        if primary_det is not None:
            stabilize_auth_for_action(primary_det)

        for det in current_detections:
            draw_live_detection(
                frame,
                det["x1"], det["y1"], det["x2"], det["y2"],
                det["confidence"],
                in_cooldown=in_cooldown,
                auth_status=det.get("auth_status"),
                recognized_name=det.get("recognized_name", ""),
                area_ratio=det.get("area_ratio", 0.0),
                proximity_ratio=det.get("proximity_ratio"),
                track_id=det.get("track_id"),
                dwell_sec=det.get("dwell_sec", 0.0),
                in_roi=det.get("in_roi", True),
                d_est=det.get("d_est"),
                distance_band_name=det.get("distance_band"),
                motion=det.get("motion"),
            )

        if primary_det is not None and primary_det.get("auth_status") == AUTH_STATUS_UNAUTHORIZED:
            put_cn_text(
                frame, "警告：未授权人员！", (16, 62), (90, 90, 255),
                font_size=26, bg_color=(16, 20, 26), bg_alpha=0.75,
            )

        if primary_det is not None:
            stable_auth = primary_det.get("auth_status")
            if stable_auth in (AUTH_STATUS_AUTHORIZED, AUTH_STATUS_UNAUTHORIZED):
                if not in_cooldown or stable_auth == AUTH_STATUS_AUTHORIZED:
                    dispatch_detection_action(frame_clean, primary_det)

        for scene_det, scene_type in evaluate_scene_alerts(current_detections):
            dispatch_detection_action(frame_clean, scene_det, alert_type=scene_type)
            if scene_type == ALERT_TYPE_TAILGATING:
                put_cn_text(
                    frame, "警告：尾随闯入！", (16, 98), (0, 170, 255),
                    font_size=24, bg_color=(16, 20, 26), bg_alpha=0.75,
                )
            elif scene_type == ALERT_TYPE_LOITERING:
                put_cn_text(
                    frame, "警告：遮挡徘徊！", (16, 98), (200, 110, 255),
                    font_size=24, bg_color=(16, 20, 26), bg_alpha=0.75,
                )

        update_stream_frame(frame)
        if not HEADLESS:
            cv2.imshow("智能门禁告警系统 - 边缘节点", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                print("[INFO] 接收到退出指令，系统关闭...")
                running = False
                break
        else:
            time.sleep(0.03)

    frame_source.release()
    if not HEADLESS:
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
