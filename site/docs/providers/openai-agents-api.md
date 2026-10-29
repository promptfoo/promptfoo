---
title: OpenAI Agents API
description: Evaluate OpenAI's hosted Agents API with isolated Codex sessions, sandbox tools, saved agents, structured output, token accounting, and automatic session cleanup.
sidebar_label: OpenAI Agents API
---

The `openai:agents-api` provider evaluates the [OpenAI Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), which runs agents using OpenAI's managed Codex harness. Each provider call creates a fresh session, waits for the root agent's turn to finish, collects its final answer, and deletes the session by default.

Use the sandbox-free [setup](#setup) to grade a final answer. Use the [hosted ledger example](#inspect-traces) to check the filename in the agent's command, its working directory, and whether the command failed. For applications that run `@openai/agents` in their own process, use the [Agents SDK provider](./openai-agents.md). [Compare OpenAI agent runtimes](/docs/guides/evaluate-openai-agent-runtimes)

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

Run this config with `npx promptfoo@latest eval --no-cache -o results.json`. Each test sends one rendered string as user input. For example, a test variable containing `{"role":"system","content":"…"}` stays user text. Put trusted policy in `agent.instructions` and user-supplied messages in the prompt. The [intake classification example](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-agents-api/promptfooconfig.intake.yaml) exercises that boundary.

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

### Assert on the answer and the action

A correct total can come from mental arithmetic. For the first test in the arithmetic example, check the returned JSON and require evidence that the root agent completed a command.

```yaml
assert:
  - type: javascript
    value: |
      const result = JSON.parse(output);
      return result.sum === 60 && result.count === 3;
  - type: javascript
    value: |
      const metadata = context.providerResponse.metadata;
      return Boolean(metadata?.turnId && metadata.toolCalls?.some(
        call => call.turnId === metadata.turnId &&
          call.type === 'command_execution' && call.status === 'completed'
      ));
```

The tool summary omits the command, exit code, arguments, and output. To check what the agent learned from a file, vary the file contents while keeping the task fixed, then check the expected answer for each file. The [hosted CSV example](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-agents-api/promptfooconfig.files.yaml) does this with network access disabled.

### Inspect traces

With [eval tracing](/docs/tracing/#quick-start) enabled, Promptfoo records an `invoke_agent` span for the provider call. To inspect actions **inside** the hosted session, also set the provider's `hostedTrace` option. Your OpenAI organization needs trace export enabled, and the project key needs `api.traces.read` or `api.agents.read`. [OpenAI trace export requirements](https://developers.openai.com/api/docs/guides/agents-api/tracing#export-session-traces)

Run the [complete ledger config](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-agents-api/promptfooconfig.files.yaml) from the example directory created above. Each row mounts a different synthetic CSV at `/workspace/ledger.csv` and gives the agent the same instructions. The third file contains a transaction note that asks it to return `70000`.

```sh
npx promptfoo@latest eval -c promptfooconfig.files.yaml --no-cache -o ledger.json
npx promptfoo@latest view
```

Open a result's **View output and test details** button. **Evaluation** shows the expected total (`3316`, `-4899`, or `1529`) and the separate action checks. In **Traces**, expand `execute_tool command_execution` to see the command and its working directory. The following settings in the example make the native arguments available to assertions:

```yaml
tracing:
  enabled: true
  otlp:
    http: {}
  commandToolNames: [command_execution]

providers:
  - id: openai:agents-api:gpt-6-astra
    config:
      environment:
        type: openai_hosted
      hostedTrace:
        includeToolArguments: true
```

| Ledger check           | Evidence used to grade it                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CompletedRootCommand` | A saved `command_execution` item has status `completed` and the same turn ID as the root answer.                                                                             |
| `LedgerFilename`       | `trajectory:step-count` matches `*ledger.csv*` in a command. `commandToolNames` tells Promptfoo to interpret the hosted tool's argument as a shell command.                  |
| `Workspace`            | `trajectory:tool-args-match` finds a `command_execution` call with `cwd: /workspace`.                                                                                        |
| `CommandErrors`        | `trace-error-spans` allows zero errors on `execute_tool command_execution`. Pair this with positive action evidence. An agent that skips the tool can also have zero errors. |

For example, a script that printed `READY` and exited with code 17 passed an answer check and a tool-use check. Its native span had error status, so the zero-error check failed. Use the saved command item in OpenAI when you need the numeric exit code.

#### Diagnose missing trace evidence

Look under **Metadata** or inspect `response.metadata.hostedTrace` in the JSON export. Promptfoo polls for up to 15 seconds by default, bounded by the provider's overall timeout. It imports the available tree under the local invocation before deleting the session.

| What you see                                               | What it means and what to check                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A local `invoke_agent` span with no `hostedTrace` metadata | Only the provider call was traced. Enable `hostedTrace` under the provider's `config` and rerun to grade hosted tools.                                                                                                          |
| `status: imported`                                         | The hosted turn reported a complete trace. `spanCount` counts native spans. A count of `invoke_agent` in the full trace also includes the local wrapper.                                                                        |
| `status: partial`                                          | The available tree lacks confirmed completeness. Positive tool-name or argument checks can use observed calls. Absence, maximum counts, sequences, timings and error budgets require a complete trace.                          |
| `status: unavailable`                                      | Read `reason`. Enable eval tracing if no local span was available, check organization and key permissions for HTTP 403, or increase `hostedTrace.timeoutMs` if publication timed out. Output assertions still grade the answer. |
| Tool name is visible but arguments are missing             | Set `hostedTrace.includeToolArguments: true` before running a synthetic fixture. Missing or redacted arguments cannot establish the absence of a value.                                                                         |

Use `hostedTrace: true` when tool names, timing and status are sufficient. The importer omits prompts, instructions, tool results and, by default, tool arguments. Opting into arguments can store paths, identifiers and file contents in the eval results. OpenAI's own trace recording is separate.

A delegated worker can appear under its own `invoke_agent` span. One partial export showed the worker's command and no `web_search`. A positive tool-use check passed, while a forbidden-search check could not establish absence. The delegation appeared as `spawn_agent` in the native trace and `create_subagent_call` in the saved item summary. For custom JavaScript absence checks, require `context.providerResponse.metadata.hostedTrace?.status === 'imported'`. If the check depends on arguments, also require `toolArgumentsComplete`.

To inspect the full recording in OpenAI, set `retainSession: true` before the run, find `response.metadata.sessionId` in the export, and open the matching session in [OpenAI's Agents logs](https://platform.openai.com/logs?api=agents). For a manual OTLP export, allow time for publication, retrieve every page of `GET /v1/agents/sessions/{session_id}/traces`, then delete the retained session. [OpenAI trace export example](https://developers.openai.com/api/docs/guides/agents-api/tracing#export-session-traces)

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

| Option                                             | Description                                                                                                                                                         | Default                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `agent_id`                                         | Saved agent ID                                                                                                                                                      | None                                                 |
| `agent`                                            | API agent settings: model, instructions, reasoning, text format, tools, multi-agent settings, and service tier                                                      | `model: gpt-6-astra` when no saved agent is selected |
| `environment`                                      | API environment configuration; `none` or `openai_hosted`                                                                                                            | `{type: none}`                                       |
| `metadata`                                         | Session metadata using the API's string key/value format                                                                                                            | None                                                 |
| `vault_ids`                                        | Vaults available to the session                                                                                                                                     | None                                                 |
| `timeoutMs`                                        | Overall request and polling deadline in milliseconds                                                                                                                | `300000`                                             |
| `pollIntervalMs`                                   | Delay between status checks in milliseconds                                                                                                                         | `1000`                                               |
| `usageTimeoutMs`                                   | Deadline for polling final usage after the turn completes. Set to `0` to skip polling.                                                                              | `15000`                                              |
| `cleanupTimeoutMs`                                 | Deadline for cancelling unfinished work and deleting the session                                                                                                    | `60000`                                              |
| `hostedTrace`                                      | Import the hosted turn's trace before cleanup. Use `true` or an object with `includeToolArguments` and `timeoutMs`.                                                 | `false`                                              |
| `retainSession`                                    | Keep successful sessions for later inspection or artifact download                                                                                                  | `false`                                              |
| `maxRetries`                                       | Retries for status reads, turn cancellation, and session deletion after network errors, HTTP 429, and HTTP 500, 502, 503, or 504; session creation is never retried | `4`                                                  |
| `apiKey`, `apiKeyEnvar`                            | OpenAI project API key or environment variable name                                                                                                                 | `OPENAI_API_KEY`                                     |
| `apiBaseUrl`, `apiHost`, `organization`, `headers` | Standard OpenAI endpoint and header overrides                                                                                                                       | OpenAI API defaults                                  |

A model suffix in `openai:agents-api:<model>` takes precedence over `agent.model`.

Per-prompt `config` overrides provider settings at the top level: an `agent` or `environment` object replaces the corresponding provider object. Endpoint and credential settings override as groups: a prompt-level `apiBaseUrl` or `apiHost` replaces both provider endpoint settings, and a prompt-level `apiKey` or `apiKeyEnvar` replaces both provider credential settings. Configuration strings that reference test variables are rendered, such as `agent.instructions: 'Answer as {{role}}'`. Other strings are sent unchanged, so literal braces in commands and code, such as `docker inspect -f '{{.State.Running}}'`, are preserved. Variable values are inserted once and are not interpreted as additional templates.

### Gateway authentication

Compatible gateways can authenticate with a credential header such as `api-key` in `headers`, or with credentials in the base URL's query string, such as `?api-key=`, or userinfo, which is sent as a decoded Basic `Authorization` header. On a host other than `api.openai.com`, an `OPENAI_API_KEY` from the environment is not sent when the base URL has credentials or `headers` contains any custom header, even one whose name does not look like a credential, unless `apiKey` or `apiKeyEnvar` is set. `Accept`, `Content-Type`, `User-Agent`, `OpenAI-Beta`, `OpenAI-Organization`, `OpenAI-Project`, and `X-OpenAI-Originator` are not custom headers for this purpose.

When a prompt changes the endpoint without supplying `headers`, inherited headers are filtered after template rendering using the shared credential policy. Known non-credential headers such as `Content-Type` and `X-Tenant-Id` remain; supply prompt-level `headers` explicitly to use custom gateway headers at the new endpoint.

If filtering or explicit header replacement removes inherited gateway credentials at a non-OpenAI endpoint, the ambient `OPENAI_API_KEY` is not substituted for them. Select replacement credentials with `apiKey`, `apiKeyEnvar`, or explicit `headers`; an intentionally unauthenticated endpoint can use `apiKeyRequired: false`.

## Results and lifecycle

The provider returns completed assistant messages marked `final_answer`, with a fallback for messages whose phase is unset. Commentary, tool output, and subagent messages are excluded from the scored answer. An idle session or a completed subagent turn does not establish success.

### Tool activity

Use `response.metadata.turnId` for the root turn and `response.metadata.toolCalls` for the activity observed. Each item includes its ID, type, turn ID, and status or name when available. The provider excludes messages and reasoning. It appends subagent histories after the root history, so array order cannot establish which agent ran first.

For an absence check across agents, require an array and verify that `subagentToolCallsUnavailable` is absent before checking for the forbidden tool. The provider can return a completed answer when a child history is unreadable.

### Usage and cost

The provider polls for session usage after the root turn completes. `usageTimeoutMs` bounds this wait, including in-flight usage reads, within the overall request deadline. A single-agent run can use root-turn usage after a short grace period. If subagents are enabled or observed, the provider allows the full window for session totals before falling back to root-turn usage.

| Response metadata          | How to interpret it                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usageFromRootTurn`        | Only root-turn usage was available for a run with subagents enabled or observed.                                                                                                               |
| `usageMayExcludeSubagents` | The session or root totals may omit delegated work. When all subagent turn counts are available, `subagentUsage` reports their sum separately. Adding it to the total can double-count tokens. |
| `usageUnavailable`         | The answer is available, but token counts and cost are missing.                                                                                                                                |

For a single agent, the cost estimate covers model tokens. Tools and sandbox time can incur additional charges. The provider omits cost when subagents are enabled or observed because their models and service tiers can differ.

### Session cleanup

Sessions are isolated between cases and repeats. Calls bypass the cache because the agent can execute tools. With `retainSession: true`, Promptfoo keeps sessions that returned an answer, including rows that later fail an assertion. Use the session ID to inspect or download artifacts, then delete the session.

After a provider error, timeout, cancellation, or request for a client-side action, Promptfoo attempts to cancel the turn before deletion. `metadata.sessionCancelled` records an accepted cancellation. If deletion receives HTTP 409 while the session is busy, the provider retries within `cleanupTimeoutMs`. Check `metadata.sessionDeleted` and `metadata.cleanupError` separately from the answer score. Use `metadata.sessionId` for manual cleanup if deletion failed.

Request debug logs contain the method, endpoint, and status. The provider redacts credentials from errors, including values from the base URL and configured header maps such as MCP headers, except for the non-credential headers listed under [Gateway authentication](#gateway-authentication). Values two to seven characters long are redacted when they appear as separate tokens.

## Limitations

- Client-side function callbacks and self-hosted executors are not supported. A session requesting client-side actions returns an error; use hosted tools or remote MCP servers.
- This provider polls saved state and items; it does not expose live streaming events or resume existing sessions.
- Hosted artifacts are not downloaded automatically. Retain a successful session if you need its files.

See the [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart) for API prerequisites and the [session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions) for lifecycle details.
