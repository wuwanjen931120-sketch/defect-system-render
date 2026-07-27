#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?請先設定 MONGODB_URI}"
: "${BACKUP_PASSPHRASE:?請先設定 BACKUP_PASSPHRASE}"
: "${CONFIRM_RESTORE:?必須設定 CONFIRM_RESTORE=YES}"

if [[ "$CONFIRM_RESTORE" != "YES" ]]; then
  echo "為避免誤覆蓋資料，CONFIRM_RESTORE 必須等於 YES" >&2
  exit 1
fi

FILE="${1:?用法：scripts/restore-mongodb.sh backup-file.archive.gz.enc}"
test -f "$FILE" || { echo "找不到備份檔：$FILE" >&2; exit 1; }

TEMP_FILE="$(mktemp --suffix=.archive.gz)"
trap 'rm -f "$TEMP_FILE"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$FILE" \
  -out "$TEMP_FILE" \
  -pass env:BACKUP_PASSPHRASE

gzip -t "$TEMP_FILE"
mongorestore --uri="$MONGODB_URI" --archive="$TEMP_FILE" --gzip --drop

echo "MongoDB restore completed."
