---
title: OpenAI Agents API
description: Evaluate OpenAI's hosted Agents API with isolated Codex sessions, sandbox tools, saved agents, structured output, token accounting, and automatic session cleanup.
sidebar_label: OpenAI Agents API
---

The `openai:agents-api` provider evaluates the [OpenAI Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), which runs agents using OpenAI's managed Codex harness. Each provider call creates a fresh session, waits for the root agent's turn to finish, collects its final answer, and deletes the session.

For applications built with the JavaScript `@openai/agents` package, use the [Agents SDK provider](./openai-agents.md) (`openai:agents:*`).

## Setup

Use an OpenAI project API key with `api.agents.read`, `api.agents.write`, and `api.responses.write` permissions:

```sh
export OPENAI_API_KEY=your-api-key
```

Promptfoo adds the required `OpenAI-Beta: agents=v1` header. No additional SDK package is required. Keep your API key outside the agent's sandbox.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:agents-api:gpt-6-astra
    config:
      agent:
        instructions: Answer concisely.
        reasoning:
          effort: low
      environment:
        type: none
prompts:
  - '{{question}}'
tests:
  - vars:
      question: What is six times seven? Answer with just the number.
    assert:
      - type: equals
        value: '42'
```

## Hosted sandboxes and tools

Set `environment.type: openai_hosted` to let the agent execute commands and work with files. The `environment` object accepts the API's hosted environment settings, including network policy, packages, initial files, skills, and plugins. Configure remote MCP servers and web search in `agent.tools` using the [Agents API tool format](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp).

```yaml
providers:
  - id: openai:agents-api:gpt-6-astra
    config:
      agent:
        instructions: Run Python to check calculations and report the result.
      environment:
        type: openai_hosted
        network:
          access: disabled
```

Try the runnable sandbox example:

```sh
npx promptfoo@latest init --example openai-agents-api
cd openai-agents-api
npx promptfoo@latest eval --no-cache -o results.json
```

## Saved agents

Set `agent_id` to evaluate an existing saved agent in a new session. Omitted agent settings, including the model, are inherited. An `agent` object supplies session-only overrides; arrays and objects replace their saved fields rather than merging.

```yaml
providers:
  - id: openai:agents-api
    config:
      agent_id: agent_your_saved_agent
      agent:
        instructions: Answer this task in one paragraph.
      environment:
        type: none
```

## Configuration

| Option                                             | Description                                                                                                    | Default                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `agent_id`                                         | Saved agent ID                                                                                                 | None                                                 |
| `agent`                                            | API agent settings: model, instructions, reasoning, text format, tools, multi-agent settings, and service tier | `model: gpt-6-astra` when no saved agent is selected |
| `environment`                                      | API environment configuration; `none` or `openai_hosted`                                                       | `{type: none}`                                       |
| `metadata`                                         | Session metadata using the API's string key/value format                                                       | None                                                 |
| `vault_ids`                                        | Vaults available to the session                                                                                | None                                                 |
| `timeoutMs`                                        | Overall request and polling deadline in milliseconds                                                           | `300000`                                             |
| `pollIntervalMs`                                   | Delay between status checks in milliseconds                                                                    | `1000`                                               |
| `retainSession`                                    | Keep successful sessions for later inspection or artifact download                                             | `false`                                              |
| `maxRetries`                                       | Retries for read requests; session creation is not retried                                                     | `4`                                                  |
| `apiKey`, `apiKeyEnvar`                            | Standard OpenAI credential overrides                                                                           | `OPENAI_API_KEY`                                     |
| `apiBaseUrl`, `apiHost`, `organization`, `headers` | Standard OpenAI endpoint and header overrides                                                                  | OpenAI API defaults                                  |

A model suffix in `openai:agents-api:<model>` takes precedence over `agent.model`. Prompts are sent as literal user input, including prompts that contain JSON.

## Results and lifecycle

The provider returns completed assistant messages marked `final_answer`, with a fallback for messages whose phase is unset. Commentary, tool output, and subagent messages are excluded from the scored answer. An idle session or a completed subagent turn does not establish success.

Response metadata includes `sessionId`, `turnId`, `model`, `toolCalls`, and `sessionDeleted` when cleanup runs. Tool summaries contain IDs, types, names when available, and statuses. Inspect these alongside the final answer: a completed agent turn can still contain failed tool calls.

Token usage comes from the session when available, including subagent work. The beta API reports usage on a best-effort basis; token counts and cost may be absent. Cost is also omitted when subagents are enabled or observed, because aggregate usage does not identify their models and service tiers. Otherwise, cost is an estimate for model tokens only; tools and hosted sandbox charges are additional. Executions are not cached because they can run tools and change remote state.

Sessions are isolated between test cases and repeats. Set `retainSession: true` to inspect successful sessions or download artifacts through the OpenAI API after an eval. You are responsible for deleting retained sessions. Failed and cancelled evals still attempt to delete their sessions. A cleanup failure is reported in response metadata with the session ID for manual recovery.

## Limitations

- Client-side function callbacks and self-hosted executors are not supported. A session requesting client-side actions returns an error; use hosted tools or remote MCP servers.
- This provider polls saved state and items; it does not expose live streaming events or resume existing sessions.
- Hosted artifacts are not downloaded automatically. Retain a successful session if you need its files.

See the [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart) for API prerequisites and the [session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions) for lifecycle details.
