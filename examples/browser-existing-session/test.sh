#!/bin/bash

echo "Browser Session Connection Test"
echo "================================"
echo

# Check if Chrome is running with debugging
if ! curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "❌ Chrome is not running with debugging enabled!"
    echo
    echo "Please start Chrome with debugging in a separate terminal:"
    echo
    echo "macOS/Linux:"
    echo "  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-test"
    echo
    echo "Windows:"
    echo "  chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\\chrome-test"
    echo
    echo "Then run this script again."
    exit 1
fi

echo "✅ Chrome debugging port is accessible"
echo

# Check if test server is running
if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "Starting test server..."
    node server.js &
    SERVER_PID=$!
    sleep 2
    echo "✅ Test server started (PID: $SERVER_PID)"
else
    echo "✅ Test server is already running"
fi

echo
echo "Running Promptfoo test..."
echo "========================="
echo

# Run the test
cd ../..
npm run local -- eval -c examples/browser-existing-session/test-basic.yaml

# Clean up
if [ ! -z "$SERVER_PID" ]; then
    echo
    echo "Stopping test server..."
    kill $SERVER_PID 2>/dev/null
fi 