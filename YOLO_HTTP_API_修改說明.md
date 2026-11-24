# 本次修改

1. `server.cjs` 新增 `POST /api/device/inspection`，沿用 `DEVICE_API_KEY`、產品 YOLO 類別映射、MongoDB Defect、TEST/PRODUCTION 模式、SSE 即時事件，以及現有品質警報。
2. 不移除 MQTT，不變更目前網頁 HTML／JS、登入或角色設定。
3. `integration/yolo_http_api/` 新增來源於視覺組員 `final.py` 的整合副本、模型 `best (9).pt`、HTTP 上傳模組和在家測試程式。
4. 已使用同一 event_id 的 MongoDB upsert 防止正常重送重複計數，但 YOLO 原有追蹤本身可能重建 ID，需實機測試。
5. 配置步驟見 `integration/yolo_http_api/README_整合教學.md`。

6. 額外將原版 `public/owner-role.html` 的 inline CSS/JS 拆成外部檔案，修正原專案既有 CSP lint/test 失敗，不變更功能。
