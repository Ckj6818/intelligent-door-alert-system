"""
Intelligent Door Alert — 边缘 AI 视觉检测节点

流水线：
  摄像头/视频帧 → YOLOv8m 行人检测 → 面积占比 R 门控
  →（R >= 0.2）人脸 ROI 特征提取与授权比对
  → UNAUTHORIZED：10s 冷却防抖告警上报
  → AUTHORIZED：通行日志上报（不上报告警工单）
"""

import os

os.environ["OPENCV_LOG_LEVEL"] = "ERROR"

import base64
import cv2
import time
import uuid
import threading
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import requests
from ultralytics import YOLO

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    Image = ImageDraw = ImageFont = None

# OpenCV 默认字体不支持中文，用系统字体绘制
_CN_FONT_PATHS = (
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
)
_cn_font_cache = {}


def _resolve_cn_font(size=22):
    if ImageFont is None:
        return None
    key = int(size)
    if key in _cn_font_cache:
        return _cn_font_cache[key]
    for path in _CN_FONT_PATHS:
        if os.path.isfile(path):
            try:
                font = ImageFont.truetype(path, key)
                _cn_font_cache[key] = font
                return font
            except OSError:
                continue
    _cn_font_cache[key] = None
    return None


def put_cn_text(img, text, org, color=(255, 255, 255), font_size=22, thickness=2):
    """
    在 BGR 图上绘制中文/英文混排文字。
    color 为 OpenCV BGR；失败时回退 cv2.putText（仅 ASCII 可见）。
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
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)
    draw = ImageDraw.Draw(pil_img)
    # PIL 用 RGB；基线约在文字底部，与 OpenCV putText 习惯对齐
    fill = (int(color[2]), int(color[1]), int(color[0]))
    draw.text((x, max(0, y - font_size)), str(text), font=font, fill=fill)
    img[:, :] = cv2.cvtColor(np.asarray(pil_img), cv2.COLOR_RGB2BGR)
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
# face_recognition 默认约 0.6；略严一点减少误授权
FACE_DISTANCE_THRESHOLD = float(os.environ.get("FACE_DISTANCE_THRESHOLD", "0.55"))
AUTHORIZED_FACES_DIR = os.environ.get("AUTHORIZED_FACES_DIR", "authorized_faces")
# 面积占比阈值：低于此值不做人脸推理、不触发告警
PROXIMITY_ALERT_THRESHOLD = float(os.environ.get("PROXIMITY_ALERT_THRESHOLD", "0.22"))
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
# SFace 余弦相似度阈值（OpenCV 推荐 0.363，越高越严）
SFACE_COSINE_THRESHOLD = float(os.environ.get("SFACE_COSINE_THRESHOLD", "0.363"))

_yunet_detector = None
_yunet_input_size = (0, 0)
_sface_recognizer = None
# sface | dlib；启动时按模型可用性自动选择
FACE_ENGINE = "dlib"

AUTH_STATUS_AUTHORIZED = "AUTHORIZED"
AUTH_STATUS_UNAUTHORIZED = "UNAUTHORIZED"
UNAUTHORIZED_DISPLAY_NAME = "未授权人员/陌生人"

# ================= 时间窗防抖（存储与算力流控） =================
COOL_DOWN_INTERVAL = 10  # 秒：未授权告警冷却
PASSAGE_LOG_INTERVAL = 10  # 秒：授权通行日志节流
last_alert_time = 0.0
last_passage_log_time = 0.0

# 人脸识别缓存 / 异步调度（线程间共享）
_face_cache_lock = threading.Lock()
_face_cache = {
    "cx": 0.0,
    "cy": 0.0,
    "ts": 0.0,
    "auth_status": None,
    "recognized_name": "",
    "face_distance": None,
}
_face_job_lock = threading.Lock()
_face_job = {
    "busy": False,
    "last_submit": 0.0,
}
_last_noface_log = 0.0


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


def _encoding_from_bgr(bgr, face_recognition=None):
    """
    与实时 recognize_face_in_roi 同一路径：头肩 ROI → YuNet → 特征。
    底库与摄像头必须走同一套，否则同人距离会虚高。
    """
    if bgr is None or bgr.size == 0:
        return None
    h, w = bgr.shape[:2]
    roi = _crop_face_roi(bgr, 0, 0, w, h)
    if roi is None:
        roi = bgr

    if FACE_ENGINE == "sface" or _get_sface_recognizer() is not None:
        feat = _sface_feature_from_bgr(roi)
        if feat is None:
            feat = _sface_feature_from_bgr(bgr)
        return feat

    if face_recognition is None:
        try:
            import face_recognition as face_recognition
        except ImportError:
            return None
    locs = _yunet_face_locations(roi)
    if not locs:
        locs = _yunet_face_locations(bgr)
        if locs:
            roi = bgr
    if not locs:
        return None
    rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
    return _encode_face_crop(rgb, locs[0], face_recognition)


def load_authorized_faces(folder=None):
    """
    系统启动时扫描 authorized_faces/，提取每人一张照片的特征向量。

    文件名（不含扩展名）作为已知用户姓名，例如「陈柯杰.jpg」→ 「陈柯杰」。
    返回:
        known_encodings (list[np.ndarray]): 特征向量列表
        known_names (list[str]): 与编码一一对应的姓名列表
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

    print(f"[INFO] 正在加载授权人脸库（共 {len(files)} 张照片）...")
    for file in files:
        filepath = os.path.join(folder, file)
        try:
            bgr = _imread_bgr(filepath)
            if bgr is None:
                print(f"  ✗ 无法读取: {file}")
                continue
            encoding = _encoding_from_bgr(bgr, face_recognition)
            if encoding is None and engine == "dlib" and face_recognition is not None:
                rgb = face_recognition.load_image_file(filepath)
                encs = face_recognition.face_encodings(rgb)
                encoding = encs[0] if encs else None
            if encoding is not None:
                known_encodings.append(encoding)
                name = os.path.splitext(file)[0]
                known_names.append(name)
                print(f"  ✓ 已加载: {name}")
            else:
                print(f"  ✗ 未检测到人脸: {file}（请更换清晰正脸照片）")
        except Exception as exc:
            print(f"  ✗ 加载失败: {file} -> {exc}")

    print(f"[INFO] 授权人脸库加载完成，共 {len(known_encodings)} 人")
    return known_encodings, known_names


