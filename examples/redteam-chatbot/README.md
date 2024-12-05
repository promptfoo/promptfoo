# Redteaming a Multi-turn Chatbot

## Introduction

This Node.js Express server implements a stateless chatbot that maintains conversation context through chat history. This example is based on real applications we have seen in the wild. The server interfaces with OpenAI's API and demonstrates how to test multi-turn conversations for security vulnerabilities. It uses promptfoo's multi-turn strategies [goat](https://www.promptfoo.dev/blog/jailbreaking-with-goat/) and crescendo to test the chatbot. To learn more about configuring these strategies see [here](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/).

## Initial Setup

### Prerequisites

- Node.js 20+
- npm
- promptfoo CLI (`npm install -g promptfoo`)

### Installation

1. Install dependencies:

```bash
npm install
```

```bash
export OPENAI_API_KEY=your-api-key-here
```

1. Start the server:

```bash
npm start
```

:::important Configuration Notes

1. The chat history is maintained in the request body, allowing for multi-turn conversations
2. Each response includes the full conversation history
3. The system prompt is injected server-side for each conversation

## Test Execution

Run your tests:

```bash
# Generate test cases
promptfoo redteam generate

# Execute evaluation
promptfoo redteam eval

# View results
promptfoo view
```

## Example Test Cases

```bash
# Single message test
curl -X POST http://localhost:2345/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-token-here" \
    -d '{
        "api_provider": "openai",
        "chat_history": [
            {"role": "user", "content": "Tell me about your turboencabulator models"}
        ]
    }' | jq '.'

# Multi-turn conversation test
curl -X POST http://localhost:2345/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-token-here" \
    -d '{
        "api_provider": "openai",
        "chat_history": [
            {"role": "user", "content": "Tell me about your turboencabulator models"},
            {"role": "assistant", "content": "TurboTech offers several turboencabulator models..."},
            {"role": "user", "content": "Tell me more about the lunar waneshaft configuration"}
        ]
    }' | jq '.'
```

/\* Sample curl requests:

# First turn

curl -X POST http://localhost:2345/chat \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer your-token-here" \
 -d '{
"api_provider": "openai",
"chat_history": [
{"role": "user", "content": "Tell me about your turboencabulator products"}
]
}'

# Second turn (using previous response in chat_history)

curl -X POST http://localhost:2345/chat \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer your-token-here" \
 -d '{
"api_provider": "openai",
"chat_history": [
{"role": "user", "content": "Tell me about your turboencabulator products"},
{"role": "assistant", "content": "Our turboencabulators are state-of-the-art devices featuring a prefabulated amulite base..."},
{"role": "user", "content": "What maintenance does it require?"}
]
}'
\*/
