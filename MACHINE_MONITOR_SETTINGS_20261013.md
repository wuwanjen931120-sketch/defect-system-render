# 機台監控設定修改

- 系統設定：新增機台選擇，NG 連續門檻（1-20）、FPS 下限（5-60）以 MongoDB systems.monitor_settings 儲存。
- GET/PUT /api/machine-settings 需登入，修改需管理員身分；使用原機台租戶權限。
- NG 告警由既有 MQTT 檢測事件寫入後檢查最新連續結果（並保留原本冷卻時間），不使用假事件。
- FPS：現場 Python 程式用 POST /api/device/vision-fps，HTTP header `x-device-key` 設置 Render 環境變數 DEVICE_API_KEY，JSON 範例：`{"system_id":"AI-A","fps":18.7}`。system_id 必須與實際已建立機台相符。每 10 秒左右上傳一次。逾 30 秒視為「無資料」。低於設定值時生成 fps_low 告警；恢復正常會重設告警觸發狀態，但不自動把既有告警標示為已解決。
- 目前只完成雲端接收與檢查，需將裝置回報程式接到 YOLOv8 的實測 FPS 才會開始出現數據；未連接時不顯示正常。
- 現有 MQTT NG 告警程式保留冷卻機制。