def maybe_hot_reload_faces(known_encodings, known_names, state):
    """
    检测 authorized_faces/.reload 标记（后端新增人员时写入），原地热加载人脸库。
    state: dict，需包含键 last_reload_mtime
    """
    reload_flag = os.path.join(AUTHORIZED_FACES_DIR, ".reload")
    if not os.path.isfile(reload_flag):
        return
    try:
        mtime = os.path.getmtime(reload_flag)
        if mtime <= state.get("last_reload_mtime", 0):
            return
        enc, names = load_authorized_faces()
        known_encodings.clear()
        known_encodings.extend(enc)
        known_names.clear()
        known_names.extend(names)
        state["last_reload_mtime"] = mtime
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[INFO] 人脸库热加载完成，当前授权人员 {len(known_names)} 人: {known_names}"
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
        }


def _update_face_cache(cx, cy, result):
    """仅缓存已得到人脸特征的结论；未检出脸不写缓存，便于立刻重试。"""
    if not result or not result.get("face_found"):
        return
    auth = result.get("auth_status")
    if auth not in (AUTH_STATUS_AUTHORIZED, AUTH_STATUS_UNAUTHORIZED):
        return
    with _face_cache_lock:
        _face_cache["cx"] = cx
        _face_cache["cy"] = cy
        _face_cache["ts"] = time.time()
        _face_cache["auth_status"] = auth
        _face_cache["recognized_name"] = result.get("recognized_name", "")
        _face_cache["face_distance"] = result.get("face_distance")


