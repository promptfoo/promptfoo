#!/bin/bash

# Script to start a LiteLLM server for testing the example

echo "Starting LiteLLM server for testing..."
echo ""
echo "This script will start a LiteLLM server with mock responses for testing."
echo "For production use, please configure with real API keys."
echo ""

# Check if litellm is installed
if ! command -v litellm &>/dev/null; then
    echo "Error: litellm is not installed."
    echo "Please install it with: pip install litellm"
    exit 1
fi

# Create a temporary config for testing
cat >/tmp/litellm_test_config.yaml <<EOF
model_list:
  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
      mock_response: "Bonjour! (This is a mock response from LiteLLM)"
      
  - model_name: claude-3-5-sonnet-20241022
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      mock_response: "¡Hola! (This is a mock response from LiteLLM)"
      
  - model_name: text-embedding-3-small
    litellm_params:
      model: openai/text-embedding-3-small
      mock_response: "[0.1, 0.2, 0.3, 0.4, 0.5]"  # Mock embedding vector

litellm_settings:
  drop_params: true
  set_verbose: false
  success_callback: ["langfuse"]
  failure_callback: ["langfuse"]
EOF

echo "Starting LiteLLM server on http://localhost:4000"
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
litellm --config /tmp/litellm_test_config.yaml --port 4000
