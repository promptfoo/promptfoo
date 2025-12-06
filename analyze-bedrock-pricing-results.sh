#!/bin/bash

RESULTS_DIR="/tmp/bedrock-pricing-test-results"

echo "=========================================="
echo "AWS Bedrock Pricing Analysis"
echo "=========================================="
echo ""

echo "Results analyzed from: $RESULTS_DIR"
echo ""

echo "=========================================="
echo "All Models Tested:"
echo "=========================================="
echo ""

# Extract all models and their costs
for result_file in "$RESULTS_DIR"/*.json; do
  config=$(basename "$result_file" -results.json | sed 's/promptfooconfig\.//')
  echo "[$config]"
  jq -r '.results.results[] | select(.success == true) | "  \(.provider.id // .provider): $\(.cost // 0) (\(.response.tokenUsage.total // 0) tokens)"' "$result_file" 2>/dev/null
  echo ""
done

echo "=========================================="
echo "✅ Models WITH Pricing (cost > 0):"
echo "=========================================="
echo ""

for result_file in "$RESULTS_DIR"/*.json; do
  jq -r '.results.results[] | select(.success == true and .cost > 0) | "✅ \(.provider.id // .provider): $\(.cost)"' "$result_file" 2>/dev/null
done | sort -u

echo ""
echo "=========================================="
echo "❌ Models WITHOUT Pricing (cost = 0):"
echo "=========================================="
echo ""

for result_file in "$RESULTS_DIR"/*.json; do
  jq -r '.results.results[] | select(.success == true and (.cost == 0 or .cost == null)) | "❌ \(.provider.id // .provider)"' "$result_file" 2>/dev/null
done | sort -u

echo ""
echo "=========================================="
echo "Summary Statistics:"
echo "=========================================="
echo ""

total_with_pricing=$(for result_file in "$RESULTS_DIR"/*.json; do
  jq -r '.results.results[] | select(.success == true and .cost > 0) | .provider.id // .provider' "$result_file" 2>/dev/null
done | sort -u | wc -l | tr -d ' ')

total_without_pricing=$(for result_file in "$RESULTS_DIR"/*.json; do
  jq -r '.results.results[] | select(.success == true and (.cost == 0 or .cost == null)) | .provider.id // .provider' "$result_file" 2>/dev/null
done | sort -u | wc -l | tr -d ' ')

total_models=$((total_with_pricing + total_without_pricing))

echo "Total Models Tested: $total_models"
echo "Models WITH Pricing: $total_with_pricing"
echo "Models WITHOUT Pricing: $total_without_pricing"
echo ""

if [ $total_models -gt 0 ]; then
  coverage_percent=$(( (total_with_pricing * 100) / total_models ))
  echo "Pricing Coverage: ${coverage_percent}%"
fi

echo ""
