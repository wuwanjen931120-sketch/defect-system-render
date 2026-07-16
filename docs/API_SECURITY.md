# API 與角色權限摘要

## 角色

- `super_admin`：可跨租戶管理與查詢。
- `tenant_admin`：只能操作自己租戶的機台與資料。
- `user`：只能查看 JWT 中被指派的 `systems`。

## 重要 API

| Method | Endpoint | 驗證 | 權限 |
|---|---|---|---|
| GET | `/api/defects` | JWT | 依 tenant/system 範圍限制，可用 `page`、`limit`、`system_id`、`products` |
| GET | `/api/summary` | JWT | 依 tenant/system 範圍限制 |
| GET | `/api/predict` | JWT | 依 tenant/system 範圍限制 |
| POST | `/api/ai/chat` | JWT + rate limit | 依 tenant/system 範圍限制，訊息最長 2000 字 |
| POST | `/api/current-product` | JWT | 僅 `super_admin`、`tenant_admin`，且必須有該機台權限 |
| POST | `/api/estop` | JWT | 僅 `super_admin`、`tenant_admin`，必填 `system_id`，會記錄 AuditLog |
| GET | `/api/admin/audit-logs` | JWT | `super_admin` 看全部；`tenant_admin` 只看自己租戶 |

## E-stop ACK

送出急停後，後端會同時 publish：

- `factory/control/{system_id}/estop`
- `factory/control/estop`（相容舊設備）

Payload 包含 `command_id`。設備執行後應 publish 到：

- `factory/control/ack`

範例：

```json
{
  "command_id": "後端送出的 UUID",
  "status": "executed",
  "system_id": "S1780383304915"
}
```

## 使用者機台指派

一般 `user` 文件可存：

```json
{
  "systems": ["S1780383304915"]
}
```

沒有被指派任何機台的一般使用者，API 會回傳 403，不會自動取得整個租戶的資料。
