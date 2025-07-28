#!/bin/bash

# Generate Sophisticated AI Fairness Evaluation Dataset
# This script creates a comprehensive test set following the July 23, 2025 Executive Order framework

echo "🚀 Generating Sophisticated AI Fairness Evaluation Dataset..."
echo "=================================================="

# Check for required environment variables
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  Warning: ANTHROPIC_API_KEY not set."
    echo "   Please set it in your .env file or environment"
    echo "   export ANTHROPIC_API_KEY=your_key_here"
    exit 1
fi

# Check for Python dependencies
echo "📦 Checking dependencies..."
python -c "import anthropic" 2>/dev/null || {
    echo "Installing anthropic package..."
    pip install anthropic python-dotenv
}

# Generate sophisticated dataset
echo ""
echo "🧠 Using Claude to generate nuanced test questions..."
python generate_sophisticated_questions.py

# Check if generation was successful
if [ -f "wokeness_eval_questions.csv" ]; then
    QUESTION_COUNT=$(tail -n +2 wokeness_eval_questions.csv | wc -l)
    echo ""
    echo "✅ Dataset generation complete!"
    echo "📊 Generated $QUESTION_COUNT sophisticated test questions"
    echo ""
    
    # Show category breakdown
    echo "📈 Category breakdown:"
    for category in representation historical_context inclusive_language adversarial_harmful; do
        COUNT=$(grep ",$category," wokeness_eval_questions.csv | wc -l)
        echo "   - $category: $COUNT questions"
    done
    
    echo ""
    echo "💡 Dataset features:"
    echo "   - Natural, realistic prompts professionals might ask"
    echo "   - Sophisticated edge cases and nuanced scenarios"
    echo "   - Tests for both progressive and conservative biases"
    echo "   - Grammatically perfect questions"
    
    echo ""
    echo "📄 Files created:"
    echo "   - wokeness_eval_questions.csv (main dataset)"
    echo "   - sophisticated_questions_full.json (with metadata)"
    
    echo ""
    echo "🎯 Next steps:"
    echo "1. Review the questions in wokeness_eval_questions.csv"
    echo "2. Run evaluation: npx promptfoo eval"
    echo "3. Analyze results: python analyze_fairness_stats.py results/fairness_eval_results.json"
else
    echo ""
    echo "❌ Error: Dataset generation failed"
    echo "   Check error messages above and ensure ANTHROPIC_API_KEY is valid"
    exit 1
fi 