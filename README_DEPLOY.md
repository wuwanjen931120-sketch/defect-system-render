# 瑕疵辨識與分流系統：部署說明

## 專案結構

- `server.cjs`：Node.js / Express / MongoDB / MQTT / Gemini 後端
- `public/`：前端 HTML、CSS、JavaScript 與 PWA 資源
- `lib/validators.cjs`：密碼、MQTT payload、分頁與輸入驗證
- `tests/`：Node 內建測試
- `.env.example`：完整環境變數清單
- `render.yaml`：Render Blueprint
- `docs/API_SECURITY.md`：API 與角色權限說明

## 本機測試

1. 複製 `.env.example` 為 `.env`，填入至少：

   ```env
   MONGODB_URI=
   JWT_SECRET=
   ```

2. 安裝並檢查：

   ```powershell
   npm ci
   npm run check
   npm test
   npm audit --omit=dev
   npm start
   ```

3. 開啟 `http://localhost:5000`。

## Render 設定

- Service Type：Web Service
- Runtime：Node
- Build Command：`npm ci`
- Start Command：`npm start`
- Health Check Path：`/health`

請依 `.env.example` 或 `render.yaml` 加入環境變數。真正的金鑰只能放在 Render Environment，不能上傳 GitHub。

## 重要安全設定

```env
NODE_ENV=production
CORS_ORIGINS=https://defect-system-render.onrender.com
ALLOW_PASSWORD_LOGIN=false
```

- `CORS_ORIGINS` 可用逗號加入多個正式網域。
- `ALLOW_PASSWORD_LOGIN=false` 表示只使用 Email OTP 登入。
- 設定 `REGISTRATION_INVITE_CODE` 後，註冊 API 必須提供相同邀請碼。
- `GEMINI_API_KEY` 沒設定時，AI 會自動改用本機統計備援。

## 部署後檢查

1. `/health` 回傳 `status: ok`。
2. 登入頁能寄送並驗證 OTP。
3. 一般 user 只能看到被指派的 systems。
4. `/api/estop` 只有 tenant_admin / super_admin 能操作。
5. PWA 不會快取 `/api/*` 或帶 Authorization 的請求。
6. GitHub Actions 的 check、test、audit 均通過。
