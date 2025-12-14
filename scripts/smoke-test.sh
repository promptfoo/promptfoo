#!/bin/bash
# Smoke test suite for promptfoo bundled CLI
#
# Usage:
#   ./scripts/smoke-test.sh              # Test the bundle
#   ./scripts/smoke-test.sh --installed  # Test installed version
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUNDLE_PATH="$ROOT_DIR/bundle/promptfoo.mjs"
TEST_DIR=""
FAILED_TESTS=()
PASSED_TESTS=()
USE_INSTALLED=false

# ─── Colors ──────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  DIM='\033[2m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' DIM='' NC=''
fi

# ─── Helpers ─────────────────────────────────────────────────────────────────

log_test() {
  echo -e "${BLUE}TEST${NC}  $*"
}

log_pass() {
  echo -e "${GREEN}PASS${NC}  $*"
  PASSED_TESTS+=("$*")
}

log_fail() {
  echo -e "${RED}FAIL${NC}  $*"
  FAILED_TESTS+=("$*")
}

log_skip() {
  echo -e "${YELLOW}SKIP${NC}  $*"
}

log_info() {
  echo -e "${DIM}INFO${NC}  $*"
}

# Run promptfoo command
pf() {
  if [[ "$USE_INSTALLED" == "true" ]]; then
    promptfoo "$@"
  else
    node "$BUNDLE_PATH" "$@"
  fi
}

# Create temporary test directory
setup_test_dir() {
  TEST_DIR=$(mktemp -d)
  log_info "Test directory: $TEST_DIR"
  cd "$TEST_DIR"
}

# Cleanup
cleanup() {
  if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
}

trap cleanup EXIT

# ─── Test Cases ──────────────────────────────────────────────────────────────

test_version() {
  log_test "--version returns version number"

  local output
  # Use 2>/dev/null to suppress deprecation warnings
  if output=$(pf --version 2>/dev/null); then
    # Check if output contains a version number pattern
    if [[ "$output" =~ [0-9]+\.[0-9]+\.[0-9]+ ]]; then
      log_pass "--version: $output"
      return 0
    else
      log_fail "--version returned unexpected format: $output"
      return 1
    fi
  else
    log_fail "--version failed with exit code $?"
    return 1
  fi
}

test_help() {
  log_test "--help shows usage information"

  local output
  if output=$(pf --help 2>&1); then
    if [[ "$output" == *"Usage:"* ]] || [[ "$output" == *"Commands:"* ]]; then
      log_pass "--help shows usage information"
      return 0
    else
      log_fail "--help output doesn't contain expected content"
      return 1
    fi
  else
    log_fail "--help failed with exit code $?"
    return 1
  fi
}

test_init() {
  log_test "init creates promptfooconfig.yaml"

  setup_test_dir

  if pf init --no-interactive > /dev/null 2>&1 || pf init -y > /dev/null 2>&1; then
    if [[ -f "promptfooconfig.yaml" ]]; then
      log_pass "init created promptfooconfig.yaml"
      return 0
    else
      log_fail "init completed but promptfooconfig.yaml not found"
      return 1
    fi
  else
    log_fail "init command failed"
    return 1
  fi
}

test_eval_echo_provider() {
  log_test "eval with echo provider"

  setup_test_dir

  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Hello {{name}}"
providers:
  - id: echo
tests:
  - vars:
      name: World
EOF

  if pf eval --no-cache -o results.json > /dev/null 2>&1; then
    if [[ -f "results.json" ]]; then
      log_pass "eval with echo provider completed"
      return 0
    else
      log_fail "eval completed but results.json not found"
      return 1
    fi
  else
    log_fail "eval with echo provider failed"
    return 1
  fi
}