def _apply_cache_to_detections(detections):
    """主循环立刻套用后台识别结果，不必等下一轮 YOLO。"""
    if not detections:
        return
    now = time.time()
    for det in detections:
        if det.get("area_ratio", 0) < PROXIMITY_ALERT_THRESHOLD:
            continue
        if det.get("auth_status") in (AUTH_STATUS_AUTHORIZED, AUTH_STATUS_UNAUTHORIZED):
            continue
        cx, cy = _bbox_center(det["x1"], det["y1"], det["x2"], det["y2"])
        cached = _cache_hit(cx, cy, now)
        if cached is None:
            continue
        det["auth_status"] = cached["auth_status"]
        det["recognized_name"] = cached["recognized_name"]
        det["face_distance"] = cached["face_distance"]
        if det["auth_status"] == AUTH_STATUS_AUTHORIZED:
            det["danger_level"] = 0
        else:
            det["danger_level"] = 3 if det["area_ratio"] >= 0.3 else 2


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
    """OpenCV 5 YuNet 人脸检测器（比 dlib HOG 快一个数量级）。"""
    global _yunet_detector, _yunet_input_size
    if not os.path.isfile(YUNET_MODEL_PATH):
        return None
    if _yunet_detector is None:
        try:
            _yunet_detector = cv2.FaceDetectorYN.create(
                YUNET_MODEL_PATH,
                "",
                (input_w, input_h),
                0.65,  # score threshold
                0.3,   # nms
                5000,
            )
            _yunet_input_size = (input_w, input_h)
            print(f"[INFO] YuNet 人脸检测已加载: {YUNET_MODEL_PATH}")
        except Exception as exc:
            print(f"[WARN] YuNet 加载失败: {exc}")
            _yunet_detector = None
            return None
    elif _yunet_input_size != (input_w, input_h):
        try:
            _yunet_detector.setInputSize((input_w, input_h))
            _yunet_input_size = (input_w, input_h)
        except Exception as exc:
            print(f"[WARN] YuNet setInputSize 失败: {exc}")
    return _yunet_detector


def _get_sface_recognizer():
    """OpenCV SFace 特征提取（比 dlib 编码快数倍）。"""
    global _sface_recognizer
    if _sface_recognizer is not None:
        return _sface_recognizer
    if not os.path.isfile(SFACE_MODEL_PATH):
        return None
    try:
        _sface_recognizer = cv2.FaceRecognizerSF.create(SFACE_MODEL_PATH, "")
        print(f"[INFO] SFace 人脸识别已加载: {SFACE_MODEL_PATH}")
    except Exception as exc:
        print(f"[WARN] SFace 加载失败: {exc}")
        _sface_recognizer = None
    return _sface_recognizer


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


def _sface_feature_from_bgr(bgr_roi):
    """YuNet 定位 + SFace 对齐提特征，失败返回 None。"""
    recognizer = _get_sface_recognizer()
    if recognizer is None or bgr_roi is None or bgr_roi.size == 0:
        return None
    face_row = _yunet_best_face_row(bgr_roi)
    if face_row is None:
        return None
    try:
        aligned = recognizer.alignCrop(bgr_roi, face_row)
        if aligned is None or aligned.size == 0:
            return None
        feat = recognizer.feature(aligned)
        return np.asarray(feat, dtype=np.float64).reshape(-1)
    except Exception:
        return None


def _match_encoding(encoding, known_encodings, known_names):
    if FACE_ENGINE == "sface":
        known = np.asarray(known_encodings, dtype=np.float64)
        vec = np.asarray(encoding, dtype=np.float64).reshape(-1)
        # 余弦相似度：越高越像；距离用 1-sim 便于日志与阈值
        kn = np.linalg.norm(known, axis=1)
        vn = float(np.linalg.norm(vec))
        sims = (known @ vec) / np.maximum(kn * max(vn, 1e-8), 1e-8)
        best_idx = int(np.argmax(sims))
        best_sim = float(sims[best_idx])
        best_distance = 1.0 - best_sim
        authorized = best_sim >= SFACE_COSINE_THRESHOLD
    else:
        distances = face_distance_np(known_encodings, encoding)
        best_idx = int(np.argmin(distances))
        best_distance = float(distances[best_idx])
        authorized = best_distance < FACE_DISTANCE_THRESHOLD
        best_sim = None

    if authorized:
        return {
            "auth_status": AUTH_STATUS_AUTHORIZED,
            "recognized_name": known_names[best_idx],
            "face_distance": best_distance,
            "face_found": True,
            "face_similarity": best_sim,
        }
    return {
        "auth_status": AUTH_STATUS_UNAUTHORIZED,
        "recognized_name": UNAUTHORIZED_DISPLAY_NAME,
        "face_distance": best_distance,
        "face_found": True,
        "face_similarity": best_sim if FACE_ENGINE == "sface" else None,
    }


