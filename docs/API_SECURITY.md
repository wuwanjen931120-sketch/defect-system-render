# API 與角色權限摘要

## 角色

- `super_admin`：可跨租戶管理與查詢。
- `tenant_admin`：只能操作自己租戶內的機台、使用者與資料。
- `user`：只能查看或更新 JWT `systems` 中被指派的機台；不能執行急停或開啟管理 API。

## 重要 API

| Method | Endpoint | 驗證 | 權限與說明 |
|---|---|---|---|
| POST | `/api/login/send-code` | 帳密 | 驗證帳密後寄送 OTP；有寄送冷卻與 IP rate limit |
| POST | `/api/login/verify-code` | OTP | OTP 成功後才簽發 JWT；有到期與錯誤次數上限 |
| GET | `/api/defects` | JWT | 依 tenant/system 範圍限制；支援 `page`、`limit`、`system_id`、`products`、日期篩選 |
| GET | `/api/defects/export.csv` | JWT | 匯出授權範圍內資料，最多 10,000 筆，含 CSV 公式注入防護 |
| GET | `/api/summary` | JWT | 以 MongoDB aggregate 計算授權範圍內統計 |
| GET | `/api/predict` | JWT + rate limit | 依 tenant/system 範圍限制 |
| POST | `/api/ai/chat` | JWT + rate limit | 只使用授權範圍內資料；訊息最長 2,000 字 |
| POST | `/api/current-product` | JWT | `user` 只能改被指派機台；管理員依租戶範圍操作 |
| POST | `/api/estop` | JWT | 僅 `super_admin`、`tenant_admin`；必填 `system_id`，建立 `command_id` 與 AuditLog |
| GET | `/api/estop/:command_id` | JWT | 僅管理員查詢急停 ACK 狀態，租戶管理員只能查自己租戶 |
| GET | `/api/admin/audit-logs` | JWT | `super_admin` 可跨租戶；`tenant_admin` 只看自己租戶 |
| GET | `/api/admin/collection/:name` | JWT | 僅 `super_admin`；採白名單、分頁並排除敏感欄位 |

## E-stop MQTT 與 ACK

後端送出急停：

```text
Topic: factory/control/estop/<system_id>
Payload: {"command":"STOP","command_id":"...","tenant_id":"...","system_id":"...","requested_at":"..."}
```

設備執行後應回傳：

```text
Topic: factory/control/estop/ack/<system_id>
Payload: {"command_id":"後端送出的 UUID","status":"executed","system_id":"S..."}
```

網站可用 `GET /api/estop/:command_id` 查詢 `pending_ack` 或設備回傳狀態。

## 使用者機台指派

一般使用者文件：

```json
{
  "role": "user",
  "tenant_id": "T...",
  "systems": ["S..."]
}
```

未指派機台時，瑕疵查詢不會自動取得整個租戶資料。
