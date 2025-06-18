#!/bin/bash

# Langflow + Promptfoo Quick Start Script
# This script helps you set up and run the Langflow evaluation example

set -e

echo "🚀 Langflow + Promptfoo Quick Start"
echo "=================================="

# Check if Python is available
if ! command -v python3 &>/dev/null; then
    echo "❌ Python 3 is required but not installed. Please install Python 3 first."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔗 Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "⬇️  Installing Python dependencies..."
pip install -q -r requirements.txt

# Check if environment variables are set
echo "🔍 Checking environment configuration..."

if [ -z "$LANGFLOW_API_KEY" ]; then
    echo "⚠️  LANGFLOW_API_KEY not set. You'll need to set this before running."
fi

if [ -z "$LANGFLOW_FLOW_ID" ]; then
    echo "⚠️  LANGFLOW_FLOW_ID not set. You'll need to set this before running."
fi

if [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$GOOGLE_API_KEY" ]; then
    echo "⚠️  No LLM API keys detected. You'll need at least one."
fi

# Run setup test
echo ""
echo "🧪 Running setup verification..."
python test_setup.py

echo ""
echo "🎯 Next steps:"
echo "1. Make sure Langflow is running: langflow run"
echo "2. Import basic_chat_flow.json into Langflow"
echo "3. Set environment variables:"
echo "   export LANGFLOW_API_KEY=sk-your-key"
echo "   export LANGFLOW_FLOW_ID=your-flow-id"
echo "   export OPENAI_API_KEY=sk-your-key"
echo "4. Run the evaluation: npx promptfoo eval"

echo ""
echo "📚 See README.md for detailed instructions"
