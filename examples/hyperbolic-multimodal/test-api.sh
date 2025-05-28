#!/bin/bash

# Test Hyperbolic API directly
echo "Testing Hyperbolic API..."
echo "Note: You need to set HYPERBOLIC_API_KEY environment variable"
echo ""

# Test with a simple chat completion
curl -X POST https://api.hyperbolic.xyz/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${HYPERBOLIC_API_KEY}" \
    -d '{
    "model": "meta-llama/Llama-3.1-70B",
    "messages": [
      {
        "role": "user",
        "content": "Say hello in one word"
      }
    ],
    "max_tokens": 10,
    "temperature": 0.1
  }' | jq .
