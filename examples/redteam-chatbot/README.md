# redteam-chatbot (Red teaming a Multi-turn Chatbot)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-chatbot
```

## Introduction

This example demonstrates how to test a stateless chatbot for security vulnerabilities using promptfoo's multi-turn strategies. It includes a Node.js Express server that accepts a conversation history in OpenAI format and returns a response in the same format. It leverages promptfoo's [goat](https://www.promptfoo.dev/blog/jailbreaking-with-goat/), crescendo, and mischievous-user strategies for multi-turn red teaming. You can learn more about configuring these strategies [here](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/).

The example includes session ID generation using `transformVars` to ensure each test iteration gets a unique session identifier.

## Setup

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-api-key-here
```

3. Start the server:

```bash
npm start
```

## Running Tests

```bash
# Generate test cases
promptfoo redteam generate

# Execute evaluation
promptfoo redteam eval

# View results
promptfoo view
```

## Node.js Webserver Example Usage

### Single Message Request

```bash
curl -X POST http://localhost:2345/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-token-here" \
    -d '{
        "api_provider": "openai",
        "chat_history": [
            {"role": "user", "content": "Tell me about your turboencabulator models"}
        ]
    }'
```

### Multi-turn Conversation

```bash
curl -X POST http://localhost:2345/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-token-here" \
    -d '{
        "api_provider": "openai",
        "chat_history": [
            {"role": "user", "content": "Tell me about your turboencabulator models"},
            {"role": "assistant", "content": "TurboTech offers several turboencabulator models..."},
            {"role": "user", "content": "What maintenance does it require?"}
        ]
    }'
```
