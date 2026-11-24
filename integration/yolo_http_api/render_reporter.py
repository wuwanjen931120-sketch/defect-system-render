"""YOLO 現場回報：HTTP JSON 辨識事件 + JPEG 即時影格。不要把金鑰寫入程式。"""
import os
import time
import uuid
import cv2
import requests

class RenderReporter:
    def __init__(self):
        self.base = os.getenv("RENDER_BASE_URL", "").rstrip("/")
        self.key = os.getenv("DEVICE_API_KEY", "")
        self.system = os.getenv("SYSTEM_ID", "")
        self.camera_id = os.getenv("CAMERA_ID", "camera_3")
        self.enabled = bool(self.base and self.key and self.system)
        self.run_id = uuid.uuid4().hex[:12]
        self.sent_status = {}
        self.last_frame = 0.0
        self.session = requests.Session()
        if not self.enabled:
            print("[Render] 未設定 RENDER_BASE_URL / DEVICE_API_KEY / SYSTEM_ID；只在本機辨識")
        elif not self.base.startswith("https://"):
            raise ValueError("RENDER_BASE_URL 必須為 HTTPS")

    def report(self, oid, product, status):
        if not self.enabled or status not in ("OK", "NG"): return
        # 同一 track 只送一次 OK；若後來判成 NG，使用相同事件 ID 更新。
        if self.sent_status.get(oid) == "NG" or self.sent_status.get(oid) == status: return
        payload = {
            "system_id": self.system, "event_id": f"YOLO-{self.run_id}-{oid}",
            "track_id": str(oid), "product": product, "status": status,
            "source": "YOLO_HTTP_API"
        }
        try:
            response = self.session.post(self.base + "/api/device/inspection", json=payload,
                headers={"x-device-key": self.key}, timeout=3)
            response.raise_for_status()
            self.sent_status[oid] = status
            print("[Render] 辨識已回報", payload["event_id"], product, status, response.json().get("data_mode"))
        except requests.RequestException as exc:
            print("[Render] 辨識回報失敗（下次畫面重試）：", exc)

    def frame(self, frame):
        if not self.enabled or time.monotonic() - self.last_frame < 1: return
        # 縮小影格，避免超過 512KB；遠端畫面約每秒一張，不等於直播影片。
        img = frame
        if img.shape[1] > 960:
            scale = 960 / img.shape[1]
            img = cv2.resize(img, (960, int(img.shape[0]*scale)))
        ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 65])
        if not ok or len(jpg) > 512*1024: return
        self.last_frame = time.monotonic()
        try:
            response = self.session.post(self.base + "/api/device/vision-frame",
                data=jpg.tobytes(), headers={"Content-Type":"image/jpeg", "x-device-key":self.key,
                 "x-system-id":self.system, "x-camera-id":self.camera_id}, timeout=3)
            response.raise_for_status()
        except requests.RequestException as exc:
            print("[Render] 畫面上傳失敗：", exc)
