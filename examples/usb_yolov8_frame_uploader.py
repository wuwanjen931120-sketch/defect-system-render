"""在現場電腦執行的範例；只上傳真實 USB Webcam 的 YOLOv8 辨識畫面。
依賴：pip install ultralytics opencv-python requests
環境變數：RENDER_BASE_URL, DEVICE_API_KEY, SYSTEM_ID, CAMERA_INDEX, CAMERA_ID, YOLO_WEIGHTS
注意：CAMERA_INDEX 是 OpenCV 設備索引；論文的「相機 3/4」是校正資料名稱，
兩者不一定相等，請先確認實際 USB 裝置與相對應的校正檔。
"""
import os
import time
import cv2
import requests
from ultralytics import YOLO

base = os.environ["RENDER_BASE_URL"].rstrip("/")
if not base.startswith("https://"):
    raise ValueError("RENDER_BASE_URL 必須是 HTTPS")
key = os.environ["DEVICE_API_KEY"]
system_id = os.environ["SYSTEM_ID"]
camera_id = os.environ.get("CAMERA_ID", "camera_3")
index = int(os.environ.get("CAMERA_INDEX", "0"))
weights = os.environ["YOLO_WEIGHTS"]
model = YOLO(weights)
cap = cv2.VideoCapture(index)
if not cap.isOpened():
    raise RuntimeError(f"無法開啟 USB Webcam，OpenCV index={index}")
session = requests.Session()
last_upload = 0
try:
    while True:
        ok, frame = cap.read()
        if not ok:
            print("相機讀取失敗，停止回報；網站將在 10 秒內顯示離線")
            break
        result = model.track(frame, persist=True, tracker="bytetrack.yaml", verbose=False)[0]
        if time.monotonic() - last_upload < 1.0:
            continue
        annotated = result.plot()
        success, jpg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not success or jpg.nbytes > 512 * 1024:
            print("影格編碼失敗或超過 512KB，略過")
            continue
        try:
            response = session.post(
                base + "/api/device/vision-frame",
                data=jpg.tobytes(),
                headers={"Content-Type":"image/jpeg", "x-device-key":key, "x-system-id":system_id, "x-camera-id":camera_id},
                timeout=8,
            )
            response.raise_for_status()
            last_upload = time.monotonic()
        except requests.RequestException as exc:
            print("上傳失敗：", exc)
            time.sleep(2)
finally:
    cap.release()
