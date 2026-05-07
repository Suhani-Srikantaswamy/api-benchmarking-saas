#!/usr/bin/env bash
# =============================================================================
# health-check.sh — Verify all services are healthy after deployment
#
# Usage:
#   ./scripts/health-check.sh [--timeout 120]
#   Exit code 0 = all healthy, 1 = one or more failed
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

TIMEOUT=120
PASS=0; FAIL=0

while [[ $# -gt 0 ]]; do
  case $1 in --timeout) TIMEOUT="$2"; shift 2 ;; *) shift ;; esac
done

check_http() {
  local name="$1" url="$2" expected="${3:-200}"
  local elapsed=0 interval=5

  printf "  %-20s " "$name"
  while [[ $elapsed -lt $TIMEOUT ]]; do
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
    if [[ "$status" == "$expected" ]]; then
      echo -e "${GREEN}✓ UP${NC} (HTTP $status)"
      PASS=$((PASS+1)); return 0
    fi
    sleep $interval; elapsed=$((elapsed+interval))
  done
  echo -e "${RED}✗ DOWN${NC} (HTTP $status after ${TIMEOUT}s)"
  FAIL=$((FAIL+1)); return 1
}

check_tcp() {
  local name="$1" host="$2" port="$3"
  local elapsed=0 interval=5

  printf "  %-20s " "$name"
  while [[ $elapsed -lt $TIMEOUT ]]; do
    if nc -z "$host" "$port" 2>/dev/null; then
      echo -e "${GREEN}✓ UP${NC} (TCP $host:$port)"
      PASS=$((PASS+1)); return 0
    fi
    sleep $interval; elapsed=$((elapsed+interval))
  done
  echo -e "${RED}✗ DOWN${NC} (TCP $host:$port after ${TIMEOUT}s)"
  FAIL=$((FAIL+1)); return 1
}

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  Service Health Check${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

check_http "Backend API"    "http://localhost:4000/health"    "200"
check_http "Frontend"       "http://localhost:3000"           "200"
check_http "Prometheus"     "http://localhost:9090/-/healthy" "200"
check_http "Grafana"        "http://localhost:3001/api/health" "200"
check_http "Jaeger UI"      "http://localhost:16686"          "200"
check_http "AlertManager"   "http://localhost:9093/-/healthy" "200"
check_tcp  "PostgreSQL"     "localhost" "5432"
check_tcp  "Redis"          "localhost" "6379"

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "  Results: ${GREEN}${PASS} passed${NC} / ${RED}${FAIL} failed${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
