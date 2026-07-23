# Gemini API 免費層設定

本專案 AI 使用 Gemini API，預設模型為：

```text
GEMINI_MODEL=gemini-3.6-flash
```

Render → Environment 新增：

```text
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_MODEL=gemini-3.6-flash
AI_REQUESTS_PER_MINUTE=5
AI_REQUESTS_PER_DAY=100
```

注意：

- API Key 只能放在 Render Environment，不可貼進 `public` 或上傳 GitHub。
- 免費層的模型、配額與限制可能由 Google 調整。
- 免費層送出的內容可能用於改善 Google 產品，請勿傳送機密資料。
- 額度用完、模型不可用或 API 暫時失敗時，網站會自動切換成本機統計模式。

官方資料：

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/rate-limits
