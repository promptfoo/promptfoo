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

Test multi-turn agentic workflows built with the [@openai/agents](https://github.com/openai/openai-agents-js) SDK. Evaluate agents that use tools, hand off between specialists, and handle multi-step tasks.

## Prerequisites

- Install SDK: `npm install @openai/agents`
- Set `OPENAI_API_KEY` environment variable
- Agent definition (inline or in a TypeScript/JavaScript file)

## Basic Usage

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent:
        name: Customer Support Agent
        model: gpt-5-mini
        instructions: You are a helpful customer support agent.
      maxTurns: 10
```

## Configuration Options

| Parameter          | Description                                                                         | Default               |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------- |
| `agent`            | Agent definition (inline object or `file://path`)                                   | -                     |
| `tools`            | Additional tool definitions (inline array or `file://path`)                         | -                     |
| `handoffs`         | Additional handoff definitions (inline array or `file://path`)                      | -                     |
| `maxTurns`         | Maximum conversation turns                                                          | 10                    |
| `model`            | Override model specified in agent definition                                        | -                     |
| `modelSettings`    | SDK `ModelSettings` overrides, including reasoning, verbosity, and retry settings   | -                     |
| `inputGuardrails`  | Additional input guardrails (inline array or `file://`)                             | -                     |
| `outputGuardrails` | Additional output guardrails (inline array or `file://`)                            | -                     |
| `executeTools`     | Execute function tools normally (`real`) or replace them with mocked results        | `real`                |
| `toolMocks`        | Mocked tool outputs keyed by tool name, used when `executeTools` is `mock` or false | -                     |
| `tracing`          | Enable OpenTelemetry OTLP tracing                                                   | false                 |
| `otlpEndpoint`     | Custom OTLP endpoint URL for tracing                                                | http://localhost:4318 |

## File-Based Configuration

Load agent and tools from external files:

```yaml
providers:
  - openai:agents:support-agent
    config:
      agent: file://./agents/support-agent.ts
      tools: file://./tools/support-tools.ts
      maxTurns: 15
      tracing: true
```

Top-level `tools`, `handoffs`, `inputGuardrails`, and `outputGuardrails` augment whatever is already defined on the loaded agent.

**Example agent file (`agents/support-agent.ts`):**

```typescript
import { Agent } from '@openai/agents';

export default new Agent({
  name: 'Support Agent',
  model: 'gpt-5-mini',
  instructions: 'You are a helpful customer support agent.',
});
```

**Example tools file (`tools/support-tools.ts`):**

```typescript
import { tool } from '@openai/agents';
import { z } from 'zod';

export const lookupOrder = tool({
  name: 'lookup_order',
  description: 'Look up order status by order ID',
  parameters: z.object({
    order_id: z.string().describe('The order ID'),
  }),
  execute: async ({ order_id }) => {
    return { status: 'shipped', tracking: 'ABC123' };
  },
});

export default [lookupOrder];
```

## Agent Handoffs

Transfer conversations between specialized agents:

```yaml
providers:
  - openai:agents:triage
    config:
      agent:
        name: Triage Agent
        model: gpt-5-mini
        instructions: Route questions to the appropriate specialist.
      handoffs:
        - agent:
            name: Technical Support
            model: gpt-5-mini
            instructions: Handle technical troubleshooting.
          description: Transfer for technical issues
```

## Guardrails

Validate tool inputs and outputs with guardrails:

```yaml
providers:
  - openai:agents:secure-agent
    config:
      agent: file://./agents/secure-agent.ts
      inputGuardrails: file://./guardrails/input-guardrails.ts
      outputGuardrails: file://./guardrails/output-guardrails.ts
```

Guardrails run validation logic before tool execution (input) and after (output), enabling content filtering, PII detection, or custom business rules.

## Retry Policies

OpenAI Agents SDK v0.7 added opt-in retry settings on `modelSettings.retry`. Promptfoo supports YAML-friendly retry policy presets and passes them to the SDK as runtime callbacks.

```yaml
providers:
  - openai:agents:support-agent
    config:
      agent: file://./agents/support-agent.ts
      modelSettings:
        retry:
          maxRetries: 2
          backoff:
            initialDelayMs: 250
            maxDelayMs: 2000
            multiplier: 2
            jitter: true
          policy:
            any:
              - providerSuggested
              - httpStatus:
                  - 429
                  - 503
```

Supported preset policies are `never`, `providerSuggested`, `networkError`, and `retryAfter`.

You can also compose them with `any` or `all`. If you are configuring Promptfoo in TypeScript or JavaScript instead of YAML, you can pass SDK retry callbacks directly.

## Mock Tool Execution

Use mocked tool outputs when you want deterministic evals without calling external systems:

```yaml
providers:
  - openai:agents:support-agent
    config:
      agent: file://./agents/support-agent.ts
      tools: file://./tools/support-tools.ts
      executeTools: mock
      toolMocks:
        lookup_order:
          status: shipped
          tracking: ABC123
```

## Tracing

Enable OpenTelemetry tracing to debug agent execution:

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent: file://./agents/my-agent.ts
      tracing: true # Exports to http://localhost:4318
```

With a custom OTLP endpoint:

```yaml
providers:
  - openai:agents:my-agent
    config:
      agent: file://./agents/my-agent.ts
      tracing: true
      otlpEndpoint: https://otel-collector.example.com:4318
```

Or enable globally:

```bash
export PROMPTFOO_TRACING_ENABLED=true
npx promptfoo eval
```

Traces include agent execution spans, tool invocations, model calls, handoff events, and token usage.

Once Promptfoo is collecting those traces, you can assert on the agent's path instead of only its final message:

```yaml
tests:
  - vars:
      query: 'Find order 123 and tell me whether it shipped'
    assert:
      - type: trajectory:tool-used
        value: search_orders

      - type: trajectory:tool-args-match
        value:
          name: search_orders
          args:
            order_id: '123'

      - type: trajectory:tool-sequence
        value:
          steps:
            - search_orders
            - compose_reply

      - type: trajectory:goal-success
        value: 'Determine whether order 123 shipped and tell the user the correct status'
        provider: openai:gpt-5-mini
```

See [Tracing](/docs/tracing/) for the eval-level OTLP setup required when you want Promptfoo to ingest and evaluate these traces directly.

## Example: D&D Dungeon Master

Full working example with D&D mechanics, dice rolling, and character management:

```yaml
description: D&D Adventure with AI Dungeon Master

prompts:
  - '{{query}}'

providers:
  - id: openai:agents:dungeon-master
    config:
      agent: file://./agents/dungeon-master-agent.ts
      tools: file://./tools/game-tools.ts
      maxTurns: 20
      tracing: true

tests:
  - description: Dragon combat with attack roll
    vars:
      query: 'I draw my longsword and attack the red dragon!'
    assert:
      - type: llm-rubric
        value: Response includes dice rolls for attack and damage

  - description: Check character stats
    vars:
      query: 'What are my character stats and current HP?'
    assert:
      - type: contains-any
        value: ['Thorin', 'Fighter', 'level 5']
```

:::tip

Try the interactive example: `npx promptfoo@latest init --example openai-agents-basic`

:::

## Environment Variables

| Variable                    | Description                |
| --------------------------- | -------------------------- |
| `OPENAI_API_KEY`            | OpenAI API key (required)  |
| `PROMPTFOO_TRACING_ENABLED` | Enable tracing globally    |
| `OPENAI_BASE_URL`           | Custom OpenAI API base URL |
| `OPENAI_ORGANIZATION`       | OpenAI organization ID     |

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
