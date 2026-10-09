"""YOLO 判定完成後的事件上報範例。

需要：
  pip install requests paho-mqtt

流程：
  NG -> 先上傳證據圖片 -> 取得 image_url -> MQTT 發事件
  OK -> 不必上傳圖片，直接 MQTT 發事件
"""
from __future__ import annotations

import json
import os
import ssl
import time

import paho.mqtt.client as mqtt

from device_client import upload_ng_image

SYSTEM_ID = os.getenv("DEFECT_SYSTEM_ID", "S1780383304915")
MQTT_HOST = os.getenv("HIVEMQ_HOST", "")
MQTT_PORT = int(os.getenv("HIVEMQ_PORT", "8883"))
MQTT_USER = os.getenv("HIVEMQ_USER", "")
MQTT_PASS = os.getenv("HIVEMQ_PASS", "")
MQTT_TOPIC = os.getenv("MQTT_REPORT_TOPIC", "factory/defect/report")


def publish_detection(case_id: str, product: str, status: str, image_path: str | None = None) -> None:
    status = status.upper().strip()
    if status not in {"OK", "NG"}:
        raise ValueError("status 只能是 OK 或 NG")

    image_url = ""
    if status == "NG" and image_path:
        image_url = upload_ng_image(SYSTEM_ID, case_id, image_path, product)

    payload = {
        "system_id": SYSTEM_ID,
        "id": case_id,
        "product": product,
        "status": status,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "image_url": image_url,
    }

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    client.connect(MQTT_HOST, MQTT_PORT, 30)
    info = client.publish(MQTT_TOPIC, json.dumps(payload, ensure_ascii=False), qos=1)
    info.wait_for_publish()
    client.disconnect()


if __name__ == "__main__":
    # 範例：請換成 YOLO 實際產生的 case_id / product / 圖片路徑。
    publish_detection(
        case_id=f"EVT-{int(time.time())}",
        product="橡皮擦",
        status="NG",
        image_path=r"C:\\path\\to\\ng_snapshot.jpg",
    )