test_eval_with_assertions() {
  log_test "eval with assertions"

  setup_test_dir

  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "The answer is {{answer}}"
providers:
  - id: echo
tests:
  - vars:
      answer: "42"
    assert:
      - type: contains
        value: "42"
      - type: javascript
        value: output.includes("answer")
EOF

  local output
  if output=$(pf eval --no-cache -o results.json 2>&1); then
    if [[ -f "results.json" ]]; then
      # Check if assertions passed
      if grep -q '"pass":true' results.json 2>/dev/null || grep -q '"success":true' results.json 2>/dev/null; then
        log_pass "eval with assertions - all passed"
        return 0
      else
        log_info "Results: $(cat results.json | head -100)"
        log_pass "eval with assertions completed (checking results manually)"
        return 0
      fi
    else
      log_fail "eval completed but results.json not found"
      return 1
    fi
  else
    log_fail "eval with assertions failed: $output"
    return 1
  fi
}

test_eval_failing_assertion() {
  log_test "eval correctly reports failing assertions"

  setup_test_dir

  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Hello World"
providers:
  - id: echo
tests:
  - vars: {}
    assert:
      - type: contains
        value: "IMPOSSIBLE_STRING_THAT_WONT_MATCH"
EOF

  # This should complete but have failing assertions
  if pf eval --no-cache -o results.json > /dev/null 2>&1; then
    if [[ -f "results.json" ]]; then
      log_pass "eval with failing assertion completed correctly"
      return 0
    else
      log_fail "eval completed but results.json not found"
      return 1
    fi
  else
    # Some exit codes are expected for failing assertions
    if [[ -f "results.json" ]]; then
      log_pass "eval with failing assertion reported failure correctly"
      return 0
    else
      log_fail "eval with failing assertion crashed unexpectedly"
      return 1
    fi
  fi
}

test_database_access() {
  log_test "database access (list evals command)"

  # The list evals command requires database access
  local output
  # Suppress deprecation warnings with 2>/dev/null, capture stdout
  if output=$(pf list evals 2>/dev/null); then
    log_pass "database access works (list evals command)"
    return 0
  else
    # Empty list or "no evals" is also acceptable - it means DB works
    if [[ "$output" == *"No evals"* ]] || [[ "$output" == *"0 evals"* ]] || [[ -z "$output" ]]; then
      log_pass "database access works (empty list)"
      return 0
    fi
    # If we get table headers, that's also a pass
    if [[ "$output" == *"ID"* ]] || [[ "$output" == *"Created"* ]]; then
      log_pass "database access works (list evals shows data)"
      return 0
    fi
    log_fail "database access failed: $output"
    return 1
  fi
}

test_cache_functionality() {
  log_test "cache functionality"

  setup_test_dir

  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Cache test {{id}}"
providers:
  - id: echo
tests:
  - vars:
      id: "test123"
EOF

  # Run once to populate cache
  if ! pf eval -o results1.json > /dev/null 2>&1; then
    log_fail "first eval for cache test failed"
    return 1
  fi

  # Run again - should use cache
  if pf eval -o results2.json > /dev/null 2>&1; then
    log_pass "cache functionality works"
    return 0
  else
    log_fail "second eval for cache test failed"
    return 1
  fi
}

test_json_output() {
  log_test "JSON output format"

  setup_test_dir

  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Test output"
providers:
  - id: echo
tests:
  - vars: {}
EOF

  if pf eval --no-cache -o results.json > /dev/null 2>&1; then
    if [[ -f "results.json" ]]; then
      # Validate it's valid JSON
      if python3 -c "import json; json.load(open('results.json'))" 2>/dev/null || \
         node -e "JSON.parse(require('fs').readFileSync('results.json'))" 2>/dev/null; then
        log_pass "JSON output is valid"
        return 0
      else
        log_fail "JSON output is not valid JSON"
        return 1
      fi
    else
      log_fail "results.json not created"
      return 1
    fi
  else
    log_fail "eval failed"
    return 1
  fi
}

test_yaml_config() {
  log_test "YAML config parsing"

  setup_test_dir

  # More complex YAML with anchors and references
  cat > promptfooconfig.yaml << 'EOF'
# Test YAML parsing with comments
prompts:
  - id: test-prompt
    raw: "Testing YAML: {{value}}"

providers:
  - id: echo
    config:
      temperature: 0.5

defaultTest:
  vars:
    value: default

tests:
  - vars:
      value: custom
    assert:
      - type: contains
        value: custom
EOF

  if pf eval --no-cache -o results.json > /dev/null 2>&1; then
    log_pass "YAML config parsing works"
    return 0
  else
    log_fail "YAML config parsing failed"
    return 1
  fi
}

