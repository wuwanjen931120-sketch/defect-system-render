# 審查報告要求完成狀態（2026-07-27，版本 1.1.0）

依據：`1150713_系統專題審查報告.docx`

## P0：展示、權限與核心功能

- [x] 正式頁面檔名、連結、Manifest、圖示與 Service Worker 統一。
- [x] 根網址直接導向登入頁，入口不再先要求相機權限。
- [x] 移除 `public/server.js` 與重複、舊版檔案。
- [x] 瑕疵、目前產品、AI、設定與系統 API 依角色、租戶及機台限制。
- [x] E-stop 僅限管理員，加入 `system_id`、`command_id`、ACK、逾時與 AuditLog。
- [x] AI API 需要登入，具每分鐘與每日使用上限。

## P1：登入、安全與穩定

- [x] 登入統一為帳密驗證 → Email OTP challenge → 登入 Cookie。
- [x] OTP 存 MongoDB TTL，具到期、重寄等待、單次 challenge 與錯誤次數限制。
- [x] 密碼錯誤以信箱 + IP 建立持久化鎖定，避免只靠單一程序的 rate limit。
- [x] JWT 改存 `HttpOnly + Secure + SameSite=Strict` Cookie；前端不保存 JWT。
- [x] 使用者支援 `disabled`、`session_version` 與密碼變更後 Session 失效。
- [x] 登入成功/失敗、OTP、登出、使用者權限變動均寫入 AuditLog。
- [x] `.env.example`、`render.yaml`、README 與程式使用相同環境變數名稱。
- [x] 啟動檢查 MongoDB、JWT、HTTPS/CORS、SMTP、MQTT 群組及安全註冊設定。
- [x] Helmet、CSP、HSTS、Referrer-Policy、Permissions-Policy、CORS 白名單與 request id。
- [x] 所有 HTML 已移除 inline script、inline style、`onclick` 等事件屬性。
- [x] 動態側邊欄改用 DOM API 與 `addEventListener`，不再產生 inline handler。
- [x] 動態 HTML 使用 DOMPurify 或 DOM API，DOMPurify 不允許 style attribute。
- [x] 管理 API 排除密碼雜湊、OTP、token 與 secret。
- [x] 正式環境公開註冊預設關閉；若開啟，邀請碼至少 12 字元。
- [x] 統一錯誤 middleware，正式環境不回傳內部錯誤，後端使用結構化日誌。

## P2：資料品質、測試、部署與維運

- [x] 瑕疵、使用者、租戶、機台、稽核與 collection 查詢具分頁及最大筆數限制。
- [x] 篩選條件檢查 status、日期格式及日期先後順序。
- [x] Summary 使用 MongoDB aggregate；NG 警報使用資料庫時間窗、冷卻與寄送 claim。
- [x] MongoDB 常用複合索引、唯一瑕疵 ID 索引、OTP/LoginSecurity/AuditLog/AI 使用量索引。
- [x] MQTT payload schema、大小、單次筆數、時間範圍與 HTTPS 圖片 URL 驗證。
- [x] MQTT 使用 upsert，降低 QoS 1 重送造成重複資料；提供舊資料去重工具。
- [x] E-stop ACK 驗證 topic、system、command 與 status；逾時標記但不自動重送。
- [x] CSV 匯出與 CSV 公式注入防護。
- [x] GitHub Actions CI、語法檢查、格式檢查、單元測試、coverage 及 npm high audit。
- [x] Dependabot 每週檢查 npm 與 GitHub Actions 更新。
- [x] `/health`、`/health/live`、`/health/ready`、`/api/health`、`/api/login/status`、`/api/session`。
- [x] SMTP 啟動與每 15 分鐘實際驗證；MQTT 可設定為 Readiness 必要條件。
- [x] 預設資料保留 365 天，並支援自訂或停用清理。
- [x] 外部 Readiness 監控 GitHub Action。
- [x] 加密 MongoDB 備份包含完整性、解密驗證、checksum 與還原腳本。
- [x] Graceful shutdown 會關閉 HTTP、MQTT 與 MongoDB。
- [x] 部署後自動驗收工具與完整人工驗收清單。
- [x] API、角色權限、部署、登入排錯、備份、監控及 P1/P2 完成報告。

## Gemini API 免費層

- [x] AI 使用 Gemini API，不使用 OpenAI API。
- [x] API Key 只存在 Render Environment，不會送到前端。
- [x] 加入每分鐘與每日上限，避免快速耗盡額度。
- [x] 額度用完或連線失敗時，自動切換成本機統計回答。

## 私人環境與實體設備驗收

下列項目無法由 ZIP 代替私人平台或設備執行，但已有自動腳本及驗收文件：

1. Render Environment 填入 MongoDB、SMTP、HiveMQ、Gemini API Key 與 JWT Secret。
2. 執行 `npm run verify:deployment -- https://網址`。
3. GitHub Repository Secrets 填入備份密碼及 MongoDB URI，執行一次備份與隔離還原。
4. 實體設備回傳 E-stop ACK，測試成功、錯誤機台與逾時三種情況。
5. 建立 super_admin、tenant_admin、user 三種展示帳號，依 `DEPLOYMENT_ACCEPTANCE_TEST.md` 驗收。
