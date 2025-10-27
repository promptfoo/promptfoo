---
title: OpenAI Agents
description: Test multi-turn OpenAI Agents with tools, handoffs, and tracing in promptfoo.
keywords:
  [
    openai agents,
    multi-turn workflows,
    agent tools,
    agent handoffs,
    agentic systems,
    function calling,
    opentelemetry tracing,
  ]
sidebar_label: OpenAI Agents
---

# OpenAI Agents

Test multi-turn agentic workflows built with the [@openai/agents](https://github.com/openai/openai-agents-js) SDK. This provider lets you evaluate agents that use tools, hand off between specialists, and handle complex multi-step tasks.

## Prerequisites

- OpenAI Agents SDK installed: `npm install @openai/agents`
- OpenAI API key: Set `OPENAI_API_KEY` environment variable
- Agent definition (inline or in a TypeScript/JavaScript file)

## Basic Configuration

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent:
        name: Customer Support Agent
        model: gpt-5-mini
        instructions: You are a helpful customer support agent.
```

## Full Configuration Options

All available configuration options:

```yaml
providers:
  - id: openai:agents:support-agent
    config:
      # Agent Definition (required)
      # Inline agent definition
      agent:
        name: Support Agent
        model: gpt-5-mini
        instructions: |
          You are a customer support agent. Help users with their questions.
          Use tools when needed to look up information.
        temperature: 0.7

      # Or load from file
      agent: file://./agents/support-agent.ts

      # Tools Configuration
      # Inline tools array
      tools:
        - name: lookup_order
          description: Look up order status by order ID
          parameters:
            type: object
            properties:
              order_id:
                type: string
                description: The order ID to look up
            required: [order_id]
          execute: |
            async function(args) {
              return { status: 'shipped', tracking: 'ABC123' };
            }

      # Or load from file
      tools: file://./tools/support-tools.ts

      # Handoffs Configuration
      # Allows agent to transfer to specialized agents
      handoffs:
        - agent:
            name: Billing Agent
            model: gpt-5-mini
            instructions: Handle billing and payment questions.
          description: Transfer to billing specialist for payment issues

      # Or load from file
      handoffs: file://./handoffs/support-handoffs.ts

      # Execution Options
      maxTurns: 10  # Maximum conversation turns (default: 10)
      model: gpt-5  # Override the model specified in agent definition

      # Model Settings
      modelSettings:
        temperature: 0.7
        topP: 0.9
        maxTokens: 2000

      # Tracing (OpenTelemetry)
      tracing: true  # Enable OTLP tracing
```

## Features

### Multi-Turn Conversations

Agents handle multi-turn workflows automatically:

```yaml
tests:
  - description: Multi-step research task
    vars:
      query: Research the latest AI models and create a comparison table
    assert:
      - type: contains
        value: comparison
      - type: javascript
        value: output.includes('GPT') && output.includes('Claude')
```

### Tools and Function Calling

Define tools for your agents:

**Inline Tool Definition:**

```yaml
providers:
  - openai:agents:calculator
    config:
      agent:
        name: Calculator Agent
        model: gpt-5-mini
        instructions: Use the calculator tool to perform math operations.
      tools:
        - name: calculate
          description: Perform mathematical calculations
          parameters:
            type: object
            properties:
              expression:
                type: string
                description: Math expression to evaluate
            required: [expression]
          execute: |
            async function(args) {
              return { result: eval(args.expression) };
            }
```

**File-Based Tools:**

Create `tools/calculator-tools.ts`:

```typescript
export default [
  {
    name: 'calculate',
    description: 'Perform mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Math expression to evaluate',
        },
      },
      required: ['expression'],
    },
    execute: async (args: { expression: string }) => {
      return { result: eval(args.expression) };
    },
  },
];
```

Then reference it in your config:

```yaml
providers:
  - openai:agents:calculator
    config:
      agent: file://./agents/calculator-agent.ts
      tools: file://./tools/calculator-tools.ts
```

### Agent Handoffs

Transfer conversations between specialized agents:

```yaml
providers:
  - openai:agents:triage
    config:
      agent:
        name: Triage Agent
        model: gpt-5-mini
        instructions: |
          You are a triage agent. Route technical questions to the tech agent,
          billing questions to the billing agent.
      handoffs:
        - agent:
            name: Technical Support
            model: gpt-5-mini
            instructions: Handle technical troubleshooting.
          description: Transfer to technical support for technical issues
        - agent:
            name: Billing Support
            model: gpt-5-mini
            instructions: Handle billing and payment questions.
          description: Transfer to billing for payment issues

tests:
  - vars:
      query: I can't log into my account
    assert:
      - type: llm-rubric
        value: Response addresses technical login issues
