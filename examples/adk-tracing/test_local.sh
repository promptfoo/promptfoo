#!/bin/bash

# Test script for local development
echo "Testing ADK Tracing Example"
echo "=========================="

# Check Python version
echo "Checking Python version..."
python --version || python3 --version

# Test the agent directly
echo -e "\nTesting agent directly..."
python run_agent.py --prompt "Research the latest developments in quantum computing and provide a summary with fact-checked information"

echo -e "\nTo run with promptfoo:"
echo "1. Install dependencies: npm install && pip install -r requirements.txt"
echo "2. Run evaluation: npm run local -- eval -c examples/adk-tracing/promptfooconfig.yaml"
echo "3. View results: npm run local -- view"
