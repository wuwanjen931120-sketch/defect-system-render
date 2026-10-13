# 資料模式（管理員）

- 機台在「系統設定」由 super_admin / tenant_admin 設定 TEST 或 PRODUCTION；未設定預設 TEST。
- 只有系統管理員可透過 API 查看 TEST / LEGACY / ALL。一般使用者 API 只返回 PRODUCTION，即使自行修改 URL 也會遭拒。
- 舊紀錄沒有 data_mode，不會自動當成正式；管理員在事件紀錄與報表中心可選「舊資料（未分類）」。
- 新 MQTT 事件的 data_mode 由後端讀取機台當下模式設定，不接受 MQTT payload 指定。
- 同一 event_id 重送不會改變既存事件的 data_mode，避免透過重送把測試轉正式。
- 切換正式前先停止所有模擬發布器，並確保 Broker 身分驗證、裝置憑證和 topic ACL。這個模式是管理性分類，不是密碼學來源證明。
- 機台 heartbeat、其他告警與獨立影像服務不會因本資料模式自動完成現場驗證。
- 部署後測試：TEST 寫入事件，普通使用者不得看見；管理員能在 TEST 檢視；改 PRODUCTION 後寫入新事件，正式統計增加；舊事件不應被重分類。
