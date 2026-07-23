# 備份、資料保留與監控

## 1. Render 健康監控

`.github/workflows/health-monitor.yml` 每小時檢查一次 `/health`。

網站不是預設網址時，在 GitHub Repository Secrets 新增：

```text
HEALTH_URL=https://你的網址.onrender.com/health
```

## 2. MongoDB 加密備份

`.github/workflows/mongodb-backup.yml` 每日建立一次加密備份，保留 7 天。

必須在 GitHub Repository Secrets 新增：

```text
MONGODB_URI=MongoDB 連線字串
BACKUP_PASSPHRASE=至少 20 字元的備份加密密碼
```

備份上傳前會先用 AES-256-CBC + PBKDF2 加密，不會將明文資料庫檔案保存成 Artifact。

## 3. 資料保留

Render Environment 可設定：

```text
DEFECT_RETENTION_DAYS=365
AUDIT_RETENTION_DAYS=365
```

設定為 `0` 代表不自動刪除。伺服器啟動及每 24 小時會清理超過指定天數的資料。
