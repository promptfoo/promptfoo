#!/bin/bash

# Comprehensive Bedrock Pricing QA Test Script
# Tests all auth methods, concurrency, caching, and cost calculation

set -e  # Exit on error

echo "========================================="
echo "Bedrock Pricing QA Test Suite"
echo "========================================="
echo ""

# Check for AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] && [ -z "$AWS_PROFILE" ]; then
  echo "⚠️  WARNING: No AWS credentials found in environment"
  echo "   Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or AWS_PROFILE"
  echo "   Pricing fetch will fail and tests will show no cost data"
  echo ""
fi

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
TEST_NUM=0
PASS_COUNT=0
FAIL_COUNT=0

run_test() {
  TEST_NUM=$((TEST_NUM + 1))
  local test_name="$1"
  local command="$2"
  local validation="$3"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Test $TEST_NUM: $test_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Command: $command"
  echo ""

  # Run command and capture output
  if eval "$command" > /tmp/bedrock-test-$TEST_NUM.log 2>&1; then
    echo -e "${GREEN}✓ Command succeeded${NC}"

    # Run validation if provided
    if [ -n "$validation" ]; then
      if eval "$validation" >> /tmp/bedrock-test-$TEST_NUM.log 2>&1; then
        echo -e "${GREEN}✓ Validation passed${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
      else
        echo -e "${RED}✗ Validation failed${NC}"
        echo "See /tmp/bedrock-test-$TEST_NUM.log for details"
        FAIL_COUNT=$((FAIL_COUNT + 1))
      fi
    else
      PASS_COUNT=$((PASS_COUNT + 1))
    fi
  else
    echo -e "${RED}✗ Command failed${NC}"
    echo "See /tmp/bedrock-test-$TEST_NUM.log for details"
    tail -20 /tmp/bedrock-test-$TEST_NUM.log
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Clean slate - remove cache
echo "Preparing test environment..."
rm -rf .promptfoo-local/cache/diskstore-*/bedrock-pricing* 2>/dev/null || true
echo "✓ Cache cleared"
echo ""

# Test 1: Basic IAM auth with pricing fetch (cold start)
run_test \
  "Cold start - IAM auth with pricing fetch" \
  "PROMPTFOO_LOG_LEVEL=debug npm run local -- eval -c test-bedrock-pricing.yaml --no-cache --filter-first-n 1 2>&1 | tee /tmp/test-1-output.log" \
  "grep -q 'Bedrock Pricing.*Starting new pricing fetch' /tmp/test-1-output.log && grep -q 'Bedrock Pricing.*Successfully fetched pricing' /tmp/test-1-output.log"

# Test 2: Warm cache (should use cached pricing)
run_test \
  "Warm cache - should reuse cached pricing" \
  "PROMPTFOO_LOG_LEVEL=debug npm run local -- eval -c test-bedrock-pricing.yaml --filter-first-n 1 2>&1 | tee /tmp/test-2-output.log" \
  "grep -q 'Bedrock Pricing.*Using cached pricing data' /tmp/test-2-output.log"

# Test 3: Cache disabled (should fetch pricing again)
echo "Clearing cache for cache-disabled test..."
rm -rf .promptfoo-local/cache/diskstore-*/bedrock-pricing* 2>/dev/null || true

run_test \
  "Cache disabled - should fetch pricing again" \
  "PROMPTFOO_LOG_LEVEL=debug npm run local -- eval -c test-bedrock-pricing.yaml --no-cache --filter-first-n 1 2>&1 | tee /tmp/test-3-output.log" \
  "grep -q 'Bedrock Pricing.*Starting new pricing fetch' /tmp/test-3-output.log"

# Test 4: Concurrent requests (test promise coordination)
echo ""
echo "Clearing cache for concurrency test..."
rm -rf .promptfoo-local/cache/diskstore-*/bedrock-pricing* 2>/dev/null || true

run_test \
  "Concurrent requests - should coordinate fetches" \
  "PROMPTFOO_LOG_LEVEL=debug npm run local -- eval -c test-bedrock-pricing.yaml --no-cache --max-concurrency 10 2>&1 | tee /tmp/test-4-output.log" \
  "grep -c 'Bedrock Pricing.*Starting new pricing fetch' /tmp/test-4-output.log | grep -q '^1$'"

# Test 5: Verify cost calculations in output
run_test \
  "Cost calculations - verify costs in output JSON" \
  "npm run local -- eval -c test-bedrock-pricing.yaml --filter-first-n 1 --output bedrock-pricing-test-results.json" \
  "cat bedrock-pricing-test-results.json | jq '.results[].response.cost' | grep -v null | grep -q '[0-9]'"

# Test 6: config.cost override (should use custom cost)
run_test \
  "config.cost override - should use custom pricing" \
  "npm run local -- eval -c test-bedrock-pricing.yaml --filter-provider 'Test 5' --filter-first-n 1 --output bedrock-cost-override-test.json" \
  "cat bedrock-cost-override-test.json | jq '.results[].response.cost' | grep -q '[0-9]'"

# Summary
echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "Total tests: $TEST_NUM"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}Failed: $FAIL_COUNT${NC}"
else
  echo -e "Failed: $FAIL_COUNT"
fi
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}Some tests failed. Check logs in /tmp/bedrock-test-*.log${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
