# Render 部署說明

## 1. 必填環境變數

Render → Service → Environment 中至少設定：

- `MONGODB_URI`
- `JWT_SECRET`：至少 32 個隨機字元
- `APP_BASE_URL=https://defect-system-render.onrender.com`
- `ALLOWED_ORIGINS=https://defect-system-render.onrender.com`

要使用 MQTT、Email 登入驗證與 Gemini，再依 `env.example` 補齊相關變數。

## 2. Build / Start

```text
Build Command: npm ci
Start Command: npm start
Health Check: /health
```

## 3. 部署後檢查

1. 開啟 `/health`，確認 `status` 為 `ok`。
2. 開啟首頁、登入、儀表板、事件紀錄、設定與 AI 頁面。
3. 使用一般使用者測試：不可透過網址參數查看未授權機台。
4. 使用租戶管理員測試急停：必須先選機台，系統回傳 `pending_ack`。
5. 開啟 `/api/health`，確認 MongoDB、MQTT、Email、Gemini 設定狀態。

## 4. 安全提醒

- API Key、MongoDB 密碼、JWT Secret 只放 Render Environment，不可提交到 GitHub。
- 正式使用時可將 `ALLOW_PUBLIC_REGISTRATION=false`，改由管理員建立帳號。
- 急停設備需訂閱 `MQTT_ESTOP_TOPIC_TEMPLATE` 對應的機台 Topic，並回傳 ACK。

## 5. Render 顯示 `npm error Exit handler never called!`

本專案已固定使用 Node.js `22.23.1`，避免 Render 自動採用 Node.js 24 時的 npm 安裝異常。

若服務已經在 Render 建立，請在 Dashboard 手動確認：

```text
Environment：NODE_VERSION=22.23.1
Build Command：npm ci --no-audit --no-fund
Start Command：npm start
```

儲存後使用：

```text
Manual Deploy → Clear build cache & deploy
```
