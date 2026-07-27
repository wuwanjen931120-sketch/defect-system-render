# P1 / P2 完成報告（版本 1.1.0）

## P1：安全與登入

本次新增或補強：

- 正式環境公開註冊預設關閉。
- 正式環境如開啟註冊，強制要求至少 12 字元邀請碼。
- 啟動前檢查 MongoDB、JWT、HTTPS、CORS、SMTP、MQTT 群組設定。
- Cookie 正式環境預設 `HttpOnly + Secure + SameSite=Strict`。
- 密碼錯誤以「信箱 + 來源 IP」建立持久化 MongoDB 鎖定紀錄。
- OTP 增加單次 `challenge_id`，避免舊驗證碼或不同登入流程混用。
- OTP 寄送、密碼失敗、OTP 失敗、登入成功、登出均寫入 AuditLog。
- 使用者新增 `disabled`、`session_version`，停用或權限改動會讓既有 JWT 失效。
- 新增管理員更新使用者角色、機台與停用狀態 API。
- 新增 Permissions-Policy、Cross-Origin-Resource-Policy 與結構化後端 Log。
- 統一側邊欄改用 DOM API 與事件監聽，不再產生 inline `onclick`。

## P2：工程品質與維運

本次新增或補強：

- 管理員使用者、租戶與機台查詢加入分頁與總筆數 Header。
- 瑕疵篩選增加 status 與日期格式檢查。
- MQTT payload 增加大小及時間範圍限制。
- MQTT 寫入使用 idempotent upsert，降低 QoS 1 重送造成的重複資料。
- 加入複合唯一索引 `tenant_id + system_id + id`。
- E-stop ACK 驗證 command、topic、system 與 status，並加入逾時狀態。
- NG Email 告警加入資料庫 claim，降低同時訊息造成重複寄信。
- 新增 `/health/live`、`/health/ready` 與 SMTP 實際連線驗證。
- 新增 graceful shutdown，關閉 HTTP、MQTT 與 MongoDB 連線。
- 預設瑕疵與 AuditLog 保存 365 天。
- 新增舊瑕疵資料重複檢查及清理工具。
- 新增部署後自動驗收工具 `npm run verify:deployment`。
- CI 增加 coverage 與 high-level npm audit。
- 新增 Dependabot npm / GitHub Actions 每週更新。
- MongoDB 備份新增完整性、解密測試、checksum 與還原腳本。
- 單元測試增加環境變數、登入鎖定、E-stop、MQTT 時間驗證及靜態安全檢查。
- Gemini 預設模型維持 `gemini-3.6-flash`，並保留由環境變數覆寫的能力。

## 無法在 ZIP 內代替使用者完成的項目

- Render 私人環境變數的實際值。
- Brevo/Gmail 寄件者驗證與寄信額度。
- MongoDB Atlas 網路白名單與資料庫帳密。
- HiveMQ 憑證與實體設備 ACK 程式。
- GitHub Repository Secrets。
- 三種角色的真實展示帳號及實機整合驗收。

這些項目已提供自動檢查腳本與驗收文件，不再只依人工猜測。
