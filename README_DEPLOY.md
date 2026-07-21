# Render 部署說明

## 1. 上傳前

不要上傳 `.env`、MongoDB 密碼、JWT Secret、SMTP Key、HiveMQ 密碼或 Gemini API Key。請將整個專案資料夾上傳到 GitHub，保留 `.env.example` 作為欄位說明。

## 2. Render 設定

若使用專案內的 `render.yaml`，主要設定為：

```text
Build Command: bash render-build.sh
Start Command: npm start
Health Check Path: /health
Node: 22.x
```

`render-build.sh` 會清除舊的 `node_modules` 並執行鎖版安裝。

## 3. 必填環境變數

至少設定：

- `MONGODB_URI`
- `JWT_SECRET`：至少 32 個隨機字元
- `APP_BASE_URL=https://defect-system-render.onrender.com`
- `ALLOWED_ORIGINS=https://defect-system-render.onrender.com`

MQTT、Brevo Email、Gemini 與警報設定請依 `.env.example` 填寫。

公開註冊：

- 展示期間需要自行註冊：`ALLOW_PUBLIC_REGISTRATION=true`
- 已建立展示帳號後：建議改為 `false`
- 若仍要開放註冊，可設定 `REGISTRATION_INVITE_CODE`；註冊頁必須輸入相同邀請碼

## 4. 部署後檢查

1. 開啟 `/health`，確認 `status` 為 `ok`。
2. 開啟首頁、登入、儀表板、事件紀錄、設定、AI 與管理頁。
3. 一般使用者不可透過 `system_id` 查詢未指派機台。
4. 管理員急停後應取得 `command_id` 與 `pending_ack`；設備回 ACK 後可查詢狀態。
5. 事件紀錄頁測試「匯出 CSV」。
6. 執行：

```bash
npm ci --no-fund
npm run check
npm audit --omit=dev
```

## 5. Render 安裝錯誤

若出現 npm cache、`ENOTEMPTY` 或安裝中斷：

```text
Manual Deploy → Clear build cache & deploy
```

並確認 Build Command 為 `bash render-build.sh`、Node 版本為 22.x。
