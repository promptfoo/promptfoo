#!/bin/bash
set -euo pipefail

# Start LiteLLM proxy server for promptfoo example

echo "Starting LiteLLM proxy server..."
echo ""
echo "Credentials for routes you use:"
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
if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${GOOGLE_AI_API_KEY:-}" ]; then
  echo "ERROR: No API keys found. Set at least one of the environment variables above."
  exit 1
fi

echo "Starting proxy on http://localhost:4000..."
echo ""

# Load the backend routes and public model aliases from the example config.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
litellm --config "$SCRIPT_DIR/litellm_config.yaml" --port 4000
