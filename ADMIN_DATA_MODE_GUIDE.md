# 平台總管理員資料檢視規則

- 平台總管理員（super_admin）：首頁、事件紀錄與報表可選正式、測試或全部。
- 測試資料包含 TEST、LEGACY 和舊紀錄未設定 data_mode 的資料；**不刪改既有 MongoDB 資料**。
- 客戶管理員與一般使用者：伺服器一律限制只能讀取 PRODUCTION，沒有管理員下拉選單。
- 這是**檢視篩選**；與系統設定裡機台 TEST/PRODUCTION **接收模式**不同，切換檢視不會更改 MQTT 分類。
- 若歷史事件本身曾被錯誤標為 PRODUCTION，不會自動重新判定，需要另行核對後資料修復。
- 正式環境部署後以 super_admin、tenant_admin、user 各一帳號驗證 `/api/summary`、`/api/defects`、`/api/lane-status` 的資料隔離，及頁面權限。
