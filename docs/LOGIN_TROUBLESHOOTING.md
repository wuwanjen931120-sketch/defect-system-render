# 登入問題排查

## 「此來源不允許呼叫 API」

舊版本只以文字完全比對 `APP_BASE_URL`、`ALLOWED_ORIGINS`，Render 網址不同、尾端多 `/` 或代理轉送 Host 時會被誤判。

本版已修正為：

- URL 正規化後再比對
- 接受 Render 的 `RENDER_EXTERNAL_HOSTNAME`
- 接受目前頁面與 API 的同來源請求
- 仍拒絕其他未授權外部來源

部署後務必使用 `Clear build cache & deploy`，並清除瀏覽器舊 Service Worker。

## 「登入驗證信服務尚未設定」

開啟 `/api/login/status`。若 `email_login_enabled=false`，請在 Render Environment 補上：

```text
SMTP_PROVIDER
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
```

也可沿用舊版 Brevo 或 Gmail 欄位，詳細內容見根目錄 `README_DEPLOY.md`。

## 「信箱或密碼錯誤」

本版可讀取使用者文件中的以下密碼雜湊欄位：

```text
password
passwordHash
password_hash
```

密碼必須是 bcrypt 雜湊，系統不接受資料庫明文密碼。

## 「驗證碼已寄出但無法驗證」

- 驗證碼固定 6 位數。
- 預設有效 5 分鐘。
- 預設最多輸入錯誤 5 次。
- 重新寄送後，舊驗證碼立即失效。
- SMTP 寄送失敗時，本版會刪除未寄出的 OTP，避免被重寄冷卻鎖住。


## 「登入成功後又跳回登入頁」

舊版可能因登入 Cookie 沒有被確認、舊的驗證程式仍被快取，或 JWT 放入太多機台資料而超過 Cookie 大小，造成 `/api/session` 回傳 401。

本版已改為：

- 驗證碼成功後立即呼叫 `/api/session`；確認成功才前往儀表板。
- Cookie 使用 `SameSite=Lax` 與 HTTPS `Secure`。
- JWT 只放使用者 ID 與信箱，權限和機台清單改由資料庫讀取。
- `auth-bootstrap.js` 不再加入 Service Worker 快取，且檔名帶版本參數。
- 登入狀態檢查遇到短暫網路問題時重試三次。

部署後請依序操作：

1. Render：`Manual Deploy → Clear build cache & deploy`。
2. 登入頁按一次「修復灰底/警告（清快取）」。
3. 按 `Ctrl + F5`。
4. 重新登入。
