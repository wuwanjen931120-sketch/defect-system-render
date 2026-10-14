# 暫時隱藏機台狀態和告警中心選單

以 defect-system-render-main(5).zip 為基礎。

- `public/core.js`：移除動態側邊欄「機台狀態」和「告警中心」入口。
- `public/sidebar-common.js`：同步移除另一個共用側邊欄中的兩個入口。
- `public/*.html`：移除原有靜態側邊欄內的相應入口。
- 沒有刪除 `machine-status.html`、`alerts.html`，也沒有移除後端 API、自動告警機制、MongoDB 歷史資料。原網址仍可直接開啟。
- 未來恢復選單可將上面修改的檔案還原為原版。
