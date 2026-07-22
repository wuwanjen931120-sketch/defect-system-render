# 1150713 審查報告修正紀錄

## 已完成的核心修正

- 正式頁面使用固定短檔名，Manifest、Service Worker 與前端跳轉已同步。
- 移除 `public/server.js`、重複資料夾與未使用的舊程式。
- Service Worker 只快取靜態資產與離線頁，不快取應用 HTML、登入 API 或健康檢查。
- 瑕疵、摘要、預測、AI、系統、站台設定與目前產品 API 皆以 JWT 角色、租戶與機台範圍為準。
- 急停僅限管理員，加入指定機台、`command_id`、ACK Topic、狀態查詢與 AuditLog。
- OTP 存入 MongoDB TTL collection，加入寄送冷卻、錯誤次數上限與過期清理。
- 登入採帳密驗證後寄 OTP，OTP 成功才簽發 JWT。
- CORS 同時檢查白名單與實際同來源 Render Host，避免合法網站被錯誤擋下。
- 登入頁改用外部 `login.js`、相對 API 路徑與 `textContent` 顯示錯誤。
- SMTP 支援通用 `SMTP_*`，並相容 Brevo、Gmail 舊環境變數。
- 加入 Helmet、CSP、HSTS、Referrer-Policy、request id、輸入大小限制與速率限制。
- 公開註冊可關閉，也可透過 `REGISTRATION_INVITE_CODE` 限制。
- 管理 API 排除敏感欄位並限制 collection 白名單、筆數與分頁。
- MQTT payload 驗證必填欄位、狀態、時間、圖片網址與單次筆數。
- NG 警報使用資料庫時間窗與冷卻，不依賴記憶體累計。
- 新增常用索引、AuditLog 查詢、CSV 匯出、20 項自動測試與 GitHub Actions CI。
- `.npmrc`、build script 與 package lock 使用公開 npm registry。

## E-stop 硬體端需求

設備需訂閱：

```text
factory/control/estop/<system_id>
```

執行後回傳：

```text
factory/control/estop/ack/<system_id>
```

Payload 至少包含：

```json
{"command_id":"後端送出的 UUID","status":"executed"}
```

## 仍需後續重構

- 將 sessionStorage JWT 改成 HttpOnly Secure SameSite Cookie。
- 把其他舊頁面的 inline script/style 拆成外部檔案後移除 CSP `unsafe-inline`。
- 正式瑕疵圖片應使用 Cloudinary、S3 或其他持久化儲存。
- MongoDB 備份、資料保留排程與外部監控需在雲端平台設定。
