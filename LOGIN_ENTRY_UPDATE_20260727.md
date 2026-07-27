# 登入入口調整（2026-07-27）

本次調整將登入頁設為網站唯一入口：

- 開啟網站根網址 `/` 時，伺服器直接導向 `/login.html`。
- 舊的 `index.html` 僅保留為相容性轉址頁，不再開啟 WebCam。
- 登入頁移除「回首頁」按鈕，避免回到重複的入口頁。
- 登入頁保留寄送驗證碼、驗證登入、修復登入問題與前往註冊。
- 登入與註冊按鈕保留滑鼠移入提亮及按下立體效果。

主要修改檔案：

- `server.cjs`
- `public/index.html`
- `public/index.inline-1.js`
- `public/index.page.css`
- `public/login.html`
- `public/login.js`
- `public/login.page.css`
- `public/register.html`
