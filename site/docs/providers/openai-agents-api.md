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

| Option                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Default                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `agent_id`                                         | Saved agent ID                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None                                                 |
| `agent`                                            | API agent settings: model, instructions, reasoning, text format, tools, multi-agent settings, and service tier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `model: gpt-6-astra` when no saved agent is selected |
| `environment`                                      | API environment configuration; `none` or `openai_hosted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `{type: none}`                                       |
| `metadata`                                         | Session metadata using the API's string key/value format                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | None                                                 |
| `vault_ids`                                        | Vaults available to the session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | None                                                 |
| `timeoutMs`                                        | Overall request and polling deadline in milliseconds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `300000`                                             |
| `pollIntervalMs`                                   | Delay between status checks in milliseconds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `1000`                                               |
| `usageTimeoutMs`                                   | Time to wait after completion for final session usage; `0` skips the wait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `15000`                                              |
| `cleanupTimeoutMs`                                 | Deadline for cancelling unfinished work and deleting the session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `60000`                                              |
| `retainSession`                                    | Keep successful sessions for later inspection or artifact download                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `false`                                              |
| `maxRetries`                                       | Retries for status reads, turn cancellation, and session deletion after network errors, HTTP 429, and HTTP 500, 502, 503, or 504; session creation is never retried                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `4`                                                  |
| `apiKey`, `apiKeyEnvar`                            | Standard OpenAI credential overrides. Compatible gateways can instead authenticate with a credential header such as `api-key` in `headers`, or with credentials in the base URL's query string, such as `?api-key=`, or userinfo, which is sent as a decoded Basic `Authorization` header. On a host other than `api.openai.com`, an `OPENAI_API_KEY` from the environment is not sent when the base URL has credentials or `headers` contains any custom header, even one whose name does not look like a credential, unless `apiKey` or `apiKeyEnvar` is set. `Accept`, `Content-Type`, `User-Agent`, `OpenAI-Beta`, `OpenAI-Organization`, `OpenAI-Project`, and `X-OpenAI-Originator` are not custom headers for this purpose | `OPENAI_API_KEY`                                     |
| `apiBaseUrl`, `apiHost`, `organization`, `headers` | Standard OpenAI endpoint and header overrides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | OpenAI API defaults                                  |

A model suffix in `openai:agents-api:<model>` takes precedence over `agent.model`. Prompts are sent as literal user input, including prompts that contain JSON.

Per-prompt `config` overrides provider settings at the top level: an `agent` or `environment` object replaces the corresponding provider object. Endpoint and credential settings override as groups: a prompt-level `apiBaseUrl` or `apiHost` replaces both provider endpoint settings, and a prompt-level `apiKey` or `apiKeyEnvar` replaces both provider credential settings. Configuration strings that reference test variables are rendered, such as `agent.instructions: 'Answer as {{role}}'`. Other strings are sent unchanged, so literal braces in commands and code, such as `docker inspect -f '{{.State.Running}}'`, are preserved. Variable values are inserted once and are not interpreted as additional templates.

## Results and lifecycle

The provider returns completed assistant messages marked `final_answer`, with a fallback for messages whose phase is unset. Commentary, tool output, and subagent messages are excluded from the scored answer. An idle session or a completed subagent turn does not establish success.

Response metadata includes `sessionId`, the root `turnId`, `model`, `toolCalls`, and the cleanup status described below. `toolCalls` summarizes the root agent's tool items and, when subagents are enabled or observed, the tool items in each subagent's history. Each summary contains the item's ID, type, name when available, status, and the `turnId` that produced it; subagent items carry their subagent's turn ID, which differs from the root `turnId`. Assistant messages, messages between agents, and reasoning are not included. If subagent histories cannot be read, the answer is still returned and `metadata.subagentToolCallsUnavailable` is `true`. Inspect these alongside the final answer: a completed agent turn can still contain failed tool calls.

Token usage comes from the session's usage totals. OpenAI attaches usage a few seconds after the root turn completes, so the provider waits up to `usageTimeoutMs` before deleting the session. A single-agent session falls back to the root turn's usage when session totals lag behind it. When subagents are enabled or observed, the provider waits the full `usageTimeoutMs` for session totals; if only the root turn's usage is available by then, it reports that usage and sets `metadata.usageFromRootTurn` to `true`. In live multi-agent sessions, session totals equaled the root turn's usage while each subagent turn reported its own usage, and the Agents API guides do not say whether session totals include subagent turns. When subagents ran, the provider therefore keeps the session totals, sets `metadata.usageMayExcludeSubagents` to `true`, and records the summed usage of every subagent turn in `metadata.subagentUsage` without adding it, so no usage is counted twice. `metadata.subagentUsage` is omitted if subagent turns cannot be read or a turn has not reported usage. If usage is still missing, the answer is returned without token counts or cost, and `metadata.usageUnavailable` is `true`. Cost is omitted when subagents are enabled or observed, because aggregate usage does not identify their models and service tiers. Otherwise, cost is an estimate for model tokens only; tools and hosted sandbox charges are additional. Executions are not cached because they can run tools and change remote state.

Sessions are isolated between test cases and repeats. Set `retainSession: true` to inspect successful sessions or download artifacts through the OpenAI API after an eval. You are responsible for deleting retained sessions.

After an error, timeout, cancellation, or request for client-side actions, the provider cancels the active turn before deleting the session. `metadata.sessionCancelled` is `true` when the API accepted the cancellation. The API rejects deletion with HTTP 409 until a session is idle, so deletion is retried until `cleanupTimeoutMs`. `metadata.sessionDeleted` reports the outcome, and `metadata.cleanupError` records any failure alongside `sessionId` for manual cleanup. Error messages redact the API key, credential values from configuration and the base URL, and every value in a configured `headers` map, including remote MCP tool headers, except the non-credential headers listed in the configuration table. Values shorter than eight characters are redacted only where they appear as separate tokens, so longer words that contain them are unchanged. Because API responses can echo credentials, the provider keeps Agents API request and response bodies out of promptfoo's debug request log and logs only each request's method, endpoint, and status.

## Limitations

- Client-side function callbacks and self-hosted executors are not supported. A session requesting client-side actions returns an error; use hosted tools or remote MCP servers.
- This provider polls saved state and items; it does not expose live streaming events or resume existing sessions.
- Hosted artifacts are not downloaded automatically. Retain a successful session if you need its files.

See the [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart) for API prerequisites and the [session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions) for lifecycle details.
