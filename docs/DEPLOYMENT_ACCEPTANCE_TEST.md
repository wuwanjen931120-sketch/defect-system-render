# 正式部署驗收清單

## A. 自動檢查

在本機專案資料夾執行：

```bash
npm run verify:deployment -- https://你的服務名稱.onrender.com
```

所有項目必須顯示綠色勾勾。

## B. 登入與安全

1. 故意輸入錯誤密碼 5 次，確認系統回傳暫時鎖定與 `Retry-After`。
2. 等待或由資料庫清除測試鎖定後，輸入正確密碼寄送 OTP。
3. 重新寄送 OTP，確認舊 `challenge_id` 與舊驗證碼失效。
4. OTP 故意輸入錯誤達上限，確認必須重新寄送。
5. 登入後在瀏覽器 Application → Cookies 確認 `defect_session` 具有 HttpOnly、Secure、SameSite=Strict。
6. 確認 Local Storage 與 Session Storage 都沒有 JWT。
7. 停用測試帳號或修改其機台權限，確認既有登入立即失效。

## C. 角色與資料作用域

準備：

- 一個 `super_admin`。
- 一個租戶 A 的 `tenant_admin`。
- 一個租戶 A、只指派機台 A1 的 `user`。
- 一個租戶 B 與機台 B1。

驗收：

1. 一般使用者只能看到 A1，不能以 query string 查 A2 或 B1。
2. 租戶管理員只能管理租戶 A，不能讀取租戶 B。
3. 超級管理員可以指定租戶查詢，但所有操作會寫入 AuditLog。
4. 一般使用者呼叫 E-stop 必須收到 403。
5. 租戶管理員不可把自己升級成 super_admin，也不可管理其他租戶。

## D. MQTT 與資料品質

1. 發送合法 OK / NG payload，確認 MongoDB 寫入。
2. 重送相同 `tenant_id + system_id + id`，確認不增加第二筆。
3. 發送錯誤 status、JavaScript URL、過大 payload、過舊或過度未來時間，確認被拒絕。
4. 發送不存在的 system_id，確認不寫入資料。
5. 檢查 `/api/mqtt/latest`，一般使用者不可看到未授權機台。

## E. E-stop

1. 管理員送出 E-stop，記錄 `command_id`。
2. 設備以正確 topic、system_id、command_id 回傳 `executed`，網站應顯示完成。
3. 使用錯誤 system_id 或未知 command_id 回傳 ACK，後端應忽略並記錄警告。
4. 不回傳 ACK，超過 `ESTOP_ACK_TIMEOUT_SECONDS` 後狀態應為 `timed_out`。
5. 系統不得自動重送 E-stop；由操作人員人工確認設備狀態。

## F. 備份與復原

1. GitHub Repository Secrets 設定 `MONGODB_URI` 與至少 20 字元 `BACKUP_PASSPHRASE`。
2. 手動執行 MongoDB backup workflow。
3. Artifact 應只有 `.enc` 與 `.sha256`，不能有明文 archive。
4. 下載至隔離測試資料庫，以 `scripts/restore-mongodb.sh` 測試還原。
5. 還原測試時必須使用不同資料庫，避免覆蓋正式資料。
