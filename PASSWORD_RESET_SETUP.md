# 忘記密碼功能部署說明

- 登入頁「忘記密碼？」→ 輸入註冊 Email → SMTP 寄送 20 分鐘有效的一次性連結 → 設定新密碼。
- 需要 Render 環境變數 SMTP_USER、SMTP_PASS、SMTP_FROM（或既有 Brevo/Gmail 相容設定）；啟動時 SMTP 驗證成功才可寄信。
- 公開部署請設 PUBLIC_BASE_URL=https://defect-system-render.onrender.com（若未設定，production 預設會使用此網址）。
- 連結以 SHA-256 雜湊存於 MongoDB password_reset_tokens，成功重設後刪除並使既有工作階段失效。
- 正式環境請先用測試帳號驗收寄信、連結過期、重複使用、舊密碼無法登入。
- 測試與正式資料模式邏輯沿用此基底整合版，忘記密碼功能不修改其權限設定。
