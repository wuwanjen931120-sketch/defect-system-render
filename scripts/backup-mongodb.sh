#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?請先設定 MONGODB_URI}"
: "${BACKUP_PASSPHRASE:?請先設定 BACKUP_PASSPHRASE}"

OUT_DIR="${1:-backup}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/mongodb-$STAMP.archive.gz.enc"

mongodump --uri="$MONGODB_URI" --archive --gzip \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_PASSPHRASE -out "$FILE"

echo "Encrypted backup created: $FILE"
