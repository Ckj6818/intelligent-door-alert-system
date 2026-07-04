import cv2
import time
import requests
import threading
from datetime import datetime
from ultralytics import YOLO

# ================= 全局配置项 =================
CONF_THRESHOLD = 0.5   # YOLO 检测置信度阈值
# 端云协同上报配置
BACKEND_UPLOAD_URL = "http://localhost:8081/api/alerts/upload"  # 严格匹配后端接口
DEVICE_ID = 1          # 当前测试设备的固定编号

# ================= 防抖控制 =================
# 记录上一次上报时间戳，避免连续上报挤爆网络
LAST_UPLOAD_TIME = 0
# 限制上报间隔（单位：秒）
UPLOAD_COOLDOWN = 2.0  


def upload_alert_async(payload):
    """
    异步上传告警数据到云端的子线程任务。
    使用 timeout=2 防止阻塞，使用 try-except 防止程序崩溃。
    """
    try:
        # 发送 HTTP POST 请求
        response = requests.post(BACKEND_UPLOAD_URL, json=payload, timeout=2)
        if response.status_code == 200:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] 数据上报云端成功！响应: {response.json()}")
        else:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 数据上报云端失败，后端返回状态码: {response.status_code}")
    except requests.exceptions.RequestException as e:
        # 仅打印警告，严禁阻塞或抛出到主线程
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 数据上报云端失败，请检查后端服务是否启动或网络是否连通")


def audible_beep():
    """
    触发本地蜂鸣器（模拟）
    """
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [ALARM] 本地警报器触发：滴滴滴！")


def main():
    global LAST_UPLOAD_TIME

    print("[INFO] 正在加载 YOLO 模型...")
    model = YOLO("yolov8m.pt")
    
    print("[INFO] 正在开启摄像头...")
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("[ERROR] 无法打开摄像头！")
        return

    while True:
        ret, frame = cap.read()
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
                    # 提取边界框坐标 (x1, y1, x2, y2)
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    
                    # 计算目标检测框的面积
                    bb_area = (x2 - x1) * (y2 - y1)
                    # 计算目标距离摄像头的接近度（占比）
                    proximity_ratio = bb_area / frame_area
                    
                    # 绘制检测框和占比标签
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    label = f"Person: {proximity_ratio:.2f}"
                    cv2.putText(frame, label, (x1, max(15, y1 - 10)), 
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
                            
                            # 组装严格匹配 Java 端 AlertUploadDTO 的 Payload 字典
                            # 后端要求 proximityRatio 为 Double (此处传 float 即可), dangerLevel 为 Integer (0-3)
                            danger_level_int = 3 if proximity_ratio >= 0.4 else 2
                            payload = {
                                "deviceId": DEVICE_ID,
                                "proximityRatio": float(proximity_ratio),
                                "dangerLevel": danger_level_int,
                                "imageUrl": "local_cam_capture.jpg"  # 暂用占位符
                            }
                            
                            # 开启后台线程执行上报请求，绝不阻塞主视频流
                            threading.Thread(target=upload_alert_async, args=(payload,), daemon=True).start()
                            
                            # 更新最后上报时间戳
                            LAST_UPLOAD_TIME = current_time

        # 显示实时画面
        cv2.imshow("Intelligent Door Alert System - Edge Node", frame)

        # 按下 'q' 键退出循环
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("[INFO] 接收到退出指令，系统关闭...")
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