def face_distance_np(known_encodings, encoding):
    """本地欧氏距离，避免每次 import face_recognition.face_distance。"""
    return np.linalg.norm(np.asarray(known_encodings) - encoding, axis=1)


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
    人体上半身 ROI → YuNet 定位 → SFace（优先）或 dlib 编码比对。
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

    if not known_encodings:
        return unauthorized

    roi = _crop_face_roi(frame_bgr, x1, y1, x2, y2)
    if roi is None:
        return pending

    try:
        t0 = time.perf_counter()
        method = FACE_ENGINE if FACE_ENGINE != "none" else "yunet"
        encoding = None

        # 1) SFace 主路径（快）
        if FACE_ENGINE == "sface" or _get_sface_recognizer() is not None:
            method = "sface"
            encoding = _sface_feature_from_bgr(roi)

        # 2) dlib 回退
        if encoding is None and FACE_ENGINE != "sface":
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
        extra = (
            f" 相似度={sim:.3f}"
            if isinstance(sim, float)
            else f" 距离={result.get('face_distance')}"
        )
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"人脸识别 {ms:.0f}ms ({method}) | "
            f"{'已授权' if result['auth_status'] == AUTH_STATUS_AUTHORIZED else '未授权'} |"
            f"{extra}"
        )
        return result
    except Exception as exc:
        print(f"[WARN] 人脸识别异常（保持识别中）: {exc}")
        return pending


def _run_face_job(frame_bgr, x1, y1, x2, y2, known_encodings, known_names, cx, cy):
    """后台线程执行人脸比对，写缓存，不阻塞 YOLO/预览。"""
    try:
        result = recognize_face_in_roi(
            frame_bgr, x1, y1, x2, y2, known_encodings, known_names
        )
        _update_face_cache(cx, cy, result)
    finally:
        with _face_job_lock:
            _face_job["busy"] = False


def schedule_face_recognition(frame_bgr, det, known_encodings, known_names):
    """
    对接近度最高的目标异步做人脸识别。
    有缓存则直接填回 det；无缓存时保持 auth_status=None（识别中），不误报未授权。
    """
    cx, cy = _bbox_center(det["x1"], det["y1"], det["x2"], det["y2"])
    now = time.time()
    cached = _cache_hit(cx, cy, now)
    if cached is not None:
        det["auth_status"] = cached["auth_status"]
        det["recognized_name"] = cached["recognized_name"]
        det["face_distance"] = cached["face_distance"]
        return

    # 识别中：不占位 UNAUTHORIZED，避免 4~5s 误报与“很慢才认出”
    det["auth_status"] = None
    det["recognized_name"] = ""
    det["face_distance"] = None

    with _face_job_lock:
        busy = _face_job["busy"]
        due = (now - _face_job["last_submit"]) >= FACE_CHECK_INTERVAL
        if busy or not due:
            return
        _face_job["busy"] = True
        _face_job["last_submit"] = now

    frame_copy = frame_bgr.copy()
    threading.Thread(
        target=_run_face_job,
        args=(
            frame_copy,
            det["x1"], det["y1"], det["x2"], det["y2"],
            known_encodings, known_names, cx, cy,
        ),
        daemon=True,
    ).start()


