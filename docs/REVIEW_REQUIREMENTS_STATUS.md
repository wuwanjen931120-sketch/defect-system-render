# 審查報告要求完成狀態（2026-07-21）

## P0 必修

- [x] 正式頁面檔名與連結統一。
- [x] Manifest、192/512 圖示與 Service Worker 修正。
- [x] `public/server.js` 移除。
- [x] 一般使用者瑕疵查詢限制在被指派機台。
- [x] `current-product` 依 JWT 角色、租戶與機台檢查。
- [x] E-stop 限管理員，加入指定機台、ACK 與 AuditLog。
- [x] Predict 與 AI API 加入 JWT、作用域與速率限制。

## P1 安全與穩定

- [x] 登入統一為帳密驗證 → OTP → JWT。
- [x] OTP 存 MongoDB TTL，具重寄冷卻、到期與錯誤次數限制。
- [x] `.env.example`、`render.yaml`、部署文件一致。
- [x] 啟動時檢查 MongoDB URI 與至少 32 字元 JWT Secret。
- [x] npm audit 0 個已知漏洞。
- [x] Helmet、CSP、HSTS、Referrer-Policy 與 CORS allowlist。
- [x] 主要外部資料輸出點改用 `textContent`、DOM API、escape 或 DOMPurify。
- [x] Mongo 管理 API 排除敏感欄位並限制白名單與分頁。
- [x] 註冊具速率限制、開關、密碼政策與可選邀請碼。
- [x] 統一錯誤 middleware 與 request id。
- [ ] JWT 改 HttpOnly Cookie：屬前後端登入架構重構，本版保留 sessionStorage 並以 CSP/XSS 修補降低風險。

## P2 資料與工程品質

- [x] Defect 與管理查詢分頁、排序與最大筆數限制。
- [x] Summary 改用 MongoDB aggregate。
- [x] 常用 compound index、OTP/AuditLog index。
- [x] MQTT payload schema 驗證與最多 100 筆限制。
- [x] E-stop command_id、ACK topic、狀態查詢與稽核。
- [x] NG 警報改用資料庫時間窗與發信冷卻。
- [x] 清除重複、未使用與會混淆的檔案。
- [x] Node 單元測試、專案結構測試與 GitHub Actions CI。
- [x] API/角色、部署與修正文件。
- [x] Service Worker 不快取登入/API/應用 HTML。
- [x] 健康檢查 `/health` 與服務狀態 `/api/health`。

## 額外完成

- [x] 瑕疵紀錄 CSV 匯出 API 與前端按鈕。
- [x] CSV 公式注入防護。
- [x] 瑕疵圖片欄位接受站內路徑或 HTTPS 網址。
