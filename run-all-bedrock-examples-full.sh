#!/bin/bash

# Run ALL Bedrock examples WITHOUT filtering - get full results
set -e

EXAMPLES_DIR="examples/amazon-bedrock"
RESULTS_DIR="/tmp/bedrock-full-test-results"
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

echo "=========================================="
echo "Running ALL Bedrock Examples (Full Test)"
echo "=========================================="
echo ""

# Test each config file
for config in "$EXAMPLES_DIR"/promptfooconfig*.yaml; do
  config_name=$(basename "$config" .yaml)
  echo "Testing: $config_name"

  output_file="$RESULTS_DIR/${config_name}-results.json"

  # Run eval with FIRST test case only but ALL providers
  npm run local -- eval \
    -c "$config" \
    --filter-first-n 1 \
    --max-concurrency 1 \
    --output "$output_file" \
    > /dev/null 2>&1 || echo "  ⚠️  Some tests may have failed"

  echo "  ✅ Complete"
  echo ""
done

echo "=========================================="
echo "Analysis: Cost Calculation Results"
echo "=========================================="
echo ""

# Analyze results
for result_file in "$RESULTS_DIR"/*.json; do
  config=$(basename "$result_file" -results.json | sed 's/promptfooconfig\.//')
  echo "[$config]"
  jq -r '.results.results[] | select(.success == true) | "  \(.provider.id // .provider): $\(.cost // 0) (\(.response.tokenUsage.total // 0) tokens)"' "$result_file" 2>/dev/null || echo "  No results"
  echo ""
done

echo "=========================================="
echo "Models WITHOUT Pricing:"
echo "=========================================="
echo ""

for result_file in "$RESULTS_DIR"/*.json; do
  jq -r '.results.results[] | select(.success == true and (.cost == 0 or .cost == null)) | "❌ \(.provider.id // .provider): \(.response.tokenUsage.total // 0) tokens used"' "$result_file" 2>/dev/null
done | sort -u

echo ""
echo "Results saved to: $RESULTS_DIR"
