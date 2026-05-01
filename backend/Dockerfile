# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (layer caching — only re-runs npm ci if packages change)
COPY package*.json ./
RUN npm ci --only=production

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source and k6 script
COPY src/ ./src/
COPY k6/ ./k6/
COPY package.json ./

# Install k6 — architecture-aware (works on amd64 AND arm64)
RUN apk add --no-cache curl bash && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then K6_ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then K6_ARCH="arm64"; \
    else K6_ARCH="amd64"; fi && \
    curl -L "https://github.com/grafana/k6/releases/download/v0.49.0/k6-v0.49.0-linux-${K6_ARCH}.tar.gz" \
    -o /tmp/k6.tar.gz && \
    tar -xzf /tmp/k6.tar.gz -C /tmp && \
    mv "/tmp/k6-v0.49.0-linux-${K6_ARCH}/k6" /usr/local/bin/k6 && \
    rm -rf /tmp/k6* && \
    chmod +x /usr/local/bin/k6

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000

# Health check — only valid when running as API server (not worker)
# Worker overrides this in docker-compose with 'disable: true'
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/index.js"]
