"""現場元件 heartbeat 範例。
請在真正確認元件通訊成功後才送 connected=True。
"""
import os, time, requests
BASE=os.getenv("DEFECT_API_BASE_URL","https://defect-system-render.onrender.com")
KEY=os.environ["DEFECT_DEVICE_API_KEY"]
SYSTEM_ID=os.environ["DEFECT_SYSTEM_ID"]

def send_component(component, connected, status="ready"):
    r=requests.post(f"{BASE}/api/device/component-heartbeat",headers={"x-device-key":KEY},json={"system_id":SYSTEM_ID,"component":component,"connected":bool(connected),"status":status},timeout=10)
    r.raise_for_status()

# 範例：把下列布林值替換成你實際 Python 控制程式的連線檢查結果
while True:
    send_component("vision", True, "running")
    send_component("left_robot", False, "not_checked")
    send_component("right_robot", False, "not_checked")
    send_component("conveyor_controller", False, "not_checked")
    time.sleep(5)
