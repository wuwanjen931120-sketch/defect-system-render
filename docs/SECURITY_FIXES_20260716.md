# 1150713 審查報告修正紀錄

本版本依據 `1150713_系統專題審查報告.docx`，以目前最新程式為基礎修正。

## 已完成

- 統一正式頁面檔名與連結；目前使用 `index.html`、`login.html`、`dashboard.html` 等固定檔名。
- 移除 `public/server.js`，避免後端程式被靜態下載。
- 補上 `icon-512.png`，修正 manifest 與 service worker。
- Service worker 不再快取 `/api/*`、登入或帶 Authorization 的請求。
- `/api/defects`、`/api/summary`、`/api/predict`、AI 查詢加入租戶與機台作用域限制。
- `/api/current-product` 限制為管理員並檢查租戶/機台權限。
- `/api/estop` 限制為管理員、要求指定機台、加入 `command_id`、ACK topic 與 AuditLog。
- `/api/predict` 加入 JWT 驗證。
- 登入驗證碼加入 60 秒重寄冷卻、5 次錯誤上限與 5 分鐘到期。
- 密碼加入至少 8 碼、同時包含英文字母與數字的政策。
- 公開註冊支援選用 `REGISTRATION_INVITE_CODE`。
- 加入 Helmet、CSP、安全 HTTP headers、CORS allowlist、API/登入/AI rate limit。
- Mongo 管理 API 排除密碼、OTP、token、secret 等欄位並加入分頁。
- MQTT payload 驗證必填欄位、OK/NG 狀態與最多 100 筆 items。
- Defect 加入常用複合索引。
- NG 告警改為資料庫時間窗與冷卻，不再只依賴記憶體計數。
- 新增健康狀態、操作稽核 API、測試、CI 與安全文件。
- `npm audit` 已降為 0 個已知漏洞。

## 仍建議後續處理

- 將 OTP 從單機記憶體移到 MongoDB TTL collection 或 Redis，以支援多實例。
- 將 sessionStorage JWT 改為 HttpOnly Secure SameSite cookie。
- 將大量內嵌 `<script>`/`style` 拆成外部檔案，之後可移除 CSP 的 `unsafe-inline`。
- 補完整的角色與機台管理介面、AuditLog 前端頁面與自動化端到端測試。
- 圖片若要正式保存，建議改用 Cloudinary、S3 或其他持久化儲存，不要依賴 Render 本機磁碟。
