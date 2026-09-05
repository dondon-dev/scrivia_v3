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

# ── Stage 2: Build custom PocketBase binary ───────────────────────────────
# The custom routes in pocketbase/main.go (e.g. /api/permissions, /api/regions)
# must be compiled in — the stock PocketBase binary does NOT include them.
FROM golang:1.23-alpine AS pb-builder

RUN apk add --no-cache gcc musl-dev
WORKDIR /build
COPY pocketbase/ ./

RUN go mod download \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/pocketbase .

# ── Stage 3: Production image ────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache \
    ca-certificates \
    curl \
    litestream \
    sqlite \
    tzdata \
    && adduser -D -h /opt/freebuff freebuff

# Custom PocketBase binary (built from pocketbase/main.go)
COPY --from=pb-builder /out/pocketbase /usr/local/bin/pocketbase

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
