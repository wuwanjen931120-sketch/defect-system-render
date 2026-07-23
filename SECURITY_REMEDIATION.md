# 1150713 審查報告修正紀錄

## 已完成

- 正式頁面、Manifest、圖示、Service Worker 與前端跳轉已統一。
- 移除公開後端副本、重複資料夾及舊版檔案。
- 所有重要 API 皆檢查 JWT、角色、租戶與機台範圍。
- JWT 已移至 HttpOnly、Secure、SameSite=Strict Cookie，前端不保存 JWT。
- OTP 改存 MongoDB TTL，具重寄冷卻、錯誤次數及過期清理。
- Helmet CSP 已移除 `unsafe-inline`；HTML 無 inline script、style 或事件屬性。
- 動態 HTML 使用 DOMPurify；資料表與文字優先使用 DOM API／textContent。
- 管理 API 排除所有已知密碼雜湊欄位及內部敏感欄位。
- CORS 同時驗證正式白名單及 Render 實際同來源 Host。
- E-stop 有指定機台、command_id、ACK、狀態查詢及 AuditLog。
- MQTT payload 有型別、必填欄位、狀態、圖片網址及筆數驗證。
- NG 警報使用資料庫時間窗，不依賴服務記憶體累計。
- 加入 GitHub CI、格式／語法／單元測試、健康監控及加密備份工作流程。

## Gemini 免費層

- 預設 `gemini-3.6-flash`。
- 每分鐘與每日限制可由環境變數調整。
- API Key 僅存在後端。
- API 失敗時回退至本機統計模式。

## 實體設備端需求

設備訂閱：

```text
factory/control/estop/<system_id>
```

執行後回傳：

```text
factory/control/estop/ack/<system_id>
```

Payload：

```json
{"command_id":"後端送出的 UUID","status":"executed"}
```
