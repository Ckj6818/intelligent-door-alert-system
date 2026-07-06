import cv2
import os
import time
import requests
import threading
from datetime import datetime
from ultralytics import YOLO

# ================= 全局配置项 =================
CONF_THRESHOLD = 0.5   # YOLO 检测置信度阈值
# 端云协同上报配置（支持 Docker 环境变量覆盖）
BACKEND_UPLOAD_URL = os.environ.get(
    "BACKEND_UPLOAD_URL",
    "http://localhost:8081/api/alerts/upload",
)
DEVICE_ID = int(os.environ.get("DEVICE_ID", "1"))  # 当前测试设备的固定编号
HEADLESS = os.environ.get("HEADLESS", "0").strip() in ("1", "true", "yes")
VIDEO_LOOP = os.environ.get("VIDEO_LOOP", "1").strip() in ("1", "true", "yes")
HEARTBEAT_INTERVAL = float(os.environ.get("HEARTBEAT_INTERVAL", "10"))


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

# ================= 状态机与防抖控制 =================
# 记录上一次上报时间戳，避免连续上报挤爆网络
LAST_UPLOAD_TIME = 0
# 限制上报间隔（单位：秒）
UPLOAD_COOLDOWN = 2.0

# 状态机追踪
BACKEND_ONLINE = True          # 默认后端在线
FAILED_COUNTER = 0             # 连续失败计数器
MAX_FAILED_ATTEMPTS = 3        # 最大连续失败次数


import traceback

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


def upload_alert_async(payload, image_path):
    """
    异步上传告警数据到云端的子线程任务。
    使用 multipart/form-data 上传图片及参数。
    支持断网降级与自动恢复模式，保障边缘端检测稳定性。
    """
    global BACKEND_ONLINE, FAILED_COUNTER, UPLOAD_COOLDOWN

    success = False
    response = None
    try:
        # 准备文件
        with open(image_path, 'rb') as f:
            files = {'file': (os.path.basename(image_path), f, 'image/jpeg')}
            # 发送 HTTP POST 请求，超时严格控制在 1.5 秒以内，防止阻塞线程
            response = requests.post(BACKEND_UPLOAD_URL, data=payload, files=files, timeout=1.5)
            
        # 不论成功还是失败，只要有响应，强制打印后端的响应状态和内容
        if response is not None:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 云端响应状态码: {response.status_code}, 响应内容: {response.text}")
            
            if response.status_code == 200:
                success = True
                if not BACKEND_ONLINE:
                    # 绿色高亮打印自动恢复在线模式
                    print(f"\033[1;32m[{datetime.now().strftime('%H:%M:%S')}] [INFO] 检测到云端网络已恢复，自动切换回在线模式！\033[0m")
                else:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] 数据上报云端成功！")
                
                # 网络正常时重置计数器和防抖时长
                FAILED_COUNTER = 0
                BACKEND_ONLINE = True
                UPLOAD_COOLDOWN = 2.0
                send_heartbeat()
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 数据上报云端失败，非200状态码")
                
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 数据上报网络异常(超时/连接断开): {e}")
    except requests.exceptions.RequestException as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 数据上报云端失败(网络/请求异常): {e}")
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] 上报过程出现未知异常:")
        traceback.print_exc()
    finally:
        # 如果上报失败，触发降级计数和防抖拉长控制
        if not success:
            FAILED_COUNTER += 1
            # 黄色高亮打印连续失败计数
            print(f"\033[1;33m[{datetime.now().strftime('%H:%M:%S')}] [WARN] 告警上报失败，连续失败次数: {FAILED_COUNTER}\033[0m")
            if FAILED_COUNTER >= MAX_FAILED_ATTEMPTS:
                if BACKEND_ONLINE:
                    BACKEND_ONLINE = False
                    # 红色高亮打印进入降级模式
                    print(f"\033[1;31m[{datetime.now().strftime('%H:%M:%S')}] [ERROR] 连续失败次数达到上限，系统切换至“本地降级模式”（拉长防抖时间到 10 秒）\033[0m")
                    UPLOAD_COOLDOWN = 10.0

        # 上报完成后，清理临时图片文件
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except:
                pass


def audible_beep():
    """
    触发本地蜂鸣器（模拟）
    """
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [ALARM] 本地警报器触发：滴滴滴！")


def render_alert_capture(frame, x1, y1, x2, y2, confidence, proximity_ratio):
    """
    在抓拍图上绘制 YOLO 边界框、置信度与告警文本，生成用于上传的渲染图。
    """
    annotated = frame.copy()

    # 红色加粗边界框，突出告警目标
    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 4)

    # 边界框上方：类别 + 置信度
    label = f"Person: {confidence:.2f}"
    label_y = max(30, y1 - 12)
    cv2.putText(
        annotated, label, (x1, label_y),
        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2
    )

    # 红色警告文本
    cv2.putText(
        annotated, "WARNING: TOO CLOSE", (40, 60),
        cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 255), 3
    )

    return annotated


