#!/bin/bash
# Quick test of the mock traced server

echo "Testing mock traced server..."
echo ""

PORT="${PORT:-3110}"

# Check if server is running
if ! curl -s http://localhost:${PORT}/health >/dev/null; then
  echo "❌ Server is not running. Start it with: PORT=${PORT} node server.js"
  exit 1
fi

echo "✓ Server is healthy"
echo ""

# Test basic request
echo "Testing chat endpoint..."
response=$(curl -s -X POST http://localhost:${PORT}/chat \
  -H "Content-Type: application/json" \
  -H "traceparent: 00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01" \
  -d '{"prompt": "Hello, how are you?"}')

echo "Response:"
echo "$response" | jq .

# Check if response has the expected fields
if echo "$response" | jq -e '.response' >/dev/null; then
  echo ""
  echo "✓ Chat endpoint working correctly"
else
  echo ""
  echo "❌ Chat endpoint returned unexpected response"
  exit 1
fi

echo ""
echo "✓ All tests passed!"
echo ""
echo "Now you can run: npm run local -- eval -c promptfooconfig.yaml"
