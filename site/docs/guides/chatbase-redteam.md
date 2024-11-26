# Redteaming a Chatbase Chatbot

## Introduction

[Chatbase](https://www.chatbase.co) is a platform for building custom AI chatbots that can be embedded into websites for customer support, lead generation, and user engagement. These chatbots use RAG to access your organization's knowledge base and maintain conversations with users.

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
- Chatbase API credentials
  - API Bearer Token (from your Chatbase dashboard)
  - Chatbot ID (found in your bot's settings)

### Basic Configuration

First, initialize the red team testing environment:

```bash
promptfoo redteam init
```

This launches a setup UI for configuring your Chatbase target, plugins, and test strategies. After configuration, you'll receive a configuration file. The Chatbase target configuration is crucial and should look similar to this:

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
      responseParser: 'json.text'
      requestParser: '[{ role: "user", content: prompt }]'
defaultTest:
  options:
    transformVars: '{ ...vars, conversationId: context.uuid }'
```

:::note
Make sure to set both the `requestParser` and `responseParser` to the correct values for your chatbot. Because Chatbase is OpenAI compatible, the request parser is used to format the request body as a list of messages. The response parser is used to parse the response body as JSON.
:::

:::note
`context.uuid` generates a random UUID for each conversation allowing Chatbase to track the conversation state across multiple messages.
:::

### Strategy Configuration

Enable promptfoo's multi-turn strategies in your `promptfooconfig.yaml` file.

```yaml
strategies:
  - id: 'goat'
    config:
      stateless: false
  - id: 'crescendo'
    config:
      stateless: false
```

## Test Execution

```bash
# Generate test cases
promptfoo redteam generate

# Execute evaluation
promptfoo redteam eval

# View detailed results in the web UI
promptfoo view
```

## Troubleshooting

Common issues and solutions:

- If tests fail to connect, verify your API credentials
- If the message content is garbled, verify your request parser and response parser are correct
- For RAG-specific issues, ensure your knowledge base is properly configured
