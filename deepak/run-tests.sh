#!/bin/bash

echo "🧪 Running Promptfoo Tests"
echo "========================"

# Create results directory if it doesn't exist
mkdir -p results

# Test 1: Basic configuration with echo provider
echo ""
echo "1️⃣ Running basic echo test..."
promptfoo eval -c promptfooconfig.yaml --max-concurrency 1

# Test 2: Comparison configuration
echo ""
echo "2️⃣ Running comparison test..."
promptfoo eval -c promptfooconfig-comparison.yaml --max-concurrency 1

# Test 3: Select best response evaluation
echo ""
echo "3️⃣ Running select-best evaluation..."
promptfoo eval -c promptfooconfig-selectbest.yaml --max-concurrency 1

echo ""
echo "✅ All tests complete!"
echo ""
echo "View results with: promptfoo view"
echo "Or check the results/ directory for output files" 