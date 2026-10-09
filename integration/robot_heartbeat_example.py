"""WLKATA 控制程式 heartbeat 整合範例。

重點：網站不會用「MQTT Broker 已連線」推定手臂在線。
請在你原本的 WLKATA 控制迴圈中，只有「真的能向手臂查詢狀態」時才回報 True。
"""
from __future__ import annotations

import os
import time

from device_client import send_robot_heartbeat

SYSTEM_ID = os.getenv("DEFECT_SYSTEM_ID", "S1780383304915")
ROBOT_PORT = os.getenv("WLKATA_PORT", "COM5")


def robot_is_really_connected(robot) -> bool:
    """把這裡接到你目前控制程式已經在用的『讀取手臂狀態』呼叫。

    不建議只檢查 COM5 是否存在；COM 存在不代表機械手臂真的有回應。
    """
    try:
        # 依你的 wlkata_mirobot 版本，改成目前程式已成功使用的狀態查詢函式。
        # 例如你原程式若有 robot.get_status()，就在這裡呼叫它。
        robot.get_status()
        return True
    except Exception:
        return False


def heartbeat_loop(robot, interval_seconds: float = 5.0) -> None:
    while True:
        connected = robot_is_really_connected(robot)
        try:
            send_robot_heartbeat(
                SYSTEM_ID,
                connected,
                status="ready" if connected else "disconnected",
                port=ROBOT_PORT,
            )
        except Exception as exc:
            print("heartbeat 上傳失敗：", exc)
        time.sleep(interval_seconds)


# 用法：在你原本建立 robot 物件後，把 heartbeat_loop 放到背景執行緒。
# import threading
# threading.Thread(target=heartbeat_loop, args=(robot,), daemon=True).start()
