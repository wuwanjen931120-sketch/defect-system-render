"""現場端共用 client：NG 圖片上傳 + 實體手臂 heartbeat。

需要：pip install requests
不要把 DEVICE_API_KEY 寫死在程式，請放 Windows 環境變數。
"""
from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Optional

import requests


BASE_URL = os.getenv("DEFECT_API_BASE_URL", "https://defect-system-render.onrender.com").rstrip("/")
DEVICE_API_KEY = os.getenv("DEFECT_DEVICE_API_KEY", "")


def _headers(content_type: Optional[str] = None) -> dict[str, str]:
    if not DEVICE_API_KEY:
        raise RuntimeError("尚未設定 DEFECT_DEVICE_API_KEY")
    headers = {"X-Device-Key": DEVICE_API_KEY}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def upload_ng_image(system_id: str, case_id: str, image_path: str, product: str = "") -> str:
    """上傳 NG 圖片，回傳可直接放進 MQTT image_url 的站內網址。"""
    path = Path(image_path)
    if not path.is_file():
        raise FileNotFoundError(path)

    content_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError("只支援 JPG / PNG / WebP")

    params = {"system_id": system_id, "case_id": case_id}
    if product:
        params["product"] = product

    with path.open("rb") as fh:
        response = requests.post(
            f"{BASE_URL}/api/device/ng-image",
            params=params,
            data=fh,
            headers=_headers(content_type),
            timeout=20,
        )
    response.raise_for_status()
    data = response.json()
    return str(data["image_url"])


def send_robot_heartbeat(
    system_id: str,
    connected: bool,
    *,
    status: str = "connected",
    port: str = "",
    controller: str = "wlkata-python",
) -> dict:
    """回報實體手臂狀態。只有真的成功查詢到手臂時，connected 才應為 True。"""
    response = requests.post(
        f"{BASE_URL}/api/device/robot-heartbeat",
        json={
            "system_id": system_id,
            "robot_connected": bool(connected),
            "robot_status": status,
            "robot_port": port,
            "controller": controller,
        },
        headers=_headers("application/json"),
        timeout=10,
    )
    response.raise_for_status()
    return response.json()
