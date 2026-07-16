# 1150713 審查報告修正紀錄

## 已完成的核心修正

- 統一並保留 `index.html`、`login.html`、`dashboard.html` 等正式檔名。
- 補上 `icon-512.png`，Service Worker 只快取靜態檔案，不快取 API、登入或健康檢查回應。
- 移除 `public/server.js`，避免後端程式碼被靜態下載。
- `defects`、`summary`、`predict`、`site-config`、`systems`、`current-product` 全面加入租戶與機台作用域檢查。
- 急停限制為 `tenant_admin` / `super_admin`，必須指定機台，加入 `command_id`、ACK Topic 與 `audit_logs`。
- OTP 改存 MongoDB TTL collection，加入寄送冷卻、驗證次數限制與過期清理。
- 關閉直接密碼登入，統一使用帳密驗證後寄 OTP、OTP 成功才簽發 JWT。
- 加入 Helmet、安全 HTTP headers、CORS allowlist、請求大小限制、API 速率限制與 request id。
- 管理頁排除 password、token、secret 等敏感欄位，並加入分頁上限。
- 加入密碼政策、公開註冊開關與註冊速率限制。
- MQTT payload 加入欄位、型別、狀態與單次筆數驗證。
- NG 告警改為 MongoDB 時間窗統計與冷卻，不再依賴伺服器記憶體計數。
- 加入 Defect、OTP、User、System、AuditLog 索引。
- 修正動態畫面中的主要 XSS 輸出點，加入本機 DOMPurify 與 HTML escaping 工具。
- `npm audit` 已降為 0 個已知漏洞。
- 新增 Node 單元測試、`npm run check` 與 GitHub Actions CI。

## 仍需硬體端配合

急停 ACK 不是單靠網站即可完成。設備端需：

1. 訂閱 `factory/control/estop/<system_id>`。
2. 執行急停後 publish 至 `factory/control/estop/ack/<system_id>`。
3. Payload 至少包含 `command_id` 與 `status`。

範例：

```json
{"command_id":"後端送出的 UUID","status":"executed"}
```

## 建議後續功能

報表匯出、告警中心、圖片追溯與完整角色/機台管理介面屬新增功能，不是安全修補的一部分，建議在核心流程實機驗證完成後再分階段加入。
