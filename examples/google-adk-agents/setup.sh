#!/bin/bash

# Google ADK Multi-Agent System Setup Script

echo "Setting up Google ADK Multi-Agent System..."

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Copy environment example if .env doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from example..."
    cp env.example .env
    echo "Please edit .env and add your Google API key"
fi

echo "Setup complete! To run the example:"
echo "1. Edit .env and add your GOOGLE_API_KEY"
echo "2. Run: python multi_agent_example.py"
echo "3. Test with promptfoo: npx promptfoo@latest eval" 