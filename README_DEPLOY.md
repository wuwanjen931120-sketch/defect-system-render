# Render 部署說明

本專案為 Node.js + Express + MongoDB + MQTT + Email OTP + Gemini 的瑕疵辨識與分流系統。

## 1. GitHub 上傳方式

請把專案資料夾「裡面的內容」放在 GitHub 儲存庫根目錄。根目錄應直接看到：

```text
.github/
lib/
public/
scripts/
test/
.env.example
.npmrc
package.json
package-lock.json
render-build.sh
render.yaml
server.cjs
```

不要上傳 `.env`、MongoDB 密碼、SMTP 密碼、HiveMQ 密碼、備份密碼或 Gemini API Key。

## 2. Render 基本設定

```text
Build Command: bash render-build.sh
Start Command: npm start
Health Check Path: /health
Node: 22.x
```

第一次套用此版本後，請執行：

```text
Manual Deploy → Clear build cache & deploy
```

`render-build.sh` 與 `.npmrc` 已固定使用公開 npm Registry，避免套件下載網址指向其他環境。

## 3. 正式環境必填變數

```text
NODE_ENV=production
MONGODB_URI=你的 MongoDB Atlas 連線字串
JWT_SECRET=至少 32 個隨機字元
APP_BASE_URL=https://你的服務名稱.onrender.com
ALLOWED_ORIGINS=https://你的服務名稱.onrender.com
AUTH_COOKIE_SAME_SITE=Strict
AUTH_COOKIE_SECURE=true
REQUIRE_EMAIL_LOGIN=true
```

正式環境啟動時會檢查：

- MongoDB URI 是否為連線字串，而非範例值。
- JWT Secret 是否至少 32 字元。
- APP 與 CORS 網址是否使用 HTTPS。
- Email OTP 所需的 SMTP 設定是否完整。
- MQTT 若填了其中一項，URL、帳號、密碼是否全部填妥。
- 公開註冊若開啟，邀請碼是否至少 12 字元。

檢查失敗時，Render Log 會列出缺少或錯誤的變數，不會讓系統以不安全設定啟動。

## 4. Email OTP 登入設定

登入流程固定為：

```text
信箱與密碼 → 寄送 6 位數 OTP → 驗證 OTP challenge → JWT 寫入 HttpOnly Cookie
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

### 登入保護預設值

```text
LOGIN_MAX_FAILURES=5
LOGIN_FAILURE_WINDOW_MINUTES=15
LOGIN_LOCK_MINUTES=15
OTP_TTL_MINUTES=5
OTP_RESEND_SECONDS=60
OTP_MAX_ATTEMPTS=5
```

同一信箱與來源 IP 在指定時間窗內連續輸入錯誤密碼會被暫時鎖定。OTP 使用 MongoDB TTL、單次 challenge、錯誤次數上限與寄送冷卻。

## 5. 公開註冊

正式環境預設：

```text
ALLOW_PUBLIC_REGISTRATION=false
REGISTRATION_INVITE_CODE=
```

帳號請由管理後台的管理員建立。若展示期間必須暫時開啟註冊：

```text
ALLOW_PUBLIC_REGISTRATION=true
REGISTRATION_INVITE_CODE=至少12字元且不可公開的邀請碼
```

沒有安全邀請碼時，正式環境會拒絕啟動，避免任何人自行建立 `tenant_admin`。

## 6. MQTT 與 E-stop

```text
REQUIRE_MQTT=false
MQTT_URL=mqtts://你的 HiveMQ 位址
MQTT_PORT=8883
MQTT_CLIENT_ID=defect-system-render
HIVEMQ_USER=帳號
HIVEMQ_PASS=密碼
MQTT_MAX_PAYLOAD_BYTES=262144
MQTT_MAX_FUTURE_SECONDS=300
MQTT_MAX_PAST_DAYS=30
ESTOP_ACK_TIMEOUT_SECONDS=30
```

安全與穩定處理：

- MQTT 正式環境只允許 TLS 的 `mqtts://` 或 `wss://`。
- Payload 有大小、欄位、筆數、狀態、網址與時間範圍驗證。
- 同一 `tenant_id + system_id + id` 使用 upsert，QoS 1 重送不會重複新增。
- E-stop ACK 必須符合原 `command_id`、topic 機台與 payload 機台。
- ACK 逾時會標記 `timed_out`，基於工業安全不自動重送，需人工確認。

若正式展示必須要求 MQTT 正常，設定：

```text
REQUIRE_MQTT=true
```

此時 `/health/ready` 會把 MQTT 連線列入 Readiness 判斷。

## 7. 健康檢查

```text
/health       Render 使用，檢查 HTTP 與 MongoDB
/health/live  程序存活檢查
/health/ready 檢查資料庫、SMTP，以及設定為必要的 MQTT
/api/health   前端健康頁使用，不回傳任何密碼或 Secret
```

部署後可自動驗收：

```bash
npm run verify:deployment -- https://你的服務名稱.onrender.com
```

此指令會檢查重新導向、登入頁、健康端點、公開註冊狀態、PWA 資源及主要安全標頭。

## 8. 資料保留與重複資料

預設：

```text
DEFECT_RETENTION_DAYS=365
AUDIT_RETENTION_DAYS=365
```

設定為 `0` 才代表不自動刪除。

MQTT 新資料已使用 idempotent upsert。舊資料如有重複，可先預覽：

```bash
npm run deduplicate:defects
```

確認後執行：

```bash
npm run deduplicate:defects -- --apply
```

程式保留每組資料中時間最新的一筆。

## 9. 本機與 CI 檢查

```bash
npm ci --no-audit --no-fund
npm run check
npm run test:coverage
npm run security:audit
```

GitHub Actions 會執行相同檢查。Dependabot 每週檢查 npm 套件與 GitHub Actions 更新。

## 10. 備份與還原

請參考 `docs/BACKUP_MONITORING.md`。每日備份會：

- 使用 `mongodump --archive --gzip`。
- 驗證 gzip 完整性。
- 使用 AES-256-CBC + PBKDF2 加密。
- 再解密一次並驗證檔案可讀。
- 產生 SHA-256 checksum。
- 只上傳加密檔與 checksum，保留 14 天。

## 11. Gemini API

```text
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_MODEL=gemini-3.6-flash
AI_REQUESTS_PER_MINUTE=5
AI_REQUESTS_PER_DAY=100
```

API Key 只存在後端。免費額度或 API 暫時不可用時，系統會改用本機統計回答。

## 12. 完整驗收

自動部署檢查無法代替私人帳號與設備測試。上線前仍要依 `docs/DEPLOYMENT_ACCEPTANCE_TEST.md` 完成三種角色、資料作用域、Email、MQTT 與 E-stop 實機驗收。