def resolve_video_source():
    """
    解析视频输入源，支持 Docker 多种部署方式：
    - VIDEO_SOURCE=0 / 1           → 物理摄像头索引（Linux 容器需映射 /dev/video0）
    - VIDEO_SOURCE=/app/demo/x.mp4 → 挂载的演示视频（Windows Docker 推荐）
    - VIDEO_SOURCE=/app/demo/x.jpg → 静态图片循环检测（无摄像头时的答辩演示）
    未设置时回退到 CAMERA_INDEX（默认 0）。
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

        if self.mode == "image":
            self.static_frame = cv2.imread(self.source)
            if self.static_frame is None:
                raise RuntimeError(f"无法读取演示图片: {self.source}")
            print(f"[INFO] 图片演示模式: {self.source}")
            return

        print(f"[INFO] 打开视频源 ({self.mode}): {self.source}")
        self.cap = cv2.VideoCapture(self.source)
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
        if not ret and self.mode == "file" and VIDEO_LOOP:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()
        return ret, frame

    def release(self):
        if self.cap is not None:
            self.cap.release()


def main():
    global LAST_UPLOAD_TIME

    print("[INFO] 正在加载 YOLO 模型...")
    model = YOLO("yolov8m.pt")

    try:
        frame_source = FrameSource()
    except RuntimeError as exc:
        print(f"[ERROR] {exc}")
        return

    print(f"[INFO] 心跳地址: {BACKEND_HEARTBEAT_URL}，间隔 {HEARTBEAT_INTERVAL}s")
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    send_heartbeat()

    while True:
        ret, frame = frame_source.read()
        if not ret:
            print("[ERROR] 无法读取视频帧！")
            break

        # 获取当前帧的宽、高及面积
        h, w = frame.shape[:2]
        frame_area = w * h

        # 执行推理，并设置阈值
        results = model(frame, conf=CONF_THRESHOLD, verbose=False)
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                # 提取检测框类别 (COCO数据集中 0 是 'person')
                cls_id = int(box.cls[0])
                if cls_id == 0:
                    # 提取边界框坐标 (x1, y1, x2, y2) 与置信度
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    confidence = float(box.conf[0])
                    
                    # 计算目标检测框的面积
                    bb_area = (x2 - x1) * (y2 - y1)
                    # 计算目标距离摄像头的接近度（占比）
                    proximity_ratio = bb_area / frame_area
                    
                    # 实时预览：绘制检测框和标签
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    preview_label = f"Person: {confidence:.2f}"
                    cv2.putText(frame, preview_label, (x1, max(15, y1 - 10)), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    
                    # 判断目标是否过近 (close = True)
                    # 假设当人占画面比例超过 0.2 时，判定为危险靠近
                    close = proximity_ratio > 0.2
                    
                    if close:
                        # --- 1. 触发本地警报 ---
                        cv2.putText(frame, "WARNING: TOO CLOSE!", (50, 50), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
                        
                        # --- 2. 准备端云数据上报 ---
                        current_time = time.time()
                        
                        # 加入防抖控制：仅在超过冷却时间后才上报
                        if current_time - LAST_UPLOAD_TIME > UPLOAD_COOLDOWN:
                            audible_beep()
                            
                            # 生成带边界框与告警文字的渲染图，再保存上传
                            capture_frame = render_alert_capture(
                                frame, x1, y1, x2, y2, confidence, proximity_ratio
                            )
                            temp_image_path = f"temp_capture_{int(current_time)}.jpg"
                            cv2.imwrite(temp_image_path, capture_frame)
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] 图片抓拍成功，准备上传...")
                            
                            # 组装参数 payload，移除 imageUrl（将由文件形式上传）
                            danger_level_int = 3 if proximity_ratio >= 0.4 else 2
                            payload = {
                                "deviceId": DEVICE_ID,
                                "proximityRatio": float(proximity_ratio),
                                "dangerLevel": danger_level_int
                            }
                            
                            # 开启后台线程执行上报请求，绝不阻塞主视频流
                            threading.Thread(target=upload_alert_async, args=(payload, temp_image_path), daemon=True).start()
                            
                            # 更新最后上报时间戳
                            LAST_UPLOAD_TIME = current_time

        # 显示实时画面（无 GUI 的容器环境可设置 HEADLESS=1 跳过）
        if not HEADLESS:
            cv2.imshow("Intelligent Door Alert System - Edge Node", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("[INFO] 接收到退出指令，系统关闭...")
                break
        else:
            time.sleep(0.01)

    frame_source.release()
    if not HEADLESS:
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
