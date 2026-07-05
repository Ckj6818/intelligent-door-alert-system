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


import os

def upload_alert_async(payload, image_path):
    """
    异步上传告警数据到云端的子线程任务。
    使用 multipart/form-data 上传图片及参数。
    """
    try:
        # 准备文件
        with open(image_path, 'rb') as f:
            files = {'file': (os.path.basename(image_path), f, 'image/jpeg')}
            # 发送 HTTP POST 请求
            response = requests.post(BACKEND_UPLOAD_URL, data=payload, files=files, timeout=5)
            
        if response.status_code == 200:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [INFO] 数据上报云端成功！响应: {response.json()}")
        else:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 数据上报云端失败，后端返回状态码: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [WARN] 数据上报云端失败，请检查后端服务是否启动或网络是否连通")
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [ERROR] 上报过程出现异常: {str(e)}")
    finally:
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
                            
                            # 保存当前视频帧为临时图片
                            temp_image_path = f"temp_capture_{int(current_time)}.jpg"
                            cv2.imwrite(temp_image_path, frame)
                            
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
