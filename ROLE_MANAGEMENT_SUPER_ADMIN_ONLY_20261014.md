# 角色與機台管理 — 僅平台系統管理員

- 「角色與機台」只在平台 `super_admin` 左側選單顯示。
- 非平台系統管理員直接訪問 `/user-manage.html`，伺服器驗證 Session 後回傳 403（未登入為 401）。
- `/api/admin/users`、`/api/admin/create-user`、`PATCH /api/admin/users/:id` 只允許 `super_admin`。
- 此變更代表客戶管理員不再能在此頁面管理一般使用者，符合「只給系統管理員」的要求。
- 其他機台與客戶資料不刪除，其他資料 API 權限保持原有設定。
