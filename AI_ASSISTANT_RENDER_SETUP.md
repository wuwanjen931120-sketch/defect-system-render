# Gemini AI 助理設定

本專案使用 Gemini API。沒有設定 API Key 時，AI 頁面仍會使用本機統計備援模式。

## Render 環境變數

```text
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_MODEL=gemini-3.1-flash-lite
AI_REQUESTS_PER_MINUTE=10
```

API Key 必須放在 Render 後端環境變數，不可寫進 `public/ai.js`、HTML 或公開 GitHub。

## 呼叫流程

```text
AI 頁面 → POST /api/ai/chat → JWT 與機台權限檢查
→ 取得最多 500 筆授權範圍內的瑕疵資料
→ Gemini API → 回傳繁體中文分析
```

若 Gemini 遇到免費額度限制或連線失敗，後端會自動回傳本機統計結果。AI 路由另有每分鐘速率限制，避免 API Key 被濫用。
