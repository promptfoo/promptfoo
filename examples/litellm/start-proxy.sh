#!/bin/bash
set -euo pipefail

# Start LiteLLM proxy server for promptfoo example

echo "Starting LiteLLM proxy server..."
echo ""
echo "Required environment variables:"
echo "  - OPENAI_API_KEY (for GPT models and embeddings)"
echo "  - ANTHROPIC_API_KEY (for Claude models)"
echo "  - GOOGLE_AI_API_KEY (for Gemini models)"
echo ""

# Check if litellm is installed
if ! command -v litellm &>/dev/null; then
  echo "ERROR: LiteLLM is not installed."
  echo "Install it with: pip install 'litellm[proxy]'"
  exit 1
fi

# Check for at least one API key
if [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$GOOGLE_AI_API_KEY" ]; then
  echo "ERROR: No API keys found. Set at least one of the environment variables above."
  exit 1
fi

echo "Starting proxy on http://localhost:4000..."
echo ""

# Start the proxy with models used in the example
litellm \
  --model gpt-4.1 \
  --model claude-sonnet-4-20250514 \
  --model gemini-2.5-pro \
  --model text-embedding-3-large \
  --port 4000
