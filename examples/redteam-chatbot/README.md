# Redteaming a Multi-turn Flask Chatbot

## Introduction

This Flask server implements a stateless chatbot that maintains conversation context through chat history. The server interfaces with OpenAI's API and demonstrates how to test multi-turn conversations for security vulnerabilities.

## Multi-turn vs Single-turn Testing

### Single-turn Systems

Traditional chatbots process each query independently, treating every interaction as a new conversation. This makes them more secure but less natural to interact with.

### Multi-turn Systems (Like This One)

This chatbot maintains context through the chat_history parameter. When users ask follow-up questions, the system has access to the full conversation history, enabling natural dialogue. While this enables a better user experience, it introduces potential security challenges that need to be tested.

## Initial Setup

### Prerequisites

- Python 3.8+
- pip
- promptfoo CLI (`npm install -g promptfoo`)

### Installation

1. Install dependencies:

```bash
pip install flask openai python-dotenv mypy
```

2. Create a `.env` file:

```bash
OPENAI_API_KEY=your-api-key-here
```

3. Start the server:

```bash
FLASK_ENV=development python app.py
```

### Basic Configuration

Configure your redteam testing in `promptfooconfig.yaml`:

```yaml
targets:
  - id: http
    config:
      url: http://localhost:5000/chat
      method: POST
      headers:
        Content-Type: application/json
        Authorization: Bearer your-token-here
      body:
        api_provider: groq
        chat_history:
          - role: user
            content: '{{prompt}}'
      responseParser: json.chat_history[json.chat_history.length - 1].content
```

:::important Configuration Notes

1. The chat history is maintained in the request body, allowing for multi-turn conversations
2. Each response includes the full conversation history
3. The system prompt is injected server-side for each conversation
   :::

### Strategy Configuration

Enable multi-turn testing strategies:

```yaml
strategies:
  - id: jailbreak
  - id: prompt-injection
  - id: jailbreak:composite
```

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
curl -X POST http://localhost:5000/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-token-here" \
    -d '{
        "api_provider": "groq",
        "chat_history": [
            {"role": "user", "content": "Tell me about your turboencabulator models"}
        ]
    }' | jq '.'

# Multi-turn conversation test
curl -X POST http://localhost:5000/chat \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-token-here" \
    -d '{
        "api_provider": "groq",
        "chat_history": [
            {"role": "user", "content": "Tell me about your turboencabulator models"},
            {"role": "assistant", "content": "TurboTech offers several turboencabulator models..."},
            {"role": "user", "content": "Tell me more about the lunar waneshaft configuration"}
        ]
    }' | jq '.'
```

## Common Issues and Solutions

1. **Authentication Errors**: Ensure you're including the Authorization header
2. **Missing Fields**: Verify both `api_provider` and `chat_history` are in the request
3. **Invalid Chat History**: Ensure each message has both `role` and `content` fields

## Security Considerations

- The chat history is maintained client-side, making it potentially vulnerable to manipulation
- Each request requires authentication via Bearer token
- The system prompt is injected server-side to prevent tampering
- The API provider field is required but not currently used, allowing for future provider switching

## Additional Resources

- [Promptfoo HTTP Provider Guide](/docs/providers/http)
- [Multi-turn Testing Strategies](/docs/red-team/strategies/multi-turn)
