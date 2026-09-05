# ═══════════════════════════════════════════════════════════════════════════
# Freebuff Desktop — Docker Image (PocketBase + Litestream + Frontend)
# ═══════════════════════════════════════════════════════════════════════════
# Build:   docker build -t freebuff .
# Run:     docker run -d -p 8090:8090 --name freebuff freebuff
# Cost:    $3-5/mo on a VPS or free on Render/Fly.io/Railway
# ═══════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build frontend ──────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* frontend/bun.lock* ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache \
    ca-certificates \
    curl \
    litestream \
    sqlite \
    tzdata \
    && adduser -D -h /opt/freebuff freebuff

# PocketBase binary
COPY --from=ghcr.io/pocketbase/pocketbase:latest /pocketbase /usr/local/bin/pocketbase

# Application files
WORKDIR /opt/freebuff
COPY pocketbase/migrations/ /opt/freebuff/migrations/
COPY litestream/ /opt/freebuff/litestream/
COPY deploy/ /opt/freebuff/deploy/
COPY frontend/dist/ /opt/freebuff/frontend/dist/
COPY .env* /opt/freebuff/

# Data volume
RUN mkdir -p /var/lib/freebuff/data && chown -R freebuff:freebuff /var/lib/freebuff

USER freebuff

# ── Entrypoint ───────────────────────────────────────────────────────────
COPY deploy/docker-entrypoint.sh /opt/freebuff/entrypoint.sh
ENTRYPOINT ["/opt/freebuff/entrypoint.sh"]

EXPOSE 8090

# ── Health check ─────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8090/api/health || exit 1
