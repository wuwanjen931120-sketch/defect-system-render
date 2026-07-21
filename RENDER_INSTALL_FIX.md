# Render 安裝失敗處理

若出現 `ENOTEMPTY`、npm cache 或安裝中斷：

1. Build Command 設為 `bash render-build.sh`。
2. Start Command 設為 `npm start`。
3. Node 使用 22.x；`render.yaml` 目前指定 `NODE_VERSION=22.23.1`。
4. 執行 `Manual Deploy → Clear build cache & deploy`。

`render-build.sh` 會先移除舊 `node_modules`，再使用 `package-lock.json` 執行 `npm ci --no-audit --no-fund`。
