#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Freebuff Desktop v2 — Build & Package Script
# ═══════════════════════════════════════════════════════════════════════════
# Usage:
#   ./scripts/build.sh              # Build for web deployment
#   ./scripts/build.sh --windows    # Build Windows .exe installer
#   ./scripts/build.sh --android    # Build Android .apk
#   ./scripts/build.sh --docker     # Build Docker image
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔══════════════════════════════════════════════╗"
echo "║  Freebuff Desktop v2 — Build Script          ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. Build Frontend ────────────────────────────────────────────────────
echo ""
echo "▸ Building frontend..."
cd "$ROOT_DIR/frontend"
npm ci 2>/dev/null || npm install
npm run build
echo "  ✓ Frontend built → frontend/dist/"

# ── 2. Build PocketBase (Go backend) ─────────────────────────────────────
echo ""
echo "▸ Building PocketBase backend..."
cd "$ROOT_DIR/pocketbase"

if command -v go &>/dev/null; then
  # Build as a static binary for deployment
  CGO_ENABLED=0 go build -ldflags="-s -w" -o ../dist/pocketbase main.go
  echo "  ✓ PocketBase built → dist/pocketbase"
else
  echo "  ⚠ Go not installed — downloading PocketBase binary..."
  PB_VERSION="0.22.18"
  curl -sL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.tar.gz" | tar xz -C ../dist/
  echo "  ✓ PocketBase downloaded → dist/pocketbase"
fi

# ── 3. Package specific target ──────────────────────────────────────────
TARGET="${1:-web}"

case "$TARGET" in
  --windows)
    echo ""
    echo "▸ Building Windows installer..."
    if command -v cargo &>/dev/null; then
      cd "$ROOT_DIR/tauri/src-tauri"
      cargo tauri build --target x86_64-pc-windows-msvc
      echo "  ✓ Windows installer built"
    else
      echo "  ✗ Rust/Cargo not installed. Install from https://rustup.rs"
    fi
    ;;

  --android)
    echo ""
    echo "▸ Building Android APK..."
    if command -v cargo &>/dev/null && [ -n "${ANDROID_HOME:-}" ]; then
      cd "$ROOT_DIR/tauri/src-tauri"
      cargo tauri android build
      echo "  ✓ Android APK built"
    else
      echo "  ✗ Requires Rust + Android SDK. See https://v2.tauri.app/start/prerequisites/"
    fi
    ;;

  --docker)
    echo ""
    echo "▸ Building Docker image..."
    docker build -t freebuff:latest -f "$ROOT_DIR/deploy/Dockerfile" "$ROOT_DIR"
    echo "  ✓ Docker image built: freebuff:latest"
    ;;

  *)
    echo ""
    echo "▸ Web deployment ready."
    echo "  Frontend: frontend/dist/"
    echo "  Backend:  dist/pocketbase"
    echo "  Migrate:  pocketbase/migrations/001_init_schema.sql"
    echo ""
    echo "  To run locally:"
    echo "    cd dist && ./pocketbase serve --http=0.0.0.0:8090 --publicDir=../frontend/dist"
    ;;
esac

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Build complete!                             ║"
echo "╚══════════════════════════════════════════════╝"
