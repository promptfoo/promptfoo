#!/bin/bash

# Make the script exit on any error
set -e

# Check if TOGETHER_API_KEY is set
if [ -z "$TOGETHER_API_KEY" ]; then
    echo "Error: TOGETHER_API_KEY environment variable is not set."
    echo "Please set it with: export TOGETHER_API_KEY=your_api_key_here"
    exit 1
fi

echo "===================================================================="
echo "Running test with direct max_tokens setting (expected to fail)"
echo "===================================================================="
npx promptfoo eval -c togetherai-max-tokens-test.yaml

echo ""
echo "===================================================================="
echo "Running test with OPENAI_MAX_TOKENS workaround (expected to pass)"
echo "===================================================================="
npx promptfoo eval -c togetherai-max-tokens-workaround.yaml

echo ""
echo "===================================================================="
echo "Test complete!"
echo "If the first test failed and the second test passed, this confirms the issue."
echo "===================================================================="
