"""在家不接相機的測試：只傳一筆 TEST 事件（先將機台資料模式設為 TEST）。"""
import os
import uuid
from render_reporter import RenderReporter
r = RenderReporter()
if not r.enabled:
    raise SystemExit("請先設定 RENDER_BASE_URL、DEVICE_API_KEY、SYSTEM_ID")
r.report("TEST-"+uuid.uuid4().hex[:10], "correction-tape", "OK")
