# elevenlabs-agents (ElevenLabs Conversational Agents)

Test and evaluate ElevenLabs voice AI agents with multi-turn conversations.

## What this tests

- **Agent conversation quality**: Multi-turn dialogue handling
- **Evaluation criteria**: Greeting, understanding, accuracy, helpfulness
- **Simulated user behavior**: Automated conversation testing
- **Tool usage**: Agent tool calls and responses
- **Cost and latency** metrics

## Setup

Set your ElevenLabs API key:

```bash
export ELEVENLABS_API_KEY=your_api_key_here
```

## Run the example

```bash
npx promptfoo@latest eval -c ./promptfooconfig.yaml
```

Or view in the UI:

```bash
npx promptfoo@latest eval -c ./promptfooconfig.yaml
npx promptfoo@latest view
```

## What to look for

1. **Conversation flow**: How well the agent maintains context across turns
2. **Evaluation scores**: Automated grading on multiple criteria (0-1 scale)
3. **Tool usage**: When and how the agent calls available tools
4. **Response quality**: Agent's ability to understand and respond accurately
5. **Cost tracking**: Per-conversation and per-turn costs

## Conversation formats

This example supports multiple input formats:

### 1. Plain text (treated as first user message)

```yaml
prompts:
  - 'Hello, I need help with my order'
```

### 2. Multi-line with role prefixes

```yaml
prompts:
  - |
    User: Hi, what's the weather like?
    Agent: I'd be happy to help! Where are you located?
    User: I'm in San Francisco
```

### 3. Structured JSON

```yaml
prompts:
  - |
    {
      "turns": [
        {"speaker": "user", "message": "Hello"},
        {"speaker": "agent", "message": "Hi! How can I help?"},
        {"speaker": "user", "message": "I need support"}
      ]
    }
```

## Agent configuration

Customize the agent behavior:

```yaml
config:
  agentConfig:
    name: Customer Support Agent
    prompt: You are a helpful, empathetic customer support agent...
    firstMessage: Hi! I'm here to help. What can I do for you today?
    language: en
    voiceId: 21m00Tcm4TlvDq8ikWAM
    llmModel: gpt-4o
    temperature: 0.7
    maxTokens: 500
```

## Evaluation criteria

Common criteria presets available:

- `greeting` - Professional greeting (weight: 0.8, threshold: 0.8)
- `understanding` - Accurate intent understanding (weight: 1.0, threshold: 0.9)
- `accuracy` - Correct information (weight: 1.0, threshold: 0.9)
- `helpfulness` - Helpful responses (weight: 0.9, threshold: 0.8)
- `professionalism` - Professional tone (weight: 0.7, threshold: 0.8)
- `empathy` - Empathetic responses (weight: 0.8, threshold: 0.7)
- `efficiency` - Concise responses (weight: 0.7, threshold: 0.7)
- `resolution` - Problem resolution (weight: 1.0, threshold: 0.8)

## Simulated user

Configure the simulated user's behavior:

```yaml
simulatedUser:
  prompt: Act as a customer who is frustrated but polite
  temperature: 0.8
  responseStyle: casual # concise | verbose | casual | formal
```

## Available tools

Example tools for agents:

- `get_weather` - Get current weather
- `search_knowledge_base` - Search documentation
- `create_ticket` - Create support ticket
- `send_email` - Send email notification
- `get_order_status` - Check order status
- `schedule_callback` - Schedule callback
- `transfer_agent` - Transfer to human agent

## Learn more

- [ElevenLabs Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai)
- [Agent Configuration Guide](https://elevenlabs.io/docs/conversational-ai/agents)
- [Pricing](https://elevenlabs.io/pricing)
