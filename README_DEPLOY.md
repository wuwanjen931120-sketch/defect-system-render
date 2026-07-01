# 瑕疵辨識與分流系統：Render 部署版

## 專案結構
- `server.cjs`：Node.js / Express / MongoDB / MQTT 後端
- `public/`：前端 HTML、CSS、JS
- `.env.example`：Render 環境變數名稱範例
- `render.yaml`：Render Blueprint 設定

## 本機測試
1. 複製 `.env.example` 為 `.env`，填入原本的環境變數。
2. 執行：
   ```powershell
   npm install
   npm start
   ```
3. 開啟：`http://localhost:5000`

## Render 手動部署設定
- Service Type：Web Service
- Runtime：Node
- Build Command：`npm install`
- Start Command：`npm start`
- Health Check Path：`/health`

將 `.env.example` 列出的六個變數加到 Render 的 Environment 頁面。請勿把真正的 `.env` 上傳至 GitHub。
