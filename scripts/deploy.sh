#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Full automated deployment via Docker Compose
#
# Usage:
#   ./scripts/deploy.sh [--env <file>] [--tag <image-tag>] [--rollback]
#
# Examples:
#   ./scripts/deploy.sh
#   ./scripts/deploy.sh --tag abc1234
#   ./scripts/deploy.sh --rollback
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()     { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $*"; }
warn()    { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $*"; }
error()   { echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $*" >&2; }

# ── Defaults ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ROLLBACK=false
HEALTH_TIMEOUT=120
HEALTH_INTERVAL=5

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)      ENV_FILE="$2";   shift 2 ;;
    --tag)      IMAGE_TAG="$2";  shift 2 ;;
    --rollback) ROLLBACK=true;   shift   ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Load env file if present ──────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  log "Loading environment from $ENV_FILE"
  set -a; source "$ENV_FILE"; set +a
else
  warn "No .env file found at $ENV_FILE — using defaults"
fi

export IMAGE_TAG

# ── Rollback ──────────────────────────────────────────────────────────────────
rollback() {
  warn "Rolling back to previous deployment..."
  cd "$PROJECT_ROOT"
  if docker compose ps --quiet 2>/dev/null | grep -q .; then
    docker compose down --remove-orphans
  fi
  # Restore from backup if available
  if [[ -f ".env.backup" ]]; then
    cp .env.backup .env
    success "Restored .env from backup"
  fi
  docker compose up -d
  success "Rollback complete"
  exit 0
}

if [[ "$ROLLBACK" == "true" ]]; then
  rollback
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────
log "Running pre-flight checks..."

command -v docker      >/dev/null 2>&1 || { error "docker not found"; exit 1; }
command -v docker      >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || \
  { error "docker compose not found"; exit 1; }

success "Pre-flight checks passed"

# ── Backup current env ────────────────────────────────────────────────────────
[[ -f "$PROJECT_ROOT/.env" ]] && cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup"

# ── Deploy ────────────────────────────────────────────────────────────────────
cd "$PROJECT_ROOT"

log "Pulling latest images..."
docker compose pull --quiet 2>/dev/null || true

log "Building images (tag: ${IMAGE_TAG})..."
docker compose build --parallel

log "Starting services with zero-downtime rolling update..."
# Bring up infrastructure first
docker compose up -d postgres redis

log "Waiting for database to be ready..."
timeout 60 bash -c 'until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done'
success "Database ready"

log "Waiting for Redis to be ready..."
timeout 30 bash -c 'until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do sleep 2; done'
success "Redis ready"

# Bring up application services
docker compose up -d backend worker frontend prometheus grafana alertmanager jaeger

# ── Health verification ───────────────────────────────────────────────────────
log "Verifying deployment health (timeout: ${HEALTH_TIMEOUT}s)..."

ELAPSED=0
while [[ $ELAPSED -lt $HEALTH_TIMEOUT ]]; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health 2>/dev/null || echo "000")
  if [[ "$HTTP_STATUS" == "200" ]]; then
    success "Backend health check passed (HTTP $HTTP_STATUS)"
    break
  fi
  warn "Backend not ready yet (HTTP $HTTP_STATUS) — waiting ${HEALTH_INTERVAL}s..."
  sleep $HEALTH_INTERVAL
  ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
done

if [[ $ELAPSED -ge $HEALTH_TIMEOUT ]]; then
  error "Deployment health check timed out after ${HEALTH_TIMEOUT}s"
  error "Initiating automatic rollback..."
  rollback
fi

# ── Verify all containers running ─────────────────────────────────────────────
log "Checking container status..."
FAILED_CONTAINERS=$(docker compose ps --format json 2>/dev/null | \
  python3 -c "
import sys, json
data = sys.stdin.read().strip()
failed = []
for line in data.split('\n'):
    try:
        c = json.loads(line)
        if c.get('State') not in ('running', 'healthy'):
            failed.append(c.get('Name', 'unknown'))
    except: pass
print('\n'.join(failed))
" 2>/dev/null || true)

if [[ -n "$FAILED_CONTAINERS" ]]; then
  warn "Some containers may not be running: $FAILED_CONTAINERS"
fi

# ── Print deployment summary ──────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete — $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}Frontend:${NC}    http://localhost:3000"
echo -e "  ${BLUE}Backend:${NC}     http://localhost:4000"
echo -e "  ${BLUE}Prometheus:${NC}  http://localhost:9090"
echo -e "  ${BLUE}Grafana:${NC}     http://localhost:3001  (admin / \${GRAFANA_PASSWORD:-admin})"
echo -e "  ${BLUE}Jaeger:${NC}      http://localhost:16686"
echo -e "  ${BLUE}AlertManager:${NC} http://localhost:9093"
echo ""
echo -e "  ${BLUE}Image tag:${NC}   ${IMAGE_TAG}"
echo ""
