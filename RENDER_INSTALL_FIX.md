# Render npm ENOTEMPTY 修正

錯誤：`ENOTEMPTY ... node_modules/form-data`。

Render Dashboard 請設定：

- Build Command：`bash render-build.sh`
- Start Command：`npm start`
- Environment：`NODE_VERSION=22.23.1`

儲存後執行：

`Manual Deploy` → `Clear build cache & deploy`

本修正版也已將 package-lock.json 內不可公開存取的內部套件網址改回 `https://registry.npmjs.org/`。
