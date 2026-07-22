# 審查報告要求完成狀態（2026-07-22）

依據：`1150713_系統專題審查報告 (1)(1).docx`

## 本次登入故障修正

- [x] 修正 Render 同來源 API 被 CORS 誤擋的問題。
- [x] CORS URL 先正規化，尾端 `/` 或附帶 path 不再造成比對失敗。
- [x] 支援 Render `X-Forwarded-Host`、`X-Forwarded-Proto` 與 `RENDER_EXTERNAL_HOSTNAME`。
- [x] 前端登入改用相對 API 路徑，不再自行拼接 `window.location.origin`。
- [x] 新增 `/api/login/status`，登入頁會直接顯示資料庫與 SMTP 是否可用。
- [x] SMTP 改用通用 `SMTP_*`，並相容舊 Brevo、Gmail、`EMAIL_*` 環境變數。
- [x] 相容既有使用者的 `password`、`passwordHash`、`password_hash` bcrypt 欄位。
- [x] SMTP 寄送失敗會清除該次 OTP，避免使用者被重寄冷卻鎖住。
- [x] 登入頁與 `login.js` 設為不快取，Service Worker cache 版本升級。

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
- [x] `.env.example`、`render.yaml`、`README_DEPLOY.md` 與實際程式欄位同步。
- [x] 啟動時檢查 MongoDB URI 與至少 32 字元 JWT Secret。
- [x] Helmet、CSP、HSTS、Referrer-Policy 與 CORS 白名單。
- [x] 管理 collection API 排除敏感欄位並限制白名單與分頁。
- [x] 註冊具速率限制、開關、密碼政策與可選邀請碼。
- [x] 統一錯誤 middleware 與 request id。
- [x] 登入前端不使用 `innerHTML` 輸出伺服器錯誤訊息。
- [~] 其他舊頁面的 XSS 修正：主要動態資料輸出點已安全化，但部分展示頁仍保留 inline script/style。
- [ ] JWT 改 HttpOnly Secure SameSite Cookie：需重構所有前端 API 呼叫，本版仍使用 sessionStorage。

## P2 資料與工程品質

- [x] Defect 與管理查詢分頁、排序與最大筆數限制。
- [x] Summary 改用 MongoDB aggregate。
- [x] 常用 compound index、OTP/AuditLog index。
- [x] MQTT payload schema 驗證與單次筆數限制。
- [x] E-stop command_id、ACK topic、狀態查詢與稽核。
- [x] NG 警報改用資料庫時間窗與發信冷卻。
- [x] 清除重複、未使用與會混淆的檔案。
- [x] Node 單元測試、專案結構測試、CORS 同來源測試與 GitHub Actions CI。
- [x] API/角色、部署、登入排錯與修正文件。
- [x] Service Worker 不快取登入/API/應用 HTML。
- [x] 健康檢查 `/health`、服務狀態 `/api/health`、登入狀態 `/api/login/status`。
- [~] Lint/format：已有語法與單元測試，尚未導入 ESLint/Prettier。
- [ ] MongoDB 自動備份、資料保留排程與外部監控需在雲端服務端另行設定。

## 額外完成

- [x] 瑕疵紀錄 CSV 匯出 API 與前端按鈕。
- [x] CSV 公式注入防護。
- [x] 瑕疵圖片欄位接受站內路徑或 HTTPS 網址。
- [x] `.npmrc` 與 Render build script 固定公開 npm registry。
