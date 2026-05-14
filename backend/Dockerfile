# ── Stage 1: Build dependencies ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip && \
  addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY backend/src/ ./src/
COPY backend/k6/ ./k6/
COPY backend/package.json ./
COPY analytics/ ./analytics/
RUN python3 -m venv /opt/analytics-venv && \
  /opt/analytics-venv/bin/pip install --no-cache-dir -r ./analytics/requirements.txt
ENV PATH="/opt/analytics-venv/bin:${PATH}"

# Install k6 only if not in CI environment
# In CI: image is built for scanning only, k6 not needed
# In production: set INSTALL_K6=true
ARG INSTALL_K6=false
RUN if [ "$INSTALL_K6" = "true" ]; then \
      apk add --no-cache curl && \
      ARCH=$(uname -m) && \
      if [ "$ARCH" = "x86_64" ]; then K6_ARCH="amd64"; else K6_ARCH="arm64"; fi && \
      curl -L "https://github.com/grafana/k6/releases/download/v0.49.0/k6-v0.49.0-linux-${K6_ARCH}.tar.gz" \
        -o /tmp/k6.tar.gz && \
      tar -xzf /tmp/k6.tar.gz -C /tmp && \
      mv "/tmp/k6-v0.49.0-linux-${K6_ARCH}/k6" /usr/local/bin/k6 && \
      rm -rf /tmp/k6* && \
      apk del curl; \
    fi

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/index.js"]
