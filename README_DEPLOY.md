# Render 部署說明

本專案為 Node.js + Express + MongoDB + MQTT + Email OTP + Gemini 的瑕疵辨識與分流系統。

## 1. GitHub 上傳方式

請把專案資料夾「裡面的內容」放在 GitHub 儲存庫根目錄。根目錄應直接看到：

```text
.github/
lib/
public/
test/
.env.example
.npmrc
package.json
package-lock.json
render-build.sh
render.yaml
server.cjs
```

不要上傳 `.env`、MongoDB 密碼、SMTP 密碼、HiveMQ 密碼或 Gemini API Key。

## 2. Render 基本設定

```text
Build Command: bash render-build.sh
Start Command: npm start
Health Check Path: /health
Node: 22.x
```

第一次套用此修正版後，請執行：

```text
Manual Deploy → Clear build cache & deploy
```

`render-build.sh` 與 `.npmrc` 已固定使用公開 npm registry，避免套件下載網址指向其他環境。

## 3. 必填環境變數

```text
NODE_ENV=production
MONGODB_URI=你的 MongoDB Atlas 連線字串
JWT_SECRET=至少 32 個隨機字元
AUTH_COOKIE_SAME_SITE=Lax
AUTH_COOKIE_SECURE=true
APP_BASE_URL=https://你的服務名稱.onrender.com
ALLOWED_ORIGINS=https://你的服務名稱.onrender.com
```

CORS 已改為同時接受：

- `ALLOWED_ORIGINS` 白名單
- `APP_BASE_URL`
- Render 自動提供的 `RENDER_EXTERNAL_HOSTNAME`
- 與目前請求相同的網站來源

因此 Render 網址更名或環境變數尾端多 `/` 時，不會再錯誤顯示「此來源不允許呼叫 API」。

## 4. Email OTP 登入設定

登入流程固定為：

```text
信箱與密碼 → 寄送 6 位數 OTP → 驗證 OTP → JWT 寫入 HttpOnly Cookie
```

### Brevo 建議設定

```text
SMTP_PROVIDER=brevo
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=你的 Brevo SMTP Login
SMTP_PASS=你的 Brevo SMTP Key
SMTP_FROM=已在 Brevo 驗證的寄件信箱
```

### Gmail 設定

```text
SMTP_PROVIDER=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的 Gmail
SMTP_PASS=Google 應用程式密碼
SMTP_FROM=你的 Gmail
```

Gmail 不能使用一般登入密碼，必須使用 Google 帳號建立的「應用程式密碼」。

程式也相容既有的 `BREVO_SMTP_*`、`GMAIL_USER`、`GMAIL_APP_PASSWORD`、`EMAIL_USER`、`EMAIL_PASS` 等舊欄位，方便舊 Render 服務移轉。

## 5. 登入檢查

部署完成後先開啟：

```text
https://你的服務名稱.onrender.com/api/login/status
```

正常應看到類似：

```json
{
  "database_connected": true,
  "email_login_enabled": true,
  "two_factor_required": true,
  "registration_enabled": true,
  "smtp_provider": "brevo"
}
```

判讀：

- `database_connected=false`：檢查 `MONGODB_URI`
- `email_login_enabled=false`：檢查 SMTP 環境變數
- 登入頁仍顯示舊畫面：按「修復灰底/警告（清快取）」或使用 `Ctrl + F5`


## 5-1. 登入成功後又跳回登入頁

本版已處理登入迴圈：

- 登入成功後，先向 `/api/session` 確認 Cookie 有效，再進入儀表板。
- Cookie 使用 `SameSite=Lax`，並在 Render HTTPS 環境使用 `Secure`。
- `auth-bootstrap.js` 不再被 Service Worker 快取。
- JWT 只保存最小識別資料，避免機台數量多時 Cookie 過大。
- Render 剛喚醒或網路短暫失敗時，登入狀態會自動重試三次。

第一次部署本版後，請按登入頁的「修復灰底/警告（清快取）」一次，再按 `Ctrl + F5`。

## 6. 公開註冊

```text
ALLOW_PUBLIC_REGISTRATION=true
REGISTRATION_INVITE_CODE=
```

展示帳號建立完成後，建議改成：

```text
ALLOW_PUBLIC_REGISTRATION=false
```

## 7. 部署後功能檢查

1. `/health` 回傳 `status: ok`。
2. `/api/login/status` 的資料庫與 Email 登入皆為 `true`。
3. 可寄送 OTP 並成功登入。
4. 一般使用者只能查看資料庫中被授權的 `systems` 機台；Cookie 不保存完整機台清單。
5. `/api/predict`、`/api/ai/chat`、`/api/current-product` 皆要求有效登入 Cookie。
6. 急停只允許 `tenant_admin`、`super_admin`，並回傳 `command_id`。
7. 事件紀錄可匯出 CSV。
8. Service Worker 不快取登入頁、應用 HTML 與 API 回應。

## 8. 本機檢查

```bash
npm ci --no-audit --no-fund
npm run check
npm audit --omit=dev
```

## 9. Gemini API 免費層

```text
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_MODEL=gemini-3.6-flash
AI_REQUESTS_PER_MINUTE=5
AI_REQUESTS_PER_DAY=100
```

網站只在後端呼叫 Gemini，API Key 不會傳到瀏覽器。免費額度或 API 暫時不可用時，系統會自動改用本機統計回答。

## 10. 備份與監控

請參考 `docs/BACKUP_MONITORING.md`。GitHub Actions 已包含每小時健康檢查與每日加密 MongoDB 備份工作流程。