```

### File-Based Agent Definitions

Keep agent definitions in separate files:

**agents/research-agent.ts:**

```typescript
import { Agent } from '@openai/agents';

const agent: Agent<any, any> = {
  name: 'Research Agent',
  model: 'gpt-5',
  instructions: `You are a research agent. Your task is to:
1. Break down research questions into sub-questions
2. Use search tools to gather information
3. Synthesize findings into a comprehensive response`,
  temperature: 0.7,
};

export default agent;
```

**promptfooconfig.yaml:**

```yaml
providers:
  - openai:agents:researcher
    config:
      agent: file://./agents/research-agent.ts
      tools: file://./tools/search-tools.ts
      maxTurns: 15
```

### Context Variables

Pass dynamic context to agents:

```yaml
tests:
  - vars:
      user_query: What's my account balance?
      city: New York
      temperature: 20
    providers:
      - openai:agents:weather
        config:
          agent:
            name: Weather Agent
            model: gpt-5-mini
            instructions: |
              Provide weather information for the user's location.
              Use context.city and context.temperature.
```

Context variables are accessible in the agent's execution environment.

### OpenTelemetry Tracing

Enable tracing for debugging:

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent: file://./agents/my-agent.ts
      tracing: true  # Export traces via OTLP
```

Or enable globally via environment variable:

```bash
export PROMPTFOO_TRACING_ENABLED=true
npx promptfoo eval
```

Traces are exported to your OTLP endpoint (default: `http://localhost:4318`) and include:

- Agent execution spans
- Tool invocations
- Model calls
- Handoff events
- Token usage

### Model Overrides

Override the model specified in the agent definition:

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent:
        name: My Agent
        model: gpt-5-mini
        instructions: You are a helpful assistant.
      model: gpt-5  # Override to use gpt-5 instead
```

## Example: Customer Support Agent

Full example with tools and handoffs:

:::tip

Try the interactive example: `npx promptfoo@latest init --example openai-agents-basic`

:::

**agents/support-agent.ts:**

```typescript
import { Agent } from '@openai/agents';

export default {
  name: 'Customer Support Agent',
  model: 'gpt-5-mini',
  instructions: `You are a customer support agent. Help customers with:
- Order status lookups
- Account questions
- Technical issues

Use tools to look up information. Transfer to specialized agents when needed.`,
} as Agent<any, any>;
```

**tools/support-tools.ts:**

```typescript
export default [
  {
    name: 'lookup_order',
    description: 'Look up order status by order ID',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
      },
      required: ['order_id'],
    },
    execute: async ({ order_id }: { order_id: string }) => {
      // In production, this would call your API
      return {
        status: 'shipped',
        tracking: 'TRACK123',
        expected_delivery: '2024-03-15',
      };
    },
  },
];
```

**handoffs/support-handoffs.ts:**

```typescript
import { Agent } from '@openai/agents';

export default [
  {
    agent: {
      name: 'Billing Specialist',
      model: 'gpt-5-mini',
      instructions: 'Handle billing, payments, refunds, and invoices.',
    } as Agent<any, any>,
    description: 'Transfer to billing specialist for payment questions',
  },
];
```

**promptfooconfig.yaml:**

```yaml
description: Customer Support Agent Tests

providers:
  - id: openai:agents:support
    config:
      agent: file://./agents/support-agent.ts
      tools: file://./tools/support-tools.ts
      handoffs: file://./handoffs/support-handoffs.ts
      maxTurns: 10
      tracing: true

tests:
  - description: Order status lookup
    vars:
      query: What's the status of order 12345?
    assert:
      - type: contains
        value: shipped
      - type: contains
        value: TRACK123

  - description: Billing question handoff
    vars:
      query: I was charged twice, can I get a refund?
    assert:
      - type: llm-rubric
        value: Agent transferred to billing specialist

  - description: Technical support
    vars:
      query: I can't log into my account
    assert:
      - type: llm-rubric
        value: Agent provided troubleshooting steps
```

## Environment Variables

- `OPENAI_API_KEY`: OpenAI API key (required)
- `PROMPTFOO_TRACING_ENABLED`: Enable tracing globally
- `OPENAI_BASE_URL`: Custom OpenAI API base URL
- `OPENAI_ORGANIZATION`: OpenAI organization ID

## Limitations

:::warning

Tools must be async functions. Synchronous tools will cause runtime errors.

:::

- Agent definition files must be TypeScript or JavaScript
- File paths require `file://` prefix (relative paths resolve from config file location)
- Default maximum: 10 turns (configure with `maxTurns`)

## Related Documentation

- [OpenAI Provider](/docs/providers/openai) - Standard OpenAI completions and chat
- [Red Team Guide](/docs/red-team/quickstart) - Test agent safety
- [Assertions](/docs/configuration/expected-outputs) - Validate agent responses
- [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) - Official SDK documentation
