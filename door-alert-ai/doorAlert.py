import cv2
import os
import time
import uuid
import threading
import traceback
from datetime import datetime

import requests
from ultralytics import YOLO

# ================= 全局配置项 =================
CONF_THRESHOLD = 0.5
INFERENCE_INTERVAL = float(os.environ.get("INFERENCE_INTERVAL", "0.15"))
BACKEND_UPLOAD_URL = os.environ.get(
    "BACKEND_UPLOAD_URL",
    "http://localhost:8081/api/alerts/upload",
)
DEVICE_ID = int(os.environ.get("DEVICE_ID", "1"))
HEADLESS = os.environ.get("HEADLESS", "0").strip() in ("1", "true", "yes")
VIDEO_LOOP = os.environ.get("VIDEO_LOOP", "1").strip() in ("1", "true", "yes")
HEARTBEAT_INTERVAL = float(os.environ.get("HEARTBEAT_INTERVAL", "10"))

# ================= 时间窗防抖（存储与算力流控） =================
COOL_DOWN_INTERVAL = 10  # 单位：秒
last_alert_time = 0


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

# 接近度阈值：低于此值仅预览，不触发告警流控
PROXIMITY_ALERT_THRESHOLD = 0.2


def send_heartbeat():
    """向云端上报设备存活心跳。"""
    try:
        response = requests.post(BACKEND_HEARTBEAT_URL, timeout=1.5)
        if response.status_code == 200:
            try:
                res_json = response.json()
                if res_json.get("code") == 200:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 心跳上报成功 deviceId={DEVICE_ID}")
                else:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 心跳上报被后端拒绝: {res_json.get('message')}")
            except ValueError:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] 心跳上报成功 deviceId={DEVICE_ID}")
        else:
            print(f"[WARN] 心跳上报失败 HTTP {response.status_code}")
    except Exception as exc:
        print(f"[WARN] 心跳上报异常: {exc}")


def heartbeat_loop():
    """后台线程：周期性发送心跳，维持大屏在线状态。"""
    while True:
        send_heartbeat()
        time.sleep(HEARTBEAT_INTERVAL)


def save_and_post_alert_async(frame, device_id, proximity_ratio, danger_level):
    """
    后台线程：写盘 + HTTP 推送。
    主循环严禁调用 cv2.imwrite / requests.post，所有阻塞 I/O 均在此完成。
    """
    temp_image_path = None
    try:
        temp_image_path = f"temp_capture_{uuid.uuid4().hex}.jpg"
        cv2.imwrite(temp_image_path, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] "
            f"告警图片已写入 {temp_image_path}（deviceId={device_id}），准备上报..."
        )

        payload = {
            "deviceId": device_id,
            "proximityRatio": float(proximity_ratio),
            "dangerLevel": int(danger_level),
        }

        with open(temp_image_path, "rb") as image_file:
            files = {
                "file": (os.path.basename(temp_image_path), image_file, "image/jpeg"),
            }
            response = requests.post(
                BACKEND_UPLOAD_URL,
                data=payload,
                files=files,
                timeout=1.5,
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
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] 异步告警线程异常（主监控不受影响）:")
        traceback.print_exc()
    finally:
        if temp_image_path and os.path.exists(temp_image_path):
            try:
                os.remove(temp_image_path)
            except OSError:
                pass


