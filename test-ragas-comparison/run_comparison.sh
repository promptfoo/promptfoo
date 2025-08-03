#!/bin/bash

echo "RAGAS vs Promptfoo Exact Comparison Test"
echo "========================================"
echo
echo "This test requires OPENAI_API_KEY to be set in your environment."
echo
echo "To run this test:"
echo "1. Set your OpenAI API key: export OPENAI_API_KEY='your-key-here'"
echo "2. Run this script: ./run_comparison.sh"
echo
echo "The test will:"
echo "- Use identical LLM settings (gpt-4o, temperature=0, seed=42)"
echo "- Run the same simple test case through both implementations"
echo "- Compare the scores to verify they match"
echo

if [ -z "$OPENAI_API_KEY" ]; then
    echo "ERROR: OPENAI_API_KEY not set"
    exit 1
fi

echo "Running RAGAS test..."
source venv/bin/activate
python test_controlled_comparison.py

echo
echo "Running promptfoo test..."
cd ..
npm run local -- eval -c test-ragas-comparison/test-controlled-promptfoo.yaml --no-cache

echo
echo "Comparing results..."
cd test-ragas-comparison
python compare_controlled_results.py