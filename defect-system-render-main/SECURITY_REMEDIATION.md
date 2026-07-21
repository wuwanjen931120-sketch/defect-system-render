# 1150713 審查報告修正紀錄

## 已完成的核心修正

- 正式頁面使用固定短檔名，manifest、service worker 與前端跳轉已同步。
- 移除 `public/server.js` 與重複資料夾，避免後端原始碼外洩及測試誤讀。
- Service Worker 只快取靜態 CSS、JS、圖示與離線頁，不快取 HTML、登入、API 或健康檢查。
- 瑕疵、摘要、預測、AI、系統、站台設定與目前產品 API 皆以 JWT 角色、租戶與機台範圍為準。
- 急停僅限管理員，加入指定機台、`command_id`、ACK Topic、狀態查詢與操作稽核。
- OTP 存入 MongoDB TTL collection，加入寄送冷卻、錯誤次數上限與過期清理。
- 登入採帳密驗證後寄 OTP，OTP 成功才簽發正式 JWT。
- 加入 Helmet、CSP、CORS allowlist、request id、輸入大小限制與速率限制。
- 公開註冊可關閉，也可透過 `REGISTRATION_INVITE_CODE` 限制。
- 管理 API 排除敏感欄位並限制 collection 白名單、筆數與分頁。
- MQTT payload 驗證必填欄位、狀態、時間、圖片網址與單次筆數。
- NG 警報使用資料庫時間窗與冷卻，不再依賴記憶體累計。
- 新增常用索引、AuditLog 查詢、CSV 匯出、測試與 CI。
- `npm audit --omit=dev` 為 0 個已知漏洞。

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
- 把大量 inline script/style 拆成外部檔案後移除 CSP `unsafe-inline`。
- 若正式保存瑕疵圖片，使用 Cloudinary、S3 或其他持久化儲存，而非 Render 本機磁碟。
