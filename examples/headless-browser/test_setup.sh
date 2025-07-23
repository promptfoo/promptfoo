#!/bin/bash

echo "Browser Automation Test Setup"
echo "============================"
echo

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3."
    exit 1
fi
echo "✅ Python 3 is installed"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js and npm."
    exit 1
fi
echo "✅ npm is installed"

# Check if required Python packages are installed
echo
echo "Checking Python dependencies..."
pip show gradio > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "📦 Installing Python dependencies..."
    pip install -r requirements.txt
else
    echo "✅ Python dependencies are installed"
fi

# Check if Playwright is installed
echo
echo "Checking Node.js dependencies..."
if [ ! -d "node_modules/playwright" ]; then
    echo "📦 Installing Playwright..."
    npm install playwright @playwright/browser-chromium playwright-extra puppeteer-extra-plugin-stealth
else
    echo "✅ Playwright is installed"
fi

echo
echo "Setup complete! To run the example:"
echo
echo "1. In one terminal, start the Gradio demo:"
echo "   python gradio_demo.py"
echo
echo "2. In another terminal, run the browser tests:"
echo "   npx promptfoo@latest eval -c promptfooconfig.yaml"
echo
echo "Remember: Always use browser automation ethically and responsibly!" 