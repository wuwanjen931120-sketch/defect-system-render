# YOLO → Render HTTP API 整合說明

本版是在原本 Render 專案上新增 `/api/device/inspection`，不刪除原 MQTT 功能。

## 1. Render 設定

- 原有 MongoDB、登入、原本環境變數保留。
- Render Environment 確認 `DEVICE_API_KEY` 已設定；使用足夠長的隨機密鑰，不要放在 GitHub。
- 在網站先建立實際機台，記下 `system_id`。
- **先將機台資料模式切到 TEST**，否則測試會進正式統計。只有 PRODUCTION 才會出現在一般使用者正式儀表板。
- 將整份 `defect-system-render-main` 專案提交 GitHub，讓 Render 自動部署新 `server.cjs`；不要只上傳 Python 到 Render。

## 2. Windows 11 現場電腦

在 `integration/yolo_http_api` 資料夾的 PowerShell：

```powershell
py -3.11 -m pip install -r requirements.txt
$env:RENDER_BASE_URL="https://你的服務.onrender.com"
$env:DEVICE_API_KEY="請填與Render相同的金鑰"
$env:SYSTEM_ID="你的機台ID"
$env:CAMERA_ID="camera_3"
python test_api_only.py
python final_render_api.py
```

如使用 conda 環境，改用該環境的 `python -m pip install -r requirements.txt`。

## 3. 功能對應

- `POST /api/device/inspection`：JSON 事件（同一 event_id 重送只更新一筆）
- `POST /api/device/vision-frame`：JPEG 畫面（約每秒一張，暫存在後端記憶體，重啟就消失）
- 既有 `POST /api/device/ng-image`：NG 證據圖片（本版 `final_render_api.py` 尚未自動保存 NG 照片）

## 4. 必須了解的限制

- `final_render_api.py` 是依視覺組員提供的 `final.py` 副本整合，沒有修改原版。
- 此副本依 defect 框中心是否落在產品框內，暫時判定 NG；需要用真實照片驗證，漏檢不等於 OK。
- 原程式的簡易最近中心點追蹤可能換 ID，造成重複計數；未完成 ByteTrack / 追蹤穩定性驗證。
- `final.py` 內原有 good_count / defect_count / yield_rate 算法沒有被改動；**它的本機良率可能和網頁的每件產品良率不同**，不可直接當成準確的實測良率。
- 本版 API 傳送在辨識循環中同步發出，網路慢時可能降低辨識 FPS；如要高速上線，應改成排隊背景傳送並做好重試持久化。
- 需要確認最新 YOLO 模型確實是 `best (9).pt`；團隊若換成其他模型請一起檢查類別名稱。
- 類別對應請在網站產品管理設定：`correction-tape`、`eraser`；`defect` 是瑕疵區域，並不是獨立產品。
- 不要把 `.env`、金鑰、機台登入帳密上傳 GitHub。

## 5. API 範例

```json
{"system_id":"你的機台ID","event_id":"YOLO-123456-1","track_id":"1","product":"eraser","status":"OK","source":"YOLO_HTTP_API"}
```

呼叫需 `x-device-key` HTTP Header。建議先執行 `test_api_only.py`，然後去管理員 TEST 資料模式查看紀錄；確認後才切 PRODUCTION。
