#!/bin/bash

# Test script for Hyperbolic API functionality
# This script tests basic connectivity and API key validation

set -e

echo "🔧 Testing Hyperbolic API connectivity..."

# Check if API key is set
if [ -z "$HYPERBOLIC_API_KEY" ]; then
    echo "❌ Error: HYPERBOLIC_API_KEY environment variable is not set"
    echo "Please set your API key with: export HYPERBOLIC_API_KEY=your_api_key_here"
    exit 1
fi

echo "✅ API key is set"

# Test basic text generation
echo "🧠 Testing text generation..."
curl -s -X POST "https://api.hyperbolic.xyz/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $HYPERBOLIC_API_KEY" \
    -d '{
        "messages": [
            {
                "role": "user",
                "content": "Say hello"
            }
        ],
        "model": "meta-llama/Meta-Llama-3.1-8B-Instruct",
        "max_tokens": 50,
        "temperature": 0.1
    }' | jq '.' || {
    echo "❌ Text generation test failed"
    exit 1
}

echo "✅ Text generation test passed"

# Test image generation
echo "🎨 Testing image generation..."
curl -s -X POST "https://api.hyperbolic.xyz/v1/image/generation" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $HYPERBOLIC_API_KEY" \
    -d '{
        "model_name": "FLUX.1-dev",
        "prompt": "a simple red circle",
        "height": 512,
        "width": 512,
        "steps": 20
    }' | jq '.images[0].image' | head -c 100 || {
    echo "❌ Image generation test failed"
    exit 1
}

echo "✅ Image generation test passed"

# Test audio generation
echo "🔊 Testing audio generation..."
curl -s -X POST "https://api.hyperbolic.xyz/v1/audio/generation" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $HYPERBOLIC_API_KEY" \
    -d '{
        "text": "Hello world"
    }' | jq '.audio' | head -c 100 || {
    echo "❌ Audio generation test failed"
    exit 1
}

echo "✅ Audio generation test passed"

echo "🎉 All API tests passed! Your Hyperbolic setup is working correctly."
