# Redteaming a Chatbase Chatbot

## Introduction

[Chatbase](https://www.chatbase.co) is a platform for building custom AI chatbots that can be embedded into websites for customer support, lead generation, and user engagement. These chatbots use RAG (Retrieval Augmented Generation) to access your organization's knowledge base and maintain conversations with users. Whether deployed internally or externally, they present unique security challenges.

## Multi-turn vs Single-turn Testing

### Single-turn Systems

Many LLM applications process each query independently, treating every interaction as a new conversation. Like talking to someone with no memory of previous exchanges, they can answer your current question but don't retain context from earlier messages. This makes single-turn systems inherently more secure since attackers can't manipulate conversation history. However, this security comes at the cost of usability - users must provide complete context with every message, making interactions cumbersome.

### Multi-turn Systems (Like Chatbase)

Modern conversational AI, including Chatbase, maintains context throughout the interaction. When users ask follow-up questions, the system understands the context from previous messages, enabling natural dialogue. This state is managed through a `conversationId` that links messages together. While this enables sophisticated interactions and better user experience, it introduces security challenges. Attackers might try to manipulate the conversation context across multiple messages, either building false premises or attempting to extract sensitive information. These attacks are harder to detect, but promptfoo's multi-turn testing strategies can help identify vulnerabilities.

## Initial Setup

### Prerequisites

- Node.js 18+
- Chatbase API credentials
  - API Bearer Token
  - Chatbot ID

### Basic Configuration

First, initialize the red team testing environment:

```bash
npx promptfoo@latest redteam init
```

This launches a setup UI for configuring your Chatbase target, plugins, and strategies. After configuration, you'll be able to download a configuration file. The Chatbase target configuration is very important and should look similar to this:

```yaml
targets:
  - id: 'https://www.chatbase.co/api/v1/chat'
    config:
      method: 'POST'
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
      requestParser: '{ messages: [{ role: "user", content: prompt }] }'
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

Enable promptfoo's multi-turn strategies `goat` and `crescendo` in your strategy configuration. You should set `stateless` to `false` for both strategies.

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

Run your tests:

```bash
# Generate test cases
npx promptfoo@latest redteam generate

# Execute evaluation
npx promptfoo@latest redteam eval

# View results
npx promptfoo@latest view
```
