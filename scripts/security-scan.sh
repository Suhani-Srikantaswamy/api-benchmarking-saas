#!/usr/bin/env bash
# =============================================================================
# security-scan.sh — Run npm audit + dependency checks
#
# Usage:
#   ./scripts/security-scan.sh [--fail-on-high]
#   Exit code 0 = clean, 1 = vulnerabilities found (when --fail-on-high)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FAIL_ON_HIGH=false
OVERALL_EXIT=0

while [[ $# -gt 0 ]]; do
  case $1 in --fail-on-high) FAIL_ON_HIGH=true; shift ;; *) shift ;; esac
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  Security Scan${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

scan_dir() {
  local name="$1" dir="$2"
  echo -e "${BLUE}▶ $name${NC}"
  cd "$dir"

  if [[ ! -d "node_modules" ]]; then
    echo "  Installing dependencies for audit..."
    npm ci --silent 2>/dev/null || npm install --silent 2>/dev/null
  fi

  # Run npm audit — capture output
  AUDIT_OUTPUT=$(npm audit --json 2>/dev/null || true)
  CRITICAL=$(echo "$AUDIT_OUTPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d.get('metadata', {}).get('vulnerabilities', {})
    print(v.get('critical', 0))
except: print(0)
" 2>/dev/null || echo "0")
  HIGH=$(echo "$AUDIT_OUTPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d.get('metadata', {}).get('vulnerabilities', {})
    print(v.get('high', 0))
except: print(0)
" 2>/dev/null || echo "0")
  MODERATE=$(echo "$AUDIT_OUTPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = d.get('metadata', {}).get('vulnerabilities', {})
    print(v.get('moderate', 0))
except: print(0)
" 2>/dev/null || echo "0")

  echo "  Critical: $CRITICAL  High: $HIGH  Moderate: $MODERATE"

  if [[ "$CRITICAL" -gt 0 ]]; then
    echo -e "  ${RED}✗ CRITICAL vulnerabilities found — fix immediately${NC}"
    OVERALL_EXIT=1
  elif [[ "$HIGH" -gt 0 && "$FAIL_ON_HIGH" == "true" ]]; then
    echo -e "  ${RED}✗ HIGH vulnerabilities found${NC}"
    OVERALL_EXIT=1
  elif [[ "$HIGH" -gt 0 ]]; then
    echo -e "  ${YELLOW}⚠ HIGH vulnerabilities found (run npm audit fix)${NC}"
  else
    echo -e "  ${GREEN}✓ No critical/high vulnerabilities${NC}"
  fi
  echo ""
}

scan_dir "Backend"  "$PROJECT_ROOT/backend"
scan_dir "Frontend" "$PROJECT_ROOT/frontend"

echo -e "${BLUE}═══════════════════════════════════════${NC}"
if [[ $OVERALL_EXIT -eq 0 ]]; then
  echo -e "  ${GREEN}✓ Security scan passed${NC}"
else
  echo -e "  ${RED}✗ Security scan found issues${NC}"
fi
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

exit $OVERALL_EXIT
