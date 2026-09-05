#!/bin/sh
set -e

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Scrivia Cloud — Freebuff Desktop v2.0.0             ║"
echo "║  PocketBase + SQLite + Litestream → Cloudflare R2   ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── Run migrations ────────────────────────────────────────────────────────
if [ -d "/opt/freebuff/migrations" ]; then
  echo "[init] Running database migrations..."
  for migration in /opt/freebuff/migrations/*.sql; do
    if [ -f "$migration" ]; then
      echo "[init]  → $(basename $migration)"
      sqlite3 /var/lib/freebuff/data/pb_data.db < "$migration" 2>/dev/null || true
    fi
  done
fi

# ── Start Litestream in background ────────────────────────────────────────
if [ -n "$R2_ACCESS_KEY_ID" ] && [ -f "/opt/freebuff/litestream/litestream.yml" ]; then
  echo "[backup] Starting Litestream (syncing to R2/S3)..."
  litestream replicate -config /opt/freebuff/litestream/litestream.yml &
  LITESTREAM_PID=$!
  echo "[backup] Litestream PID: $LITESTREAM_PID"
else
  echo "[backup] Litestream disabled (no R2 credentials). Local backups only."
fi

# ── Start PocketBase ──────────────────────────────────────────────────────
echo "[server] Starting PocketBase on port ${APP_PORT:-8090}..."
exec pocketbase serve \
  --http=0.0.0.0:${APP_PORT:-8090} \
  --dir=/var/lib/freebuff/data \
  --publicDir=/opt/freebuff/frontend/dist \
  --autoscan=true \
  "$@"
