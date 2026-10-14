# 管理員模擬 NG 圖片上傳（2026-10-14）

- 路徑：圖片追溯 `image-trace.html`，僅 `super_admin` 顯示操作區。
- 在頁面啟用開關，選擇機台與產品，挑選 JPG/PNG/WebP 圖片（預設最大 5 MB）後上傳。
- 自動建立 `TEST` NG 事件，`source=ADMIN_DEMO_IMAGE`，圖片儲存 MongoDB GridFS。
- 下方管理員資料模式選「測試資料」查看；一般客戶 API 只能看 PRODUCTION。
- 開關預設關閉、儲存 MongoDB；關閉後，後端也會拒絕新增模擬圖片。
- 原 `/api/device/ng-image` 未修改，正式 YOLO/Python 圖片上傳維持原有機制。
- 關閉開關不會刪掉舊模擬事件；如需刪除請另行確認資料與權限。
- 只有完成 Render 部署並用平台總管理員登入，才可實際驗證。
