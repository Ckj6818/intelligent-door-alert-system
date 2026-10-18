"""
边缘推理基准测试：对比 YOLOv8n FP32 / FP16（仅 CUDA）以及 YOLO + YuNet/SFace 管线耗时。

用法:
  python benchmark.py --source demo/test.mp4 --frames 500 --out benchmark_report.csv
  python benchmark.py --source 0 --frames 200

无 GPU 时自动跳过 FP16，只输出 CPU FP32 实测值。
"""

from __future__ import annotations

import argparse
import csv
import os
import time
from pathlib import Path

import cv2
import numpy as np


def resolve_device():
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda:0", True
    except Exception:
        pass
    return "cpu", False


def load_frames(source: str, max_frames: int):
    frames = []
    if source.isdigit():
        cap = cv2.VideoCapture(int(source))
    else:
        path = Path(source)
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}:
            img = cv2.imread(str(path))
            if img is None:
                raise RuntimeError(f"无法读取图片: {source}")
            return [img] * max_frames
        cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频源: {source}")
    while len(frames) < max_frames:
        ok, frame = cap.read()
        if not ok:
            if frames:
                # 循环复用已读帧，凑满样本数
                frames.append(frames[len(frames) % len(frames)].copy())
                continue
            break
        frames.append(frame)
    cap.release()
    if not frames:
        raise RuntimeError("未读取到任何帧")
    return frames[:max_frames]


def peak_vram_mb():
    try:
        import torch

        if torch.cuda.is_available():
            return float(torch.cuda.max_memory_allocated() / (1024 * 1024))
    except Exception:
        pass
    return 0.0


def bench_yolo(model, frames, half: bool, label: str):
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.synchronize()
    except Exception:
        pass

    # warmup
    for frame in frames[: min(5, len(frames))]:
        model.predict(frame, verbose=False, half=half)

    times = []
    for frame in frames:
        t0 = time.perf_counter()
        model.predict(frame, verbose=False, half=half)
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.synchronize()
        except Exception:
            pass
        times.append((time.perf_counter() - t0) * 1000.0)

    avg = float(np.mean(times)) if times else 0.0
    fps = 1000.0 / avg if avg > 0 else 0.0
    return {
        "pipeline": label,
        "avg_ms": round(avg, 3),
        "fps": round(fps, 2),
        "vram_mb": round(peak_vram_mb(), 2),
        "frames": len(times),
        "half": half,
    }


def bench_yolo_face(model, frames, half: bool, yunet_path: str, sface_path: str):
    detector = None
    recognizer = None
    if os.path.isfile(yunet_path):
        try:
            detector = cv2.FaceDetectorYN.create(yunet_path, "", (320, 320), 0.7, 0.3, 5000)
        except Exception as exc:
            print(f"[WARN] YuNet 加载失败: {exc}")
    if os.path.isfile(sface_path):
        try:
            recognizer = cv2.FaceRecognizerSF.create(sface_path, "")
        except Exception as exc:
            print(f"[WARN] SFace 加载失败: {exc}")

    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.synchronize()
    except Exception:
        pass

    for frame in frames[: min(3, len(frames))]:
        model.predict(frame, verbose=False, half=half)

    times = []
    face_hits = 0
    for frame in frames:
        t0 = time.perf_counter()
        results = model.predict(frame, verbose=False, half=half, classes=[0])
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes[:1]:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                h, w = frame.shape[:2]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                roi = frame[y1:y1 + max(1, int((y2 - y1) * 0.6)), x1:x2]
                if roi.size == 0 or detector is None:
                    continue
                detector.setInputSize((roi.shape[1], roi.shape[0]))
                _, faces = detector.detect(roi)
                if faces is None or len(faces) == 0:
                    continue
                face_hits += 1
                if recognizer is not None:
                    try:
                        aligned = recognizer.alignCrop(roi, faces[0])
                        recognizer.feature(aligned)
                    except Exception:
                        pass
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.synchronize()
        except Exception:
            pass
        times.append((time.perf_counter() - t0) * 1000.0)

    avg = float(np.mean(times)) if times else 0.0
    fps = 1000.0 / avg if avg > 0 else 0.0
    return {
        "pipeline": "YOLOv8n + YuNet/SFace",
        "avg_ms": round(avg, 3),
        "fps": round(fps, 2),
        "vram_mb": round(peak_vram_mb(), 2),
        "frames": len(times),
        "half": half,
        "face_hits": face_hits,
        "face_hit_rate": round(face_hits / max(1, len(times)), 4),
    }


def main():
    parser = argparse.ArgumentParser(description="DoorAlert 推理基准测试")
    parser.add_argument("--source", default=os.environ.get("VIDEO_SOURCE", "0"), help="视频/图片路径或摄像头索引")
    parser.add_argument("--frames", type=int, default=500, help="测试帧数")
    parser.add_argument("--weights", default=os.environ.get("YOLO_WEIGHTS", "yolov8n.pt"))
    parser.add_argument("--out", default="benchmark_report.csv")
    parser.add_argument("--yunet", default=os.path.join("models", "face_detection_yunet_2023mar.onnx"))
    parser.add_argument("--sface", default=os.path.join("models", "face_recognition_sface_2021dec.onnx"))
    args = parser.parse_args()

    device, has_cuda = resolve_device()
    print(f"[INFO] device={device}, cuda={has_cuda}, frames={args.frames}, source={args.source}")
    frames = load_frames(str(args.source), args.frames)
    print(f"[INFO] loaded {len(frames)} frames, shape={frames[0].shape}")

    from ultralytics import YOLO

    model = YOLO(args.weights)
    try:
        model.to(device)
    except Exception as exc:
        print(f"[WARN] model.to({device}) failed: {exc}")

    rows = []
    rows.append(bench_yolo(model, frames, half=False, label="YOLOv8n FP32"))
    if has_cuda:
        rows.append(bench_yolo(model, frames, half=True, label="YOLOv8n FP16"))
    else:
        print("[INFO] 无 CUDA，跳过 FP16")
    rows.append(
        bench_yolo_face(model, frames, half=False, yunet_path=args.yunet, sface_path=args.sface)
    )

    fieldnames = ["pipeline", "avg_ms", "fps", "vram_mb", "frames", "half", "face_hits", "face_hit_rate"]
    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
            print(
                f"[RESULT] {row['pipeline']}: avg={row['avg_ms']} ms, "
                f"FPS={row['fps']}, VRAM={row['vram_mb']} MB"
            )

    under_100 = all(r["avg_ms"] <= 100.0 for r in rows if "YuNet" not in r["pipeline"])
    print(f"[INFO] 报告已写入 {args.out}")
    print(
        "[INFO] YOLO 单阶段 ≤100ms: "
        + ("PASS（实测）" if under_100 else "FAIL（请以 CSV 实测值为准，勿先验承诺）")
    )


if __name__ == "__main__":
    main()