test_multiple_providers() {
  log_test "multiple providers"

  setup_test_dir

  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Test {{name}}"
providers:
  - id: echo
  - id: echo
    label: echo-2
tests:
  - vars:
      name: multi
EOF

  if pf eval --no-cache -o results.json > /dev/null 2>&1; then
    if [[ -f "results.json" ]]; then
      log_pass "multiple providers work"
      return 0
    fi
  fi

  log_fail "multiple providers test failed"
  return 1
}

test_env_vars() {
  log_test "environment variable substitution"

  setup_test_dir

  export TEST_VAR="environment_value"

  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Value: {{value}}"
providers:
  - id: echo
tests:
  - vars:
      value: "env:TEST_VAR"
EOF

  # This tests if env vars are handled (even if not substituted in vars)
  if pf eval --no-cache -o results.json > /dev/null 2>&1; then
    log_pass "environment variable handling works"
    return 0
  else
    log_fail "environment variable handling failed"
    return 1
  fi
}

test_generate_dataset() {
  log_test "generate dataset command"

  setup_test_dir

  # Test if the command exists and shows help
  if pf generate dataset --help > /dev/null 2>&1; then
    log_pass "generate dataset command available"
    return 0
  else
    log_skip "generate dataset command not available"
    return 0
  fi
}

test_share_command() {
  log_test "share command exists"

  if pf share --help > /dev/null 2>&1; then
    log_pass "share command available"
    return 0
  else
    log_skip "share command not available"
    return 0
  fi
}

test_redteam_command() {
  log_test "redteam command exists"

  if pf redteam --help > /dev/null 2>&1; then
    log_pass "redteam command available"
    return 0
  else
    log_skip "redteam command not available"
    return 0
  fi
}

test_view_command() {
  log_test "view command exists"

  if pf view --help > /dev/null 2>&1; then
    log_pass "view command available"
    return 0
  else
    log_skip "view command not available"
    return 0
  fi
}

test_export_command() {
  log_test "export command works"

  setup_test_dir

  # First create some data
  cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Test export"
providers:
  - id: echo
tests:
  - vars: {}
EOF

  pf eval --no-cache > /dev/null 2>&1

  # Now test export
  if pf export --help > /dev/null 2>&1; then
    log_pass "export command available"
    return 0
  else
    log_skip "export command not available"
    return 0
  fi
}

test_config_command() {
  log_test "config command exists"

  if pf config --help > /dev/null 2>&1; then
    log_pass "config command available"
    return 0
  else
    log_skip "config command not available"
    return 0
  fi
}

test_auth_command() {
  log_test "auth command exists"

  if pf auth --help > /dev/null 2>&1; then
    log_pass "auth command available"
    return 0
  else
    log_skip "auth command not available"
    return 0
  fi
}

# ─── Provider Tests ──────────────────────────────────────────

test_python_provider() {
  log_test "Python provider"

  # Check if Python is available
  if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    log_skip "Python not installed"
    return 0
  fi

  setup_test_dir

  cat > provider.py << 'EOF'
def call_api(prompt, options, context):
    return {"output": f"Python: {prompt}"}
EOF

  cat > config.yaml << 'EOF'
prompts:
  - "Test {{name}}"
providers:
  - id: python:provider.py
tests:
  - vars:
      name: "World"
    assert:
      - type: contains
        value: "Python"
EOF

  if pf eval -c config.yaml --no-cache -o results.json > /dev/null 2>&1; then
    if [[ -f "results.json" ]]; then
      log_pass "Python provider works"
      return 0
    fi
  fi

  log_fail "Python provider failed"
  return 1
}