def audible_beep():
    """触发本地蜂鸣器（模拟）。"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [ALARM] 本地警报器触发：滴滴滴！")


def render_alert_capture(frame, x1, y1, x2, y2, confidence):
    """生成带红色告警框的上传用渲染图。"""
    annotated = frame.copy()
    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 4)

    label = f"Person: {confidence:.2f}"
    label_y = max(30, y1 - 12)
    cv2.putText(
        annotated, label, (x1, label_y),
        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2,
    )
    cv2.putText(
        annotated, "WARNING: TOO CLOSE", (40, 60),
        cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 255), 3,
    )
    return annotated


def draw_live_detection(frame, x1, y1, x2, y2, confidence, in_cooldown):
    """实时预览：冷却期内仅画红线框，不写盘、不上报。"""
    color = (0, 0, 255)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    cv2.putText(
        frame, f"Person: {confidence:.2f}", (x1, max(15, y1 - 10)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
    )
    if in_cooldown:
        cv2.putText(
            frame, "COOLDOWN", (x1, min(y2 + 20, frame.shape[0] - 10)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1,
        )


def resolve_video_source():
    """
    解析视频输入源，支持 Docker 多种部署方式：
    - VIDEO_SOURCE=0 / 1           → 物理摄像头索引
    - VIDEO_SOURCE=/app/demo/x.mp4 → 挂载的演示视频
    - VIDEO_SOURCE=/app/demo/x.jpg → 静态图片循环检测
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
            indices_to_try = [self.source] + [i for i in range(5) if i != self.source]

            for idx in indices_to_try:
                print(f"[INFO] 正在尝试打开摄像头索引: {idx}")
                if is_windows:
                    cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                    if cap.isOpened():
                        ret, frame = False, None
                        for _ in range(10):
                            ret, frame = cap.read()
                            if ret and frame is not None:
                                break
                            time.sleep(0.1)
                        if ret and frame is not None:
                            self.cap = cap
                            self.source = idx
                            self.api_preference = "DSHOW"
                            success = True
                            print(f"[INFO] 成功通过 DSHOW 打开并读取摄像头索引: {idx}")
                            break
                        cap.release()

                    cap = cv2.VideoCapture(idx)
                    if cap.isOpened():
                        ret, frame = False, None
                        for _ in range(10):
                            ret, frame = cap.read()
                            if ret and frame is not None:
                                break
                            time.sleep(0.1)
                        if ret and frame is not None:
                            self.cap = cap
                            self.source = idx
                            self.api_preference = "DEFAULT"
                            success = True
                            print(f"[INFO] 成功通过默认 API 打开并读取摄像头索引: {idx}")
                            break
                        cap.release()
                else:
                    cap = cv2.VideoCapture(idx)
                    if cap.isOpened():
                        ret, frame = False, None
                        for _ in range(10):
                            ret, frame = cap.read()
                            if ret and frame is not None:
                                break
                            time.sleep(0.1)
                        if ret and frame is not None:
                            self.cap = cap
                            self.source = idx
                            self.api_preference = "DEFAULT"
                            success = True
                            print(f"[INFO] 成功打开并读取摄像头索引: {idx}")
                            break
                        cap.release()

            if not success:
                if os.path.exists("demo/demo.jpg"):
                    print("[WARN] 无法打开任何摄像头，已自动降级至 demo/demo.jpg 进行图片演示模式运行")
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
        if self.mode == "image":
            return True, self.static_frame.copy()

        ret, frame = self.cap.read()
        if not ret or frame is None:
            if self.mode == "camera":
                print("[WARN] 摄像头读取帧失败，正在尝试重新连接摄像头...")
                self.cap.release()
                time.sleep(0.5)
                if self.api_preference == "DSHOW":
                    self.cap = cv2.VideoCapture(self.source, cv2.CAP_DSHOW)
                else:
                    self.cap = cv2.VideoCapture(self.source)

                if self.cap.isOpened():
                    for _ in range(5):
                        ret, frame = self.cap.read()
                        if ret and frame is not None:
                            print("[INFO] 摄像头重新连接并读取成功！")
                            return True, frame
                        time.sleep(0.1)

                print("[ERROR] 摄像头重连失败，临时展示演示图。")
                if os.path.exists("demo/demo.jpg"):
                    demo_img = cv2.imread("demo/demo.jpg")
                    if demo_img is not None:
                        return True, demo_img
                return False, None

            if self.mode == "file" and VIDEO_LOOP:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = self.cap.read()
        return ret, frame

    def release(self):
        if self.cap is not None:
            self.cap.release()

    def __del__(self):
        self.release()


