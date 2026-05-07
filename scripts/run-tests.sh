#!/usr/bin/env bash
# =============================================================================
# run-tests.sh — Run all tests (backend + frontend) with reporting
#
# Usage:
#   ./scripts/run-tests.sh [--backend-only] [--frontend-only] [--ci]
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

RUN_BACKEND=true; RUN_FRONTEND=true; CI_MODE=false
BACKEND_EXIT=0;   FRONTEND_EXIT=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --backend-only)  RUN_FRONTEND=false; shift ;;
    --frontend-only) RUN_BACKEND=false;  shift ;;
    --ci)            CI_MODE=true;       shift ;;
    *) shift ;;
  esac
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  Test Suite Runner${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# ── Backend tests ─────────────────────────────────────────────────────────────
if [[ "$RUN_BACKEND" == "true" ]]; then
  echo -e "${BLUE}▶ Backend Tests${NC}"
  cd "$PROJECT_ROOT/backend"

  if [[ ! -d "node_modules" ]]; then
    echo "  Installing backend dependencies..."
    npm ci --silent
  fi

  if [[ "$CI_MODE" == "true" ]]; then
    npm run test:ci 2>&1 && BACKEND_EXIT=0 || BACKEND_EXIT=$?
  else
    npm test 2>&1 && BACKEND_EXIT=0 || BACKEND_EXIT=$?
  fi

  if [[ $BACKEND_EXIT -eq 0 ]]; then
    echo -e "  ${GREEN}✓ Backend tests passed${NC}"
  else
    echo -e "  ${RED}✗ Backend tests failed (exit $BACKEND_EXIT)${NC}"
  fi
  echo ""
fi

# ── Frontend tests ────────────────────────────────────────────────────────────
if [[ "$RUN_FRONTEND" == "true" ]]; then
  echo -e "${BLUE}▶ Frontend Tests${NC}"
  cd "$PROJECT_ROOT/frontend"

  if [[ ! -d "node_modules" ]]; then
    echo "  Installing frontend dependencies..."
    npm ci --silent
  fi

  if [[ "$CI_MODE" == "true" ]]; then
    npm run test:ci 2>&1 && FRONTEND_EXIT=0 || FRONTEND_EXIT=$?
  else
    npm test 2>&1 && FRONTEND_EXIT=0 || FRONTEND_EXIT=$?
  fi

  if [[ $FRONTEND_EXIT -eq 0 ]]; then
    echo -e "  ${GREEN}✓ Frontend tests passed${NC}"
  else
    echo -e "  ${RED}✗ Frontend tests failed (exit $FRONTEND_EXIT)${NC}"
  fi
  echo ""
fi

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL_EXIT=$((BACKEND_EXIT + FRONTEND_EXIT))

echo -e "${BLUE}═══════════════════════════════════════${NC}"
if [[ $TOTAL_EXIT -eq 0 ]]; then
  echo -e "  ${GREEN}✓ All tests passed${NC}"
else
  echo -e "  ${RED}✗ Some tests failed${NC}"
fi
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

exit $TOTAL_EXIT
