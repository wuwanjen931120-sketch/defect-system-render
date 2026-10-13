# 2026-10-13 網站整合修改與現場驗收

## 已修改
- 產品目錄改為 MongoDB，依 tenant_id 區隔；新增時可設定 YOLO 類別，未設定時顯示「待設定辨識模型」。舊 localStorage 產品清單不會自動轉移，需依實際產品補建。
- MQTT 接收時用已設定的 yolo_class 對應產品名稱；未對應的類別保留原始名稱，不偽裝已辨識成功。
- 每台機台可同時保存不同 camera_id 的最新 JPEG；首頁下拉式選擇攝影機，無回報則顯示離線。
- MQTT 後續訊息未提供 lane、robot_result、image_url 時，不會用空字串清掉先前已保存的欄位。

## 仍需現場串接和測試
1. 在產品管理新增產品並輸入模型實際類別名稱。新增名稱本身不能訓練模型。
2. 在現場 PC 執行 YOLOv8，將每個相機以各自 CAMERA_ID 上傳至 /api/device/vision-frame。多 Render 實例時此記憶體影格不能跨實例共享，需改成共享串流存儲或固定單實例。
3. 現場 Python 另需向 MQTT_REPORT_TOPIC 發送事件；examples/usb_yolov8_frame_uploader.py 只上傳影像，不會回報 OK/NG。
4. 對照 event_id、track_id、status、lane、robot_result 的實際 MQTT JSON；確認一物件一事件、GOOD→NG 更新與重送不重複計數。
5. 持續確認停止命令 ACK 與實體輸送帶停止；網頁停止並非安全級急停。
6. 登入後實測租戶隔離、權限、圖片保存、報表篩選及重新部署後資料仍在。

## 驗證
- node --check server.cjs
- node --check public/dashboard.inline-2.js
- npm run lint / npm test（若環境已 npm ci）
- Render 部署後檢查 API 與現場設備完整流程。