def build_person_detection(frame_bgr, x1, y1, x2, y2, confidence, frame_area,
                           known_encodings, known_names, run_face=False):
    """
    由单个 YOLO person 框构建检测结果。
    run_face=True 时仅对主目标调度异步人脸识别（带缓存）。
    """
    bb_area = max(0, (x2 - x1) * (y2 - y1))
    area_ratio = bb_area / frame_area if frame_area > 0 else 0.0

    det = {
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "confidence": confidence,
        "area_ratio": area_ratio,
        "proximity_ratio": area_ratio,
        "auth_status": None,
        "recognized_name": "",
        "face_distance": None,
        "danger_level": 0,
    }

    if area_ratio < PROXIMITY_ALERT_THRESHOLD:
        return det

    if run_face:
        schedule_face_recognition(frame_bgr, det, known_encodings, known_names)
    else:
        # 非主目标：尽量复用缓存，避免重复算力
        cx, cy = _bbox_center(x1, y1, x2, y2)
        cached = _cache_hit(cx, cy, time.time())
        if cached is not None:
            det["auth_status"] = cached["auth_status"]
            det["recognized_name"] = cached["recognized_name"]
            det["face_distance"] = cached["face_distance"]

    if det["auth_status"] == AUTH_STATUS_AUTHORIZED:
        det["danger_level"] = 0
    elif det["auth_status"] == AUTH_STATUS_UNAUTHORIZED:
        det["danger_level"] = 3 if area_ratio >= 0.3 else 2

    return det


# =====================================================================
#  心跳 / 上报
# =====================================================================

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
                body = b'{"ok":true,"stream":"/video"}'
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
    """向云端上报设备存活心跳（仅保活，不处理门锁指令）。"""
    try:
        response = requests.post(BACKEND_HEARTBEAT_URL, timeout=1.5)
        if response.status_code == 200:
            try:
                res_json = response.json()
                if res_json.get("code") == 200:
                    print(
                        f"[{datetime.now().strftime('%H:%M:%S')}] "
                        f"心跳上报成功 deviceId={DEVICE_ID}"
                    )
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


def frame_to_jpeg_base64(frame, quality=75):
    """将 BGR 帧编码为 JPEG Base64 字符串（不含 data: 前缀）。"""
    ok, buf = cv2.imencode(
        ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    )
    if not ok:
        raise RuntimeError("JPEG 编码失败")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def build_alert_payload(frame, device_id, area_ratio, auth_status, recognized_name,
                        danger_level):
    """
    构造上报 JSON（规格字段）+ 后端兼容字段。

    规格字段:
      auth_status / recognized_name / area_ratio / snapshot_base64
    兼容字段（现有 Spring Boot multipart 接口）:
      deviceId / proximityRatio / dangerLevel / recognizedName
    """
    snapshot_b64 = frame_to_jpeg_base64(frame)
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
    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] "
        f"[通行] 身份识别通过 | 姓名={det.get('recognized_name')} | "
        f"状态=已授权 | "
        f"面积比={det.get('area_ratio', 0):.3f} | 人脸距离={dist_txt}"
    )
    capture_frame = render_alert_capture(
        frame_clean,
        det["x1"], det["y1"], det["x2"], det["y2"],
        det["confidence"],
        auth_status=AUTH_STATUS_AUTHORIZED,
        recognized_name=det.get("recognized_name", ""),
    )
    threading.Thread(
        target=save_and_post_alert_async,
        args=(
            capture_frame,
            DEVICE_ID,
            det["area_ratio"],
            0,
            AUTH_STATUS_AUTHORIZED,
            det.get("recognized_name", ""),
        ),
        daemon=True,
    ).start()


