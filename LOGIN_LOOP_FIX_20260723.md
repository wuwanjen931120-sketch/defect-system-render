# 登入後跳回登入頁修正

## 原因
登入已改用 HttpOnly Cookie，但舊版 `public/core.js` 仍檢查不存在的 `info.token`。
因此即使驗證碼成功、Cookie 也已保存，儀表板載入時仍會被舊前端判定為未登入並送回登入頁。

## 修正
- `core.js` 改為等待 `window.authReady` 呼叫 `/api/session`。
- 不再用 `sessionStorage token` 當登入依據。
- 儀表板與事件紀錄 API 都會攜帶同來源 Cookie。
- 登入狀態失效時才導回 `login.html?reason=session-expired`。
- Service Worker 快取版本更新，所有登入相關腳本加入新版號。
- 將誤放在 `.github/workflows/.github/workflows/ci.yml` 的 CI 檔移回正確位置。

## 部署後
在 Render 使用 **Clear build cache & deploy**，完成後瀏覽器按 `Ctrl + F5`。