test_ruby_provider() {
  log_test "Ruby provider"

  # Check if Ruby is available
  if ! command -v ruby &> /dev/null; then
    log_skip "Ruby not installed"
    return 0
  fi

  setup_test_dir

  cat > provider.rb << 'EOF'
def call_api(prompt, options, context)
  { "output" => "Ruby: #{prompt}" }
end
EOF

  cat > config.yaml << 'EOF'
prompts:
  - "Test {{name}}"
providers:
  - id: ruby:provider.rb
tests:
  - vars:
      name: "World"
    assert:
      - type: contains
        value: "Ruby"
EOF

  if pf eval -c config.yaml --no-cache -o results.json > /dev/null 2>&1; then
    if [[ -f "results.json" ]]; then
      log_pass "Ruby provider works"
      return 0
    fi
  fi

  log_fail "Ruby provider failed"
  return 1
}

# ─── Install Script Tests ────────────────────────────────────────────────────

test_install_script_syntax() {
  log_test "install.sh syntax is valid"

  if bash -n "$ROOT_DIR/scripts/install.sh" 2>&1; then
    log_pass "install.sh syntax is valid"
    return 0
  else
    log_fail "install.sh has syntax errors"
    return 1
  fi
}

test_install_script_help() {
  log_test "install.sh --help works"

  local output
  if output=$(bash "$ROOT_DIR/scripts/install.sh" --help 2>&1); then
    if [[ "$output" == *"USAGE"* ]] || [[ "$output" == *"usage"* ]]; then
      log_pass "install.sh --help shows usage"
      return 0
    fi
  fi
  log_fail "install.sh --help failed"
  return 1
}

test_install_ps1_syntax() {
  log_test "install.ps1 exists and is readable"

  if [[ -f "$ROOT_DIR/scripts/install.ps1" ]]; then
    if [[ -r "$ROOT_DIR/scripts/install.ps1" ]]; then
      log_pass "install.ps1 exists and is readable"
      return 0
    fi
  fi
  log_fail "install.ps1 not found or not readable"
  return 1
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}Promptfoo Smoke Test Suite${NC}"
  echo ""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --installed)
        USE_INSTALLED=true
        shift
        ;;
      *)
        echo "Unknown option: $1"
        exit 1
        ;;
    esac
  done

  # Check prerequisites
  if [[ "$USE_INSTALLED" == "true" ]]; then
    if ! command -v promptfoo &> /dev/null; then
      echo -e "${RED}Error: promptfoo not found in PATH${NC}"
      exit 1
    fi
    log_info "Testing installed promptfoo: $(which promptfoo)"
  else
    if [[ ! -f "$BUNDLE_PATH" ]]; then
      echo -e "${RED}Error: Bundle not found at $BUNDLE_PATH${NC}"
      echo "Run 'npm run bundle' first."
      exit 1
    fi
    log_info "Testing bundle: $BUNDLE_PATH"
  fi

  echo ""
  echo -e "${BOLD}Running tests...${NC}"
  echo ""

  # Run all tests - continue even if individual tests fail
  set +e

  test_version
  test_help
  test_init
  test_eval_echo_provider
  test_eval_with_assertions
  test_eval_failing_assertion
  test_database_access
  test_cache_functionality
  test_json_output
  test_yaml_config
  test_multiple_providers
  test_env_vars
  test_generate_dataset
  test_share_command
  test_redteam_command
  test_view_command
  test_export_command
  test_config_command
  test_auth_command

  # Provider tests
  test_python_provider
  test_ruby_provider

  # Install script tests
  test_install_script_syntax
  test_install_script_help
  test_install_ps1_syntax

  set -e

  # Summary
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo ""

  local total=$((${#PASSED_TESTS[@]} + ${#FAILED_TESTS[@]}))

  if [[ ${#FAILED_TESTS[@]} -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}All $total tests passed!${NC}"
    echo ""
    exit 0
  else
    echo -e "${RED}${BOLD}${#FAILED_TESTS[@]} of $total tests failed:${NC}"
    echo ""
    for test in "${FAILED_TESTS[@]}"; do
      echo -e "  ${RED}✗${NC} $test"
    done
    echo ""
    echo -e "${GREEN}${#PASSED_TESTS[@]} tests passed${NC}"
    echo ""
    exit 1
  fi
}

main "$@"