def save_and_post_alert_async(frame, device_id, area_ratio, danger_level,
                              auth_status, recognized_name):
    """
    后台线程：编码抓拍 + HTTP 推送未授权告警。

    主循环严禁调用 cv2.imwrite / requests.post，所有阻塞 I/O 均在此完成。
    同时发送：
      1) multipart/form-data（兼容现有 /api/alerts/upload）
      2) JSON 规格字段写入 form，便于后端扩展读取
    """
    temp_image_path = None
    try:
        payload = build_alert_payload(
            frame, device_id, area_ratio, auth_status, recognized_name, danger_level
        )

        # 控制台打印时省略超长 base64
        preview = {
            k: (v[:48] + "...") if k == "snapshot_base64" and isinstance(v, str) else v
            for k, v in payload.items()
        }
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"告警 JSON 就绪: {preview}"
        )

        temp_image_path = f"temp_capture_{uuid.uuid4().hex}.jpg"
        cv2.imwrite(temp_image_path, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])

        form_data = {
            "deviceId": str(payload["deviceId"]),
            "proximityRatio": str(payload["proximityRatio"]),
            "dangerLevel": str(payload["dangerLevel"]),
            "recognizedName": payload["recognizedName"],
            "authStatus": payload["authStatus"],
            "auth_status": payload["auth_status"],
            "recognized_name": payload["recognized_name"],
            "area_ratio": str(payload["area_ratio"]),
            "snapshot_base64": payload["snapshot_base64"],
        }

        with open(temp_image_path, "rb") as image_file:
            files = {
                "file": (os.path.basename(temp_image_path), image_file, "image/jpeg"),
            }
            response = requests.post(
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

    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[WARN] 后端未启动或网络中断，本地监控继续运行: {exc}"
        )
    except requests.exceptions.RequestException as exc:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[WARN] 告警 HTTP 请求异常: {exc}"
        )
    except Exception:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"[ERROR] 异步告警线程异常（主监控不受影响）:"
        )
        traceback.print_exc()
    finally:
        if temp_image_path and os.path.exists(temp_image_path):
            try:
                os.remove(temp_image_path)
            except OSError:
                pass


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

    if is_auth:
        color = (0, 200, 0)
        label = f"已授权：{recognized_name} ({confidence:.2f})"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 4)
        put_cn_text(annotated, label, (x1, max(30, y1 - 8)), color, font_size=24)
    else:
        color = (0, 0, 255)
        label = f"未授权 ({confidence:.2f})"
        if recognized_name:
            label = f"{recognized_name} ({confidence:.2f})"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 4)
        put_cn_text(annotated, label, (x1, max(30, y1 - 8)), (0, 255, 0), font_size=24)
        put_cn_text(
            annotated, "警告：未授权人员！", (40, 60), (0, 0, 255), font_size=32,
        )
    return annotated


def draw_live_detection(frame, x1, y1, x2, y2, confidence, in_cooldown,
                        auth_status=None, recognized_name="", area_ratio=0.0):
    """实时预览绘制：授权绿框，未授权红框，识别中黄框，远处灰框。"""
    if auth_status == AUTH_STATUS_AUTHORIZED:
        color = (0, 200, 0)
        label = f"{recognized_name} ({confidence:.2f})"
    elif auth_status == AUTH_STATUS_UNAUTHORIZED:
        color = (0, 0, 255)
        label = f"陌生人 ({confidence:.2f})"
        if recognized_name:
            label = f"{recognized_name} ({confidence:.2f})"
    elif area_ratio >= PROXIMITY_ALERT_THRESHOLD:
        color = (0, 200, 255)
        label = f"识别中… 占比={area_ratio:.2f}"
    else:
        # 未触发人脸比对（R 过小）
        color = (180, 180, 180)
        label = f"行人 占比={area_ratio:.2f} ({confidence:.2f})"

    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    put_cn_text(frame, label, (x1, max(18, y1 - 6)), color, font_size=20)
    if in_cooldown and auth_status == AUTH_STATUS_UNAUTHORIZED:
        put_cn_text(
            frame, "冷却中",
            (x1, min(y2 + 22, frame.shape[0] - 8)),
            color, font_size=18,
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
    """
    选取当前帧中面积占比最高、且接近度达阈值的人员（含识别中）。
    """
    best = None
    for det in detections:
        if det["area_ratio"] >= PROXIMITY_ALERT_THRESHOLD:
            if best is None or det["area_ratio"] > best["area_ratio"]:
                best = det
    return best


def dispatch_detection_action(frame_clean, det):
    """
    根据身份识别结果分发动作：
      - AUTHORIZED  → 通行日志上报
      - UNAUTHORIZED → 10s 冷却后异步告警上报
    返回: True 表示本次触发了告警上报（用于更新冷却计时）
    """
    global last_alert_time

    auth_status = det.get("auth_status")
    if auth_status == AUTH_STATUS_AUTHORIZED:
        log_authorized_passage(frame_clean, det)
        return False

    if auth_status != AUTH_STATUS_UNAUTHORIZED:
        return False

    if det["area_ratio"] < PROXIMITY_ALERT_THRESHOLD:
        return False

    now = time.time()
    if now - last_alert_time < COOL_DOWN_INTERVAL:
        return False

    audible_beep()
    capture_frame = render_alert_capture(
        frame_clean,
        det["x1"], det["y1"], det["x2"], det["y2"],
        det["confidence"],
        auth_status=auth_status,
        recognized_name=det.get("recognized_name", UNAUTHORIZED_DISPLAY_NAME),
    )
    threading.Thread(
        target=save_and_post_alert_async,
        args=(
            capture_frame,
            DEVICE_ID,
            det["area_ratio"],
            det["danger_level"],
            auth_status,
            det.get("recognized_name", UNAUTHORIZED_DISPLAY_NAME),
        ),
        daemon=True,
    ).start()
    last_alert_time = now
    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] "
        f"告警上报触发: auth_status={auth_status}, "
        f"name={det.get('recognized_name')}, "
        f"area_ratio={det['area_ratio']:.3f}, danger={det['danger_level']}"
    )
    return True


