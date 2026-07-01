# 0701 修正版說明

這一版修正：

1. 左側選單統一
   - dashboard.html、logs.html、settings.html、ai.html 都會由 public/core.js 自動統一左側選單。
   - 統一項目：首頁、事件紀錄、系統設定、AI 助理、管理後台、修復快取、登出。

2. AI 助理查詢篩選新增「查看全部」
   - 在 AI 助理頁面按「查看全部」會清空機台 system_id 與產品名稱 products。
   - 會重新讀取目前帳號權限內的全部資料。

3. 保留原本 Brevo 驗證碼登入
   - server.cjs 使用 Brevo SMTP：smtp-relay.brevo.com:2525。
   - 不再使用 Gmail SMTP，避免 Render 上 Gmail 連線 timeout。

4. OPENAI_API_KEY 說明
   - 沒有 OPENAI_API_KEY 不會影響登入、事件紀錄、首頁、良率統計。
   - 沒有 key 時 AI 助理會使用本機統計模式。
   - 想讓 AI 像 GPT 一樣自然回答，才需要在 Render Environment Variables 加上 OPENAI_API_KEY。

## 上傳方式

建議直接把整包解壓後，上傳到 GitHub 覆蓋同名檔案：

- server.cjs
- package.json
- package-lock.json
- render.yaml
- public/ 整個資料夾
- AI_ASSISTANT_RENDER_SETUP.md
- README_DEPLOY.md
- .env.example

如果怕影響其他功能，至少要覆蓋：

- server.cjs
- public/core.js
- public/style.css
- public/ai.html
- public/ai.js
- public/sw.js

上傳後 Render：Manual Deploy → Deploy latest commit。

## Render Environment Variables

原本功能必須保留：

BREVO_SMTP_LOGIN=你的 Brevo SMTP login
BREVO_SMTP_KEY=你的 Brevo SMTP key
BREVO_SENDER_EMAIL=你在 Brevo 驗證過的寄件信箱
MONGODB_URI=你的 MongoDB URI
JWT_SECRET=任意長密碼
HIVEMQ_USER=你的 HiveMQ 使用者
HIVEMQ_PASS=你的 HiveMQ 密碼

AI 真正 GPT 模式才需要：

OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
