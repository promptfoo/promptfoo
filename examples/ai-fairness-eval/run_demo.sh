#!/bin/bash

echo "🚀 AI Fairness Multi-Judge Evaluation Demo"
echo "=========================================="
echo ""
echo "This demo shows the new evaluation system with:"
echo "✅ Multiple independent judges (Claude 3.5 Sonnet + o4-mini)"
echo "✅ Comparative scoring across demographics"
echo "✅ Clear failure conditions"
echo ""

# Check if required files exist
if [ ! -f "improved_fairness_dataset.csv" ]; then
    echo "❌ Error: improved_fairness_dataset.csv not found"
    echo "Please run the dataset generation first"
    exit 1
fi

if [ ! -f "scoring_rubrics.json" ]; then
    echo "❌ Error: scoring_rubrics.json not found"
    echo "Please run the dataset generation first"
    exit 1
fi

# Check for required API keys
echo "🔑 Checking API keys..."
MISSING_KEYS=""
[ -z "$ANTHROPIC_API_KEY" ] && MISSING_KEYS="$MISSING_KEYS ANTHROPIC_API_KEY"
[ -z "$OPENAI_API_KEY" ] && MISSING_KEYS="$MISSING_KEYS OPENAI_API_KEY"

if [ -n "$MISSING_KEYS" ]; then
    echo "❌ Missing required API keys:$MISSING_KEYS"
    echo "   Please set these environment variables before running."
    exit 1
fi

echo "✅ All required API keys found"
echo ""

echo "📋 Step 1: Running multi-judge evaluation..."
echo "This will test a sample of questions with multiple judges:"
echo "- Claude 3.5 Sonnet: Nuanced bias detection"
echo "- o4-mini: Fast reasoning and pattern detection"
echo ""

# Run the evaluation
npx promptfoo@latest eval -c multi_judge_config.yaml --no-cache

echo ""
echo "📊 Step 2: Analyzing comparative results..."
echo ""

# Check if results exist
if [ -f "results/multi_judge_results.json" ]; then
    python analyze_comparative_results.py
else
    echo "❌ No results found. The evaluation may have failed."
    exit 1
fi

echo ""
echo "✅ Demo complete!"
echo ""
echo "Key differences from the old system:"
echo "- No more 100% pass rates"
echo "- Multiple perspectives on each response"
echo "- Quantifiable bias metrics"
echo "- Specific failure examples"
echo ""
echo "💡 What makes these judges special:"
echo "- Claude 3.5 Sonnet: Catches subtle contextual biases"
echo "- o4-mini: Provides fast, consistent reasoning"
echo ""
echo "To run a full evaluation with more models:"
echo "1. Add more models to multi_judge_config.yaml"
echo "2. Increase sample size in generate_multi_judge_tests.js"
echo "3. Re-run this script" 