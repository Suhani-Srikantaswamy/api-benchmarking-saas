# ── Stage 1: Build dependencies ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ── Stage 2: Get k6 binary from official image ────────────────────────────────
FROM grafana/k6:0.49.0 AS k6

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy k6 binary from official image (no curl/download needed)
COPY --from=k6 /usr/bin/k6 /usr/local/bin/k6

# Copy application source
COPY src/ ./src/
COPY k6/ ./k6/
COPY package.json ./

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/index.js"]
