---
title: OpenAI Agents
description: Test OpenAI Agents with tools, handoffs, sessions, sandbox workflows, and tracing in promptfoo.
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

Test multi-turn agentic workflows built with the [@openai/agents](https://github.com/openai/openai-agents-js) SDK. Evaluate agents that use tools, persist session history, hand off between specialists, or run inside the SDK's sandbox runtime.

:::note
This page covers the JavaScript `@openai/agents` SDK and the built-in `openai:agents:*` provider.

If you are using the Python `openai-agents` SDK, use the [OpenAI Agents Python SDK guide](/docs/guides/evaluate-openai-agents-python) and the [`openai-agents` example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents) instead.
:::

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
| `session`          | Persistent SDK session definition, instance, factory, or `file://` export           | -                     |
| `sandbox`          | Sandbox runtime config, local client definition, factory, or `file://` export       | -                     |
| `runOptions`       | Additional non-streaming SDK `run()` options such as `conversationId` or filters    | -                     |
| `executeTools`     | Execute function tools normally (`real`) or replace them with mocked results        | `real`                |
| `toolMocks`        | Mocked tool outputs keyed by tool name, used when `executeTools` is `mock` or false | -                     |
| `tracing`          | Enable Promptfoo OTLP export for SDK spans                                          | false                 |
| `otlpEndpoint`     | Custom OTLP endpoint URL for Promptfoo tracing                                      | http://localhost:4318 |

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

Any SDK `Tool` instance is accepted when it comes from a JavaScript/TypeScript file export. That includes function tools, hosted tools, `computerTool`, `shellTool`, and `applyPatchTool`. Inline YAML tool definitions are for function tools only.

Inline agent definitions follow the SDK `AgentOptions` surface for fields such as dynamic `instructions`, dynamic `prompt`, `handoffOutputTypeWarningEnabled`, `toolUseBehavior`, and `resetToolChoice`. Use a file-exported SDK agent when those options need executable code.

## Multimodal Input

If a rendered prompt is a JSON object or array that matches the SDK's `AgentInputItem` shape, Promptfoo passes it to `run()` as structured input instead of a plain string. This supports image, audio, and file inputs:

```yaml
prompts:
  - file://./prompts/vision-input.json

providers:
  - id: openai:agents:vision-agent
    config:
      agent: file://./agents/vision-agent.ts

tests:
  - vars:
      image: file://./images/cat.jpg
```

Example prompt file (`prompts/vision-input.json`):

```json
[
  {
    "role": "user",
    "content": [
      { "type": "input_text", "text": "What is in this image?" },
      { "type": "input_image", "image": "{{image}}" }
    ]
  }
]
```

Promptfoo resolves local image vars like `file://./images/cat.jpg` to data URLs before the prompt is passed to the SDK.

Arbitrary JSON prompts that do not match an agent input item are still sent as plain text.

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

## Sessions

OpenAI Agents SDK sessions keep conversation history across agent runs. Promptfoo supports the SDK session classes directly and also provides YAML-friendly shortcuts for the built-in session types:

```yaml
providers:
  - openai:agents:support-agent
    config:
      agent: file://./agents/support-agent.ts
      session:
        type: memory
        sessionId: support-demo
```

Supported inline session types are:

| Type                          | Use case                                                                 |
| ----------------------------- | ------------------------------------------------------------------------ |
| `memory`                      | Local in-memory demo or test session                                     |
| `openai-conversations`        | Server-managed OpenAI Conversations API history                          |
| `openai-responses-compaction` | Responses API history with automatic compaction over an underlying store |

For more control, export an SDK `Session` instance or a factory from a file:

```yaml
providers:
  - openai:agents:support-agent
    config:
      agent: file://./agents/support-agent.ts
      session: file://./sessions/support-session.ts
```

Inline session definitions and exported session instances stay attached to the provider for later turns. Export a factory when you want Promptfoo to create a fresh session for each call.

If you need the full `run()` surface, use `runOptions`. Promptfoo reserves `context`, `maxTurns`, `signal`, and streaming mode, but passes through the remaining non-streaming SDK options:

```yaml
providers:
  - openai:agents:support-agent
    config:
      agent: file://./agents/support-agent.ts
      runOptions:
        previousResponseId: resp_123
        conversationId: conv_123
        reasoningItemIdPolicy: omit
```

When an option needs executable code, such as `sessionInputCallback`, `callModelInputFilter`, `toolErrorFormatter`, or `errorHandlers`, point it at a `file://` export.

## Local Context

Promptfoo passes the current test vars into the SDK's local `context` object for each run. Tools and callbacks can read those values through `runContext.context`:

```typescript
export const lookupCustomerContext = tool({
  name: 'lookup_customer_context',
  description: 'Read the current customer tier from local run context.',
  parameters: z.object({}),
  execute: async (_args, runContext) => ({
    customer_tier: (runContext?.context as { customer_tier?: string }).customer_tier,
  }),
});
```

Use this for local application state that should be available to tools and hooks. It is separate from conversation history; use `session`, `conversationId`, or `previousResponseId` when you want to carry turns forward.

## Stateful Red Team Runs

Stateful red-team strategies such as [`crescendo`](/docs/red-team/strategies/multi-turn) and [`hydra`](/docs/red-team/strategies/hydra) need two things at once:

- all turns within one attack should share history
- separate tests should not share the same session

Use `transformVars` to stamp each test with a stable per-test session ID, then export a session factory that reuses sessions by that ID:

```yaml
providers:
  - openai:agents:support-agent
    config:
      agent: file://./agents/support-agent.ts
      session: file://./sessions/redteam-session.ts

defaultTest:
  options:
    transformVars: '{ ...vars, sessionId: context.uuid }'

redteam:
  strategies:
    - id: crescendo
      config:
        stateful: true
```

```typescript title="sessions/redteam-session.ts"
import { MemorySession } from '@openai/agents';

const sessions = new Map<string, MemorySession>();

export default async function createSession(context?: {
  vars?: {
    sessionId?: string;
  };
}) {
  const sessionId = context?.vars?.sessionId ?? 'default-session';
  const existing = sessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const session = new MemorySession({ sessionId });
  sessions.set(sessionId, session);
  return session;
}
```

This keeps each multi-turn attack stateful while still isolating one generated test case from another. With Hydra, set `stateful: true` only after configuring this session factory so Hydra can send just the newest turn while the SDK session preserves earlier turns. The same pattern is useful for [`agentic:memory-poisoning`](/docs/red-team/plugins/memory-poisoning), which also depends on persistent state across turns.

## Sandbox Agents

`@openai/agents` v0.9 added beta `SandboxAgent` support in the JavaScript SDK. File-exported sandbox agents work with the same provider:

```typescript
import { Manifest, SandboxAgent, file } from '@openai/agents/sandbox';

export default new SandboxAgent({
  name: 'Workspace Assistant',
  instructions: 'Inspect the workspace before answering.',
  defaultManifest: new Manifest({
    entries: {
      'task.md': file({ content: 'Ticket PF-42: update the release note.' }),
    },
  }),
});
```

```yaml
providers:
  - openai:agents:workspace-agent
    config:
      agent: file://./agents/workspace-agent.ts
      sandbox:
        type: unix-local
      maxTurns: 12
```

Use `type: unix-local` for the SDK's local sandbox client or `type: docker` for the Docker client. You can also pass a full SDK `SandboxRunConfig`, a file export, or a factory if you need custom sessions, snapshots, manifests, or clients.

Inline agent definitions can opt into the sandbox runtime with `type: sandbox`, but file-exported SDK agents are the better fit once you need custom capability objects such as `skills()` or non-default manifests.

## Skills and Shell Tools

The JavaScript SDK exposes local skills through `shellTool` and sandbox capability objects. Because these require executable SDK objects, define them in TypeScript/JavaScript and load them from `file://` rather than trying to express them as YAML:

```typescript
import { shellTool } from '@openai/agents';

export default [
  shellTool({
    shell: myShellImplementation,
    environment: {
      type: 'local',
      skills: [
        {
          name: 'ticket-summary',
          description: 'Summarize ticket files',
          path: './skills/ticket-summary',
        },
      ],
    },
  }),
];
```

For `SandboxAgent` workflows, use the SDK's sandbox capability helpers in the exported agent file. Prefer an explicit capability list such as `shell()` plus `skills({ ... })` when you know the model only needs those tools; the SDK's broader default capability set can expose tools that a particular model does not support.

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

Traces include agent execution spans, tool invocations, model calls, handoff events, token usage, and sandbox lifecycle spans. Promptfoo normalizes SDK tool spans into `tool.name`, `tool.arguments`, and `tool.output`, and sandbox command spans into command trajectory steps so the standard `trajectory:*` assertions work on both regular and sandbox runs.

When Promptfoo tracing is enabled, the provider adds Promptfoo OTLP export alongside any tracing processors already registered in the SDK. If Promptfoo tracing is disabled, the SDK's own tracing behavior still applies; set `OPENAI_AGENTS_DISABLE_TRACING=1` if you also want to suppress the SDK exporter.

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

## Example: Advanced TypeScript Features

For sessions, tracing assertions, sandbox agents, and skills, see the runnable [`openai-agents-advanced`](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents-advanced) example:

```bash
npx promptfoo@latest init --example openai-agents-advanced
cd openai-agents-advanced
npx promptfoo eval -c promptfooconfig.yaml --no-cache -j 1
npx promptfoo eval -c promptfooconfig.sandbox.yaml --no-cache
```

## Scope

This provider targets non-streaming text and sandbox `run()` workflows. Use `openai:realtime:*` for Realtime API evals. Serialized human-in-the-loop `RunState` resume flows are application state, so test those through a custom JavaScript provider wrapper instead of passing them as prompt text.

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
- [OpenAI Agents Python SDK Guide](/docs/guides/evaluate-openai-agents-python) - Python SDK example with Promptfoo tracing and framework-specific provider wrapping
- [Tracing](/docs/tracing) - OTLP ingestion and trajectory assertions
- [Red Team Guide](/docs/red-team/quickstart) - Test agent safety
- [Multi-turn Jailbreaks](/docs/red-team/strategies/multi-turn) - Stateful red-team strategy guidance
- [Multi-turn Session Management](/docs/red-team/troubleshooting/multi-turn-sessions) - Provider-specific session setup
- [Assertions](/docs/configuration/expected-outputs) - Validate agent responses
- [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) - Official SDK documentation
