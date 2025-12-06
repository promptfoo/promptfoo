#!/bin/bash

# Test all Bedrock examples and check cost calculation
set -e

EXAMPLES_DIR="examples/amazon-bedrock"
RESULTS_DIR="/tmp/bedrock-pricing-test-results"
mkdir -p "$RESULTS_DIR"

echo "=========================================="
echo "Testing AWS Bedrock Pricing Across All Examples"
echo "=========================================="
echo ""

# Array to store results
declare -a all_results

# Test each config file
for config in "$EXAMPLES_DIR"/promptfooconfig*.yaml; do
  config_name=$(basename "$config" .yaml)
  echo "Testing: $config_name"
  echo "----------------------------------------"

  output_file="$RESULTS_DIR/${config_name}-results.json"

  # Run eval with just first test case to save time
  npm run local -- eval \
    -c "$config" \
    --filter-first-n 1 \
    --max-concurrency 1 \
    --output "$output_file" \
    > /dev/null 2>&1 || echo "  ⚠️  Some tests failed"

  # Check if output file exists
  if [ ! -f "$output_file" ]; then
    echo "  ❌ No results file generated"
    continue
  fi

  # Extract cost data using jq
  echo "  Checking costs..."
  jq -r '.results.results[] | select(.success == true) | "    \(.provider.id // .provider): cost=\(.cost // "N/A")"' "$output_file" 2>/dev/null || echo "  ⚠️  Could not parse results"

  echo ""
done

echo "=========================================="
echo "Summary: All Results"
echo "=========================================="
echo ""
echo "Analyzing all successful tests..."

# Create comprehensive summary
for result_file in "$RESULTS_DIR"/*.json; do
  config=$(basename "$result_file" -results.json)
  echo ""
  echo "=== $config ==="
  jq -r '.results.results[] | select(.success == true) | "\(.provider.id // .provider): \(.cost // 0) (\(.response.tokenUsage.total // 0) tokens)"' "$result_file" 2>/dev/null || echo "No successful results"
done

echo ""
echo "=========================================="
echo "Models with ZERO or NO cost:"
echo "=========================================="

for result_file in "$RESULTS_DIR"/*.json; do
  jq -r '.results.results[] | select(.success == true and (.cost == 0 or .cost == null)) | .provider.id // .provider' "$result_file" 2>/dev/null
done | sort -u

echo ""
echo "Results saved to: $RESULTS_DIR"
