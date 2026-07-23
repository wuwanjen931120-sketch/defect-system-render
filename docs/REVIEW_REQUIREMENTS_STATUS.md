# 審查報告要求完成狀態（2026-07-23）

依據：`1150713_系統專題審查報告.docx`

## P0：展示、權限與核心功能

- [x] 正式頁面檔名、連結、Manifest、圖示與 Service Worker 統一。
- [x] 移除 `public/server.js` 與重複、舊版檔案。
- [x] 瑕疵、目前產品、AI、設定與系統 API 依角色、租戶及機台限制。
- [x] E-stop 僅限管理員，加入 `system_id`、`command_id`、ACK 與 AuditLog。
- [x] AI API 需要登入，具每分鐘與每日使用上限。

## P1：登入、安全與穩定

- [x] 登入統一為帳密驗證 → Email OTP → 登入 Cookie。
- [x] OTP 存 MongoDB TTL，具到期、重寄等待與錯誤次數限制。
- [x] JWT 改存 `HttpOnly + Secure + SameSite=Strict` Cookie；前端不再保存 JWT。
- [x] 登出 API 會清除伺服器 Cookie，前端只保存非敏感的顯示資料。
- [x] `.env.example`、`render.yaml`、README 與程式使用相同環境變數名稱。
- [x] 啟動檢查 MongoDB URI 與至少 32 字元 JWT Secret。
- [x] Helmet、CSP、HSTS、Referrer-Policy、CORS 白名單與 request id。
- [x] 所有 HTML 已移除 inline script、inline style、`onclick` 等事件屬性。
- [x] CSP 已移除 `unsafe-inline`；動態 HTML 統一使用 DOMPurify 或 DOM API。
- [x] 管理 API 排除 `password`、`passwordHash`、`password_hash`、OTP、token 與 secret。
- [x] 公開註冊具有開關、速率限制、密碼政策及可選邀請碼。
- [x] 統一錯誤 middleware，正式環境不回傳內部錯誤細節。

## P2：資料品質、測試、部署與維運

- [x] 瑕疵與管理查詢具分頁、排序及最大筆數限制。
- [x] Summary 使用 MongoDB aggregate；NG 警報使用資料庫時間窗與冷卻。
- [x] MongoDB 常用索引、OTP/AuditLog/AI 使用量索引。
- [x] MQTT payload schema、單次筆數、E-stop ACK 與稽核紀錄。
- [x] CSV 匯出與 CSV 公式注入防護。
- [x] GitHub Actions CI、Node 語法檢查、格式檢查、單元測試及 npm audit。
- [x] Render build 固定使用公開 npm Registry。
- [x] `/health`、`/api/health`、`/api/login/status`、`/api/session`。
- [x] 可選資料保留清理：`DEFECT_RETENTION_DAYS`、`AUDIT_RETENTION_DAYS`。
- [x] 外部健康監控 GitHub Action。
- [x] 加密 MongoDB 備份 GitHub Action；必須設定 Repository Secrets 才會執行。
- [x] API、角色權限、部署、登入排錯、備份與監控文件。

## Gemini API 免費層

- [x] AI 使用 Gemini API，不使用 OpenAI API。
- [x] 預設模型：`gemini-3.6-flash`。
- [x] API Key 只存在 Render Environment，不會送到前端。
- [x] 加入每分鐘與每日上限，避免快速耗盡免費額度。
- [x] 額度用完或連線失敗時，自動切換成本機統計回答。

## 部署後仍需由使用者完成

下列項目不是程式缺漏，而是無法寫入 ZIP 的私人設定：

1. Render Environment 填入 MongoDB、SMTP、HiveMQ、Gemini API Key 與 JWT Secret。
2. GitHub Repository Secrets 填入備份密碼及 MongoDB URI。
3. 實體設備回傳 E-stop ACK，才能完成硬體端整合測試。
4. 建立 super_admin、tenant_admin、user 三種展示帳號及測試資料。
