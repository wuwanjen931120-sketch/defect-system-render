# 登入成功後又跳回登入頁：修正說明

## 原因

登入成功後，瀏覽器必須保存後端送出的 HttpOnly Cookie。舊版本有三個容易造成登入迴圈的情況：

1. 登入完成後沒有先確認 Cookie 是否真的保存，就直接前往儀表板。
2. 驗證登入用的 `auth-bootstrap.js` 曾被 Service Worker 快取，部署新版本後瀏覽器可能繼續執行舊程式。
3. JWT 內放入完整機台清單，機台數量多時可能超過瀏覽器 Cookie 大小限制。

## 本次修正

- 登入成功後先呼叫 `/api/session`，確認 Cookie 可用後才進入儀表板。
- Cookie 改為 `SameSite=Lax`，並依 HTTPS/Render 代理資訊加入 `Secure`。
- JWT 只保存使用者識別資料；角色、租戶與機台權限每次由資料庫重新讀取。
- `auth-bootstrap.js` 不再加入 Service Worker 快取，所有受保護頁面加入版本參數。
- `/api/session` 暫時失敗時會重試三次，避免 Render 剛喚醒時直接跳回登入頁。
- 登入頁會顯示「登入過期」、「Cookie 未保存」或「服務暫時失敗」等較清楚的訊息。

## 部署後操作

1. Render 使用 **Clear build cache & deploy** 重新部署。
2. 首次開啟登入頁時按一次「修復灰底／警告（清快取）」。
3. 按 `Ctrl + F5`，重新登入。
4. 若仍失敗，瀏覽器開發者工具的 Application → Cookies 應看到 `defect_session`。
