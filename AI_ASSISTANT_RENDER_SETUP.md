# Gemini AI 助理 Render 部署說明

這個版本已將網站的 OpenAI API 呼叫改為 **Gemini API 免費層**，AI 頁面與原本的登入、MQTT、MongoDB、良率統計功能都保留。

## 已修改的功能

- AI 頁面：`/ai.html`
- 前端：`public/ai.js`
- 後端：`server.cjs`
- 後端 API：
  - `GET /api/ai/status`
  - `POST /api/ai/chat`
- 依登入者權限查詢 MongoDB 的 defects 資料
- Gemini 可以分析：
  - 良率與 NG 率
  - 哪個產品 NG 最多
  - 最近 20 筆 NG 數
  - MQTT 測試資料格式
  - 事件紀錄沒資料時的檢查步驟
- Gemini 額度用完或連線失敗時，自動切換成本機統計備援模式

## 第一步：建立免費 Gemini API Key

1. 登入 Google AI Studio。
2. 建立或選擇一個 Google Cloud 專案。
3. 建立 Gemini API Key。
4. 不要把 API Key 寫進前端檔案或公開 GitHub。

## 第二步：Render 新增 Environment Variables

到 Render → Web Service → Environment，新增：

```env
GEMINI_API_KEY=你的 Gemini API Key
GEMINI_MODEL=gemini-3.1-flash-lite
```

`gemini-3.1-flash-lite` 支援 Gemini API 免費層，適合這個網站的統計分析與一般問答。實際免費次數與速率限制，以 Google AI Studio 專案顯示為準。

若沒有設定 `GEMINI_API_KEY`，AI 頁面仍可使用，但會顯示「本機統計模式」。

## 第三步：重新部署

1. 把修改後的檔案 push 到 GitHub。
2. 到 Render 選擇 `Manual Deploy` → `Deploy latest commit`。
3. 部署完成後打開：

```text
https://defect-system-render.onrender.com/ai.html
```

4. 登入後確認右上角顯示：

```text
Gemini API 免費層｜gemini-3.1-flash-lite
```

## 更新後仍看到舊畫面

網站有 Service Worker 快取，可使用：

- 網站內的「修復快取」功能
- 瀏覽器按 `Ctrl + F5`
- 或清除該網站的快取後重新登入

## MQTT 測試格式範例

```json
{
  "tenant_id": "T1780383390853",
  "system_id": "S1780383304915",
  "id": "case_001",
  "status": "OK",
  "product": "螺帽"
}
```

```json
{
  "tenant_id": "T1780383390853",
  "system_id": "S1780383304915",
  "id": "case_002",
  "status": "NG",
  "product": "螺帽"
}
```

## 安全限制

- `POST /api/ai/chat` 必須帶 JWT。
- AI 查詢有速率限制，單次問題最多 2000 字。
- AI 只會讀取登入者有權限的 tenant/system 資料。
- Gemini 回傳失敗時會改用本機統計備援，不會暴露正式環境錯誤細節。
