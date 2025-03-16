# Redteaming a Chatbase Chatbot

## Introduction

[Chatbase](https://www.chatbase.co) is a platform for building custom AI chatbots that can be embedded into websites for customer support, lead generation, and user engagement. These chatbots use RAG (Retrieval-Augmented Generation) to access your organization's knowledge base and maintain conversations with users.

## Multi-turn vs Single-turn Testing

### Single-turn Systems

Many LLM applications process each query independently, treating every interaction as a new conversation. Like talking to someone with no memory of previous exchanges, they can answer your current question but don't retain context from earlier messages.

This makes single-turn systems inherently more secure since attackers can't manipulate conversation history. However, this security comes at the cost of usability - users must provide complete context with every message, making interactions cumbersome.

### Multi-turn Systems (Like Chatbase)

Modern conversational AI, including Chatbase, maintains context throughout the interaction. When users ask follow-up questions, the system understands the context from previous messages, enabling natural dialogue.

In Promptfoo, this state is managed through a `conversationId` that links messages together. While this enables a better user experience, it introduces security challenges. Attackers might try to manipulate the conversation context across multiple messages, either building false premises or attempting to extract sensitive information.

## Initial Setup

### Prerequisites

- Node.js 18+
- promptfoo CLI (`npm install -g promptfoo`)
- Chatbase API credentials:
  - API Bearer Token (from your Chatbase dashboard)
  - Chatbot ID (found in your bot's settings)

### Basic Configuration

1. Initialize the red team testing environment:

```bash
promptfoo redteam init
```

2. Configure your Chatbase target in the setup UI. Your configuration file should look similar to this:

```yaml
targets:
  - id: 'http'
    config:
      method: 'POST'
      url: 'https://www.chatbase.co/api/v1/chat'
      headers:
        'Content-Type': 'application/json'
        'Authorization': 'Bearer YOUR_API_TOKEN'
      body:
        {
          'messages': '{{prompt}}',
          'chatbotId': 'YOUR_CHATBOT_ID',
          'stream': false,
          'temperature': 0,
          'model': 'gpt-4o-mini',
          'conversationId': '{{conversationId}}',
        }
      transformResponse: 'json.text'
      transformRequest: '[{ role: "user", content: prompt }]'
defaultTest:
  options:
    transformVars: '{ ...vars, conversationId: context.uuid }'
```

:::important Configuration Notes

1. Configure both the `transformRequest` and `transformResponse` for your chatbot:

   - `transformRequest`: Formats the request as OpenAI-compatible messages
   - `transformResponse`: Extracts the response text from the JSON body

2. The `context.uuid` generates a unique conversation ID for each test, enabling Chatbase to track conversation state across multiple messages.
   :::

### Strategy Configuration

Enable multi-turn testing strategies in your `promptfooconfig.yaml`:

```yaml
strategies:
  - id: 'goat'
    config:
      stateful: true
  - id: 'crescendo'
    config:
      stateful: true
```

## Test Execution

Run your tests with these commands:

```bash
# Generate test cases
promptfoo redteam generate

# Execute evaluation
promptfoo redteam eval

# View detailed results in the web UI
promptfoo view
```

## Common issues and solutions

If you encounter issues:

1. If tests fail to connect, verify your API credentials
2. If the message content is garbled, verify your request parser and response parser are correct.

## Additional Resources

- [Chatbase API Documentation](https://www.chatbase.co/docs)
- [Promptfoo HTTP Provider Guide](/docs/providers/http)
- [Multi-turn Testing Strategies](/docs/red-team/strategies/multi-turn)
