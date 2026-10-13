# 資料模式管理權限修正

- `super_admin`（平台總管理員）：可查看 TEST、LEGACY、ALL，並調整機台 TEST/PRODUCTION 模式。
- `tenant_admin`（客戶管理員）及 `user`（一般使用者）：只可查詢 PRODUCTION 資料；事件紀錄及報表頁不顯示「管理員資料檢視」。
- 伺服器端 `/api/admin/data-mode` GET/PUT 只允許 `super_admin`，單靠手動輸入網址或變更瀏覽器角色欄位不會獲得權限。
- 影像讀取亦依後端正式資料規則過濾。

注意：過去的 MQTT 測試事件屬 TEST 或 LEGACY，不會自動變成 PRODUCTION。正式上線時仍需由平台總管理員設定機台模式，並驗證現場來源。
