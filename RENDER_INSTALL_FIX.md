# Render 安裝失敗處理

## npm `ETIMEDOUT` 或出現內部 registry 網址

本版已同時使用：

```text
.npmrc
render-build.sh
package-lock.json
```

固定從以下公開來源安裝：

```text
https://registry.npmjs.org/
```

`package-lock.json` 不含 `applied-caas`、`internal.api.openai.org` 或其他內部 Artifactory 網址。

更新 GitHub 後執行：

```text
Manual Deploy → Clear build cache & deploy
```

## `ENOTEMPTY`、npm cache 或安裝中斷

1. Build Command：`bash render-build.sh`
2. Start Command：`npm start`
3. Node：22.x
4. 清除 build cache 後重新部署

`render-build.sh` 會刪除舊 `node_modules`，再執行 `npm ci --no-audit --no-fund`。