def pick_primary_detection(detections):
    """选取当前帧中接近度最高、满足告警阈值的人员检测。"""
    best = None
    for det in detections:
        if det["proximity_ratio"] >= PROXIMITY_ALERT_THRESHOLD:
            if best is None or det["proximity_ratio"] > best["proximity_ratio"]:
                best = det
    return best


def main():
    global last_alert_time

    print("[INFO] 正在加载 YOLO 模型...")
    model = YOLO("yolov8m.pt")

    try:
        frame_source = FrameSource()
    except RuntimeError as exc:
        print(f"[ERROR] {exc}")
        return

    print(f"[INFO] 心跳地址: {BACKEND_HEARTBEAT_URL}，间隔 {HEARTBEAT_INTERVAL}s")
    print(f"[INFO] 告警冷却窗口: {COOL_DOWN_INTERVAL}s，上报地址: {BACKEND_UPLOAD_URL}")
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    send_heartbeat()

    latest_frame = None
    frame_lock = threading.Lock()
    active_detections = []
    detections_lock = threading.Lock()
    running = True
    last_inference_time = 0.0

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
                results = model(frame_to_process, conf=CONF_THRESHOLD, verbose=False)

                h, w = frame_to_process.shape[:2]
                frame_area = w * h
                new_detections = []

                for result in results:
                    for box in result.boxes:
                        cls_id = int(box.cls[0])
                        if cls_id == 0:
                            x1, y1, x2, y2 = map(int, box.xyxy[0])
                            confidence = float(box.conf[0])
                            bb_area = (x2 - x1) * (y2 - y1)
                            proximity_ratio = bb_area / frame_area
                            danger_level = 3 if proximity_ratio >= 0.4 else 2
                            new_detections.append({
                                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                                "confidence": confidence,
                                "proximity_ratio": proximity_ratio,
                                "danger_level": danger_level,
                            })

                with detections_lock:
                    active_detections = new_detections

            time.sleep(0.015)

    threading.Thread(target=yolo_inference_thread, daemon=True).start()

    while True:
        ret, frame = frame_source.read()
        if not ret:
            print("[ERROR] 无法读取视频帧！")
            break

        frame_clean = frame.copy()

        with frame_lock:
            latest_frame = frame_clean.copy()

        current_time = time.time()

        with detections_lock:
            current_detections = list(active_detections)

        primary_det = pick_primary_detection(current_detections)
        in_cooldown = False

        if primary_det is not None:
            x1, y1, x2, y2 = primary_det["x1"], primary_det["y1"], primary_det["x2"], primary_det["y2"]
            confidence = primary_det["confidence"]
            proximity_ratio = primary_det["proximity_ratio"]
            danger_level = primary_det["danger_level"]

            elapsed = current_time - last_alert_time
            in_cooldown = elapsed < COOL_DOWN_INTERVAL

            draw_live_detection(frame, x1, y1, x2, y2, confidence, in_cooldown)
            cv2.putText(
                frame, "WARNING: TOO CLOSE!", (50, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3,
            )

            if not in_cooldown:
                audible_beep()
                capture_frame = render_alert_capture(
                    frame_clean, x1, y1, x2, y2, confidence,
                )
                threading.Thread(
                    target=save_and_post_alert_async,
                    args=(capture_frame, DEVICE_ID, proximity_ratio, danger_level),
                    daemon=True,
                ).start()
                last_alert_time = current_time
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] "
                    f"触发告警流控：冷却 {COOL_DOWN_INTERVAL}s 已满足，后台异步写盘+上报"
                )
        else:
            for det in current_detections:
                draw_live_detection(
                    frame,
                    det["x1"], det["y1"], det["x2"], det["y2"],
                    det["confidence"],
                    in_cooldown=True,
                )

        if not HEADLESS:
            cv2.imshow("Intelligent Door Alert System - Edge Node", frame)
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
