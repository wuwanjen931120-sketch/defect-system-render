# AI 助理 Render 部署說明

這版已經不是 WordPress 外掛，而是直接把「AI Engine 類似功能」加進原本的 Node.js / Express 瑕疵辨識網站。

## 新增功能

- 新增頁面：`/ai.html`
- 新增前端：`public/ai.js`
- 新增後端 API：
  - `GET /api/ai/status`
  - `POST /api/ai/chat`
- 側邊欄會自動增加「🤖 AI 助理」
- 右下角會出現「🤖 AI 助理」浮動按鈕
- 可依登入者權限查詢 MongoDB 的 defects 資料
- 可回答：
  - 良率 = OK ÷ (OK + NG) × 100%
  - NG率 = NG ÷ (OK + NG) × 100%
  - 哪個產品 NG 最多
  - 最近 20 筆 NG 數
  - MQTT 測試資料格式
  - 事件紀錄沒資料時要檢查什麼

## Render 要新增的 Environment Variables

到 Render → 你的 Web Service → Environment → Add Environment Variable：

```env
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
```

沒有設定 `OPENAI_API_KEY` 時，AI 頁面仍可使用，但會是「本機統計模式」，只會根據 OK/NG 統計固定分析。

## 部署步驟

1. 把這包檔案上傳或 push 到 GitHub。
2. Render 會自動重新部署。
3. 部署完成後，打開：

```text
https://defect-system-render.onrender.com/ai.html
```

4. 登入後就可以使用 AI 助理。

## 更新後若看不到 AI 按鈕

因為網站有 Service Worker 快取，請按：

- 首頁的「修復灰底／警告（清快取）」
- 或瀏覽器按 `Ctrl + F5`

## MQTT 測試格式範例

單筆 OK：

```json
{
  "tenant_id": "T1780383390853",
  "system_id": "S1780383304915",
  "id": "case_001",
  "status": "OK",
  "product": "螺帽"
}
```

單筆 NG：

```json
{
  "tenant_id": "T1780383390853",
  "system_id": "S1780383304915",
  "id": "case_002",
  "status": "NG",
  "product": "螺帽"
}
```