# =====================================================================
#  主流程
# =====================================================================

def main():
    global last_alert_time

    yolo_device = resolve_yolo_device()
    print(f"[INFO] 正在加载 YOLO 模型: {YOLO_WEIGHTS} (device={yolo_device}) ...")
    model = YOLO(YOLO_WEIGHTS)
    try:
        model.to(yolo_device)
    except Exception as exc:
        print(f"[WARN] model.to({yolo_device}) 失败，将在推理时指定 device: {exc}")

    # ===== 预加载授权人脸库（128 维特征缓存，支持 .reload 热更新） =====
    known_encodings, known_names = load_authorized_faces()
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
        f"缓存={FACE_CACHE_TTL}s, ROI<={FACE_ROI_MAX_SIDE}"
    )
    if FACE_ENGINE == "sface":
        thr_desc = f"余弦阈值>={SFACE_COSINE_THRESHOLD}"
    else:
        thr_desc = f"距离阈值={FACE_DISTANCE_THRESHOLD}"
    print(
        f"[INFO] 人脸门控: engine={FACE_ENGINE}, R>={PROXIMITY_ALERT_THRESHOLD}, "
        f"{thr_desc}, 授权人员={len(known_encodings)} 人"
    )
    print("[INFO] 支持管理端新增后热加载（检测 authorized_faces/.reload）")
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

                # 仅检 person；GPU/CPU 由 yolo_device 指定
                results = model(
                    infer_frame,
                    conf=CONF_THRESHOLD,
                    imgsz=YOLO_IMGSZ,
                    classes=[0],
                    device=yolo_device,
                    verbose=False,
                )

                h, w = frame_to_process.shape[:2]
                frame_area = w * h
                inv = (1.0 / scale) if scale > 0 else 1.0
                candidates = []

                for result in results:
                    for box in result.boxes:
                        x1, y1, x2, y2 = map(float, box.xyxy[0])
                        if scale != 1.0:
                            x1, y1, x2, y2 = x1 * inv, y1 * inv, x2 * inv, y2 * inv
                        x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
                        confidence = float(box.conf[0])
                        area_ratio = max(0, (x2 - x1) * (y2 - y1)) / frame_area
                        candidates.append((area_ratio, x1, y1, x2, y2, confidence))

                # 只对面积最大的接近目标做人脸调度，其余复用缓存
                primary_idx = -1
                best_r = -1.0
                for i, (r, *_rest) in enumerate(candidates):
                    if r >= PROXIMITY_ALERT_THRESHOLD and r > best_r:
                        best_r = r
                        primary_idx = i

                new_detections = []
                for i, (area_ratio, x1, y1, x2, y2, confidence) in enumerate(candidates):
                    det = build_person_detection(
                        frame_to_process,
                        x1, y1, x2, y2,
                        confidence,
                        frame_area,
                        known_encodings,
                        known_names,
                        run_face=(i == primary_idx),
                    )
                    new_detections.append(det)

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
        results = model(
            frame,
            conf=CONF_THRESHOLD,
            imgsz=YOLO_IMGSZ,
            classes=[0],
            device=yolo_device,
            verbose=False,
        )
        h, w = frame.shape[:2]
        frame_area = w * h
        demo_candidates = []
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confidence = float(box.conf[0])
                area_ratio = max(0, (x2 - x1) * (y2 - y1)) / frame_area
                demo_candidates.append((area_ratio, x1, y1, x2, y2, confidence))

        primary_idx = -1
        best_r = -1.0
        for i, (r, *_rest) in enumerate(demo_candidates):
            if r >= PROXIMITY_ALERT_THRESHOLD and r > best_r:
                best_r = r
                primary_idx = i

        for i, (_r, x1, y1, x2, y2, confidence) in enumerate(demo_candidates):
            # 演示模式同步识别一次，确保立刻有结果
            if i == primary_idx:
                det = {
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "confidence": confidence,
                    "area_ratio": _r,
                    "proximity_ratio": _r,
                    "auth_status": None,
                    "recognized_name": "",
                    "face_distance": None,
                    "danger_level": 0,
                }
                if _r >= PROXIMITY_ALERT_THRESHOLD:
                    face_result = recognize_face_in_roi(
                        frame, x1, y1, x2, y2, known_encodings, known_names
                    )
                    det["auth_status"] = face_result.get("auth_status")
                    det["recognized_name"] = face_result.get("recognized_name", "")
                    det["face_distance"] = face_result.get("face_distance")
                    cx, cy = _bbox_center(x1, y1, x2, y2)
                    _update_face_cache(cx, cy, face_result)
                    if det["auth_status"] == AUTH_STATUS_AUTHORIZED:
                        det["danger_level"] = 0
                    elif det["auth_status"] == AUTH_STATUS_UNAUTHORIZED:
                        det["danger_level"] = 3 if _r >= 0.3 else 2
                demo_detections.append(det)
            else:
                demo_detections.append(
                    build_person_detection(
                        frame, x1, y1, x2, y2, confidence, frame_area,
                        known_encodings, known_names, run_face=False,
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
            for det in demo_detections:
                draw_live_detection(
                    display,
                    det["x1"], det["y1"], det["x2"], det["y2"],
                    det["confidence"],
                    in_cooldown=demo_alert_sent,
                    auth_status=det.get("auth_status"),
                    recognized_name=det.get("recognized_name", ""),
                    area_ratio=det.get("area_ratio", 0.0),
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

    while True:
        # 管理端新增授权人员后热加载人脸库
        maybe_hot_reload_faces(known_encodings, known_names, face_reload_state)

        ret, frame, is_fallback = frame_source.read()
        if not ret:
            print("[ERROR] 无法读取视频帧！")
            break

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

        primary_det = pick_primary_detection(current_detections)
        in_cooldown = (current_time - last_alert_time) < COOL_DOWN_INTERVAL

        if primary_det is not None:
            draw_live_detection(
                frame,
                primary_det["x1"], primary_det["y1"],
                primary_det["x2"], primary_det["y2"],
                primary_det["confidence"],
                in_cooldown=in_cooldown,
                auth_status=primary_det.get("auth_status"),
                recognized_name=primary_det.get("recognized_name", ""),
                area_ratio=primary_det.get("area_ratio", 0.0),
            )

            if primary_det.get("auth_status") == AUTH_STATUS_UNAUTHORIZED:
                put_cn_text(
                    frame, "警告：未授权人员！", (50, 50), (0, 0, 255), font_size=34,
                )

            # 仅在已有明确结论时动作：授权通行 / 未授权告警（识别中不告警）
            if primary_det.get("auth_status") in (
                AUTH_STATUS_AUTHORIZED,
                AUTH_STATUS_UNAUTHORIZED,
            ):
                if (
                    not in_cooldown
                    or primary_det.get("auth_status") == AUTH_STATUS_AUTHORIZED
                ):
                    dispatch_detection_action(frame_clean, primary_det)
        else:
            for det in current_detections:
                draw_live_detection(
                    frame,
                    det["x1"], det["y1"], det["x2"], det["y2"],
                    det["confidence"],
                    in_cooldown=True,
                    auth_status=det.get("auth_status"),
                    recognized_name=det.get("recognized_name", ""),
                    area_ratio=det.get("area_ratio", 0.0),
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
