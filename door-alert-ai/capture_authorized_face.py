"""从摄像头采集一张正脸，保存到 authorized_faces/（文件名=人员姓名）。"""

import argparse
import os
import sys

import cv2


def open_camera(index: int):
    if sys.platform.startswith("win"):
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        cap.release()
        cap = cv2.VideoCapture(index)
    return cap


def main():
    parser = argparse.ArgumentParser(description="采集授权人脸照片")
    parser.add_argument("--name", default="陈柯杰", help="授权人员姓名（用作文件名）")
    parser.add_argument("--camera", type=int, default=0, help="摄像头索引，默认 0")
    parser.add_argument(
        "--out-dir",
        default="authorized_faces",
        help="输出目录，默认 authorized_faces",
    )
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(args.out_dir, f"{args.name}.jpg")

    cap = open_camera(args.camera)
    if not cap.isOpened():
        print(f"[ERROR] 无法打开摄像头 index={args.camera}")
        print("可改用 --camera 1，或手动把正脸照片放到 authorized_faces/")
        return 1

    print("操作说明：")
    print("  正对摄像头，脸部清晰出现在画面中")
    print("  按 [空格] 拍照保存")
    print("  按 [Q] 退出")
    print(f"将保存为: {out_path}")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("[ERROR] 读取摄像头帧失败")
            break

        preview = frame.copy()
        cv2.putText(
            preview,
            "SPACE=save  Q=quit",
            (16, 36),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 255, 0),
            2,
        )
        cv2.imshow("Capture Authorized Face", preview)
        key = cv2.waitKey(1) & 0xFF

        if key in (ord("q"), ord("Q"), 27):
            print("[INFO] 已取消，未保存")
            break
        if key == ord(" "):
            cv2.imwrite(out_path, frame)
            print(f"[OK] 已保存: {out_path}")
            # 立刻验证能否提特征
            try:
                import face_recognition

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                encodings = face_recognition.face_encodings(rgb)
                if encodings:
                    print("[OK] 已检测到人脸并提取特征，可用于授权比对")
                else:
                    print("[WARN] 未检测到人脸，请换一张更清晰的正脸照片重拍")
            except Exception as exc:
                print(f"[WARN] 特征校验失败: {exc}")
            break

    cap.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
