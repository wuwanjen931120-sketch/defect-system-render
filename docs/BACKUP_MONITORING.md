# 備份、資料保留與監控

## 1. Render Readiness 監控

`.github/workflows/health-monitor.yml` 每小時檢查一次 `/health/ready`，並驗證 JSON 的 `status` 必須是 `ok`。

網站不是預設網址時，在 GitHub Repository Secrets 新增：

```text
HEALTH_URL=https://你的網址.onrender.com/health/ready
```

## 2. MongoDB 加密備份

`.github/workflows/mongodb-backup.yml` 每日建立一次加密備份，保留 14 天。

必須在 GitHub Repository Secrets 新增：

```text
MONGODB_URI=MongoDB 連線字串
BACKUP_PASSPHRASE=至少 20 字元的備份加密密碼
```

工作流程會：

1. `mongodump --archive --gzip`。
2. `gzip -t` 驗證明文 archive。
3. AES-256-CBC + PBKDF2 加密。
4. 立刻解密到 pipe 並再次 `gzip -t`。
5. 產生 SHA-256 checksum。
6. 刪除明文，只上傳 `.enc` 與 `.sha256`。

## 3. 還原

請先在隔離測試資料庫驗證，勿直接覆蓋正式資料：

```bash
export MONGODB_URI='測試資料庫連線字串'
export BACKUP_PASSPHRASE='備份密碼'
export CONFIRM_RESTORE=YES
scripts/restore-mongodb.sh backup-file.archive.gz.enc
```

## 4. 資料保留

Render Environment 預設：

```text
DEFECT_RETENTION_DAYS=365
AUDIT_RETENTION_DAYS=365
```

設定為 `0` 代表不自動刪除。伺服器啟動及每 24 小時會清理超過指定天數的資料。

## 5. 部署後自動驗收

```bash
npm run verify:deployment -- https://你的網址.onrender.com
```

會檢查 Health、登入服務、公開註冊、安全標頭及 PWA 資源。
