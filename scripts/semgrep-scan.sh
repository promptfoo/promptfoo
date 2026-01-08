#!/usr/bin/env bash
# Comprehensive Semgrep security and quality scan
#
# Usage:
#   ./scripts/semgrep-scan.sh           # Full scan
#   ./scripts/semgrep-scan.sh --ci      # CI mode (exit 1 on errors)
#   ./scripts/semgrep-scan.sh --sarif   # Output SARIF for GitHub Security tab
#   ./scripts/semgrep-scan.sh --quick   # Security only (faster)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Parse arguments
CI_MODE=false
SARIF_OUTPUT=false
QUICK_MODE=false

for arg in "$@"; do
  case $arg in
  --ci)
    CI_MODE=true
    ;;
  --sarif)
    SARIF_OUTPUT=true
    ;;
  --quick)
    QUICK_MODE=true
    ;;
  --help | -h)
    echo "Usage: $0 [--ci] [--sarif] [--quick]"
    echo ""
    echo "Options:"
    echo "  --ci      Exit with code 1 if any ERROR findings"
    echo "  --sarif   Output SARIF format for GitHub Security tab"
    echo "  --quick   Security rules only (faster, skip best-practices)"
    exit 0
    ;;
  esac
done

echo "========================================"
echo "Semgrep Security & Quality Scan"
echo "========================================"
echo ""

# Check if semgrep is installed
if ! command -v semgrep &>/dev/null; then
  echo "Error: semgrep not found. Install with: brew install semgrep"
  exit 1
fi

# Build output args
OUTPUT_ARGS=""
if $SARIF_OUTPUT; then
  OUTPUT_ARGS="--sarif -o semgrep-results.sarif"
  echo "Output: semgrep-results.sarif (SARIF format)"
fi

# Build config args
if $QUICK_MODE; then
  echo "Mode: Quick (security only)"
  CONFIG_ARGS="--config auto"
else
  echo "Mode: Full (security + best-practices)"
  CONFIG_ARGS="--config auto"
fi

echo ""

# Run security scan
echo "=== Security Scan (auto config) ==="
if $CI_MODE; then
  semgrep scan $CONFIG_ARGS --error $OUTPUT_ARGS 2>&1 || {
    echo ""
    echo "ERROR: Security issues found. See above for details."
    echo "Fix issues or add nosemgrep comments for false positives."
    exit 1
  }
else
  semgrep scan $CONFIG_ARGS $OUTPUT_ARGS 2>&1
fi

# Run best-practices on src/ only (skip examples which have intentional issues)
if ! $QUICK_MODE; then
  echo ""
  echo "=== Best Practices Scan (src/ only) ==="
  semgrep scan --config p/r2c-best-practices src/ 2>&1 || true
fi

echo ""
echo "========================================"
echo "Scan complete!"
echo ""
echo "Next steps:"
echo "  - Review findings above"
echo "  - Fix true positives"
echo "  - Add '// nosemgrep: rule-id' for false positives"
echo "  - See docs/security/semgrep-triage.md for guidance"
echo "========================================"
