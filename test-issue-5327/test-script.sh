#!/bin/bash

# Test script to reproduce issue #5327
# This will run promptfoo redteam and capture the requests to ollama

echo "=== Testing Crescendo Strategy with Chat Template ==="
echo "Looking for the JSON blob injection issue on turn 3+"
echo ""

cd /Users/mdangelo/projects/pf3/test-issue-5327

# Run promptfoo redteam with verbose logging
echo "Running promptfoo redteam with debug logging..."
PROMPTFOO_LOG_LEVEL=debug npx ../dist/src/main.js redteam run --config promptfooconfig.yaml --verbose 2>&1 | tee output.log

echo ""
echo "=== Analysis ==="
echo "Looking for evidence of JSON blob injection in the logs..."
echo ""

# Look for the specific patterns that indicate the bug
echo "1. Checking for 'Using rendered chat template' messages (should appear with fix):"
grep "Using rendered chat template" output.log || echo "   - Not found (indicates potential issue)"

echo ""
echo "2. Checking for 'Using conversation history' messages:"
grep "Using conversation history" output.log || echo "   - Not found"

echo ""
echo "3. Looking for JSON blobs in content (the bug symptom):"
grep -A 5 -B 5 '"content":"\\[{' output.log || echo "   - No JSON blobs found in content (good!)"

echo ""
echo "=== Raw Debug Output ==="
echo "Full log saved to output.log"
echo "You can examine it for detailed message flow"