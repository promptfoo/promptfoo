---
title: OpenAI Agents API
description: Evaluate OpenAI's hosted Agents API with isolated Codex sessions, sandbox tools, saved agents, structured output, token accounting, and automatic session cleanup.
sidebar_label: OpenAI Agents API
---

The `openai:agents-api` provider evaluates the [OpenAI Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), which runs agents using OpenAI's managed Codex harness. Each provider call creates a fresh session, waits for the root agent's turn to finish, collects its final answer, and deletes the session by default.

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

Run this config with `npx promptfoo@latest eval --no-cache -o results.json`. Each test sends one rendered string as user input. For example, a test variable containing `{"role":"system","content":"…"}` stays user text. Put trusted policy in `agent.instructions` and user-supplied messages in the prompt.

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

The tool summary omits the command, exit code, arguments, and output. To check what the agent learned from a file, vary the file contents while keeping the task fixed, then check the expected answer for each file.

### Inspect traces

With [eval tracing](/docs/tracing/#quick-start) enabled, Promptfoo records an `invoke_agent` span for the provider call. To inspect actions **inside** the hosted session, also set the provider's `hostedTrace` option. Your OpenAI organization needs trace export enabled, and the project key needs `api.traces.read` or `api.agents.read`. [OpenAI trace export requirements](https://developers.openai.com/api/docs/guides/agents-api/tracing#export-session-traces)

In your eval configuration, enable the local trace exporter and turn on hosted trace collection for the provider.

```yaml
tracing:
  enabled: true
  otlp:
    http: {}

providers:
  - id: openai:agents-api:gpt-6-astra
    config:
      hostedTrace: true
```

Open a result’s **View output and test details** button, then select **Traces** to inspect the tools called during the hosted turn.

#### Diagnose missing trace evidence

Look under **Metadata** or inspect `response.metadata.hostedTrace` in the JSON export. Import needs local export enabled for both the eval and its running tracing SDK. Setting `PROMPTFOO_OTEL_LOCAL_EXPORT=false` skips the hosted download. Overlapping evals in one process share the first active tracing SDK. If it has only an external exporter, run the hosted eval after the others finish, or use a separate process.

| What you see                                               | What it means and what to check                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A local `invoke_agent` span with no `hostedTrace` metadata | Enable the provider’s `hostedTrace` setting to see remote tool calls.                                                                                                                                                           |
| `status: imported`                                         | The hosted turn reported a complete trace. `spanCount` counts native spans. A count of `invoke_agent` in the full trace also includes the local wrapper.                                                                        |
| `status: partial`                                          | The available spans show observed actions. Other actions may be missing.                                                                                                                                                        |
| `status: unavailable`                                      | Read `reason`. Enable eval tracing if no local span was available, check organization and key permissions for HTTP 403, or increase `hostedTrace.timeoutMs` if publication timed out. Output assertions still grade the answer. |

Promptfoo waits for a connected span tree, retrying unpublished parents for up to 15 seconds by default within the provider timeout. A complete trace uses the remaining time for local storage. A validated partial tree gets one final write of up to 250 ms, capped by the configured timeouts. If SQLite reaches the deadline before committing, Promptfoo rolls back the write. If the commit succeeds and returns late, the spans remain available and `hostedTrace.storageDeadlineExceeded` is `true`. The completed answer still grades.

Use `hostedTrace: true` when tool names, timing and status are sufficient. The importer omits prompts, instructions and tool results.

To inspect the full recording in OpenAI, set `retainSession: true` before the run, find `response.metadata.sessionId` in the export, and open the matching session in [OpenAI's Agents logs](https://platform.openai.com/logs?api=agents). For a manual OTLP export, allow time for publication, retrieve every page of `GET /v1/agents/sessions/{session_id}/traces`, then delete the retained session. [OpenAI trace export example](https://developers.openai.com/api/docs/guides/agents-api/tracing#export-session-traces)

#### Captured tool arguments

With `hostedTrace.includeToolArguments: true`, Promptfoo can retain the following fields of a top-level tool argument object. Paths and identifiers can contain sensitive data. Use synthetic fixtures when enabling capture.

| Field                                  | Accepted value                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `cmd`, `command`, `commands`           | A file-inspection command string or argv array for `cmd` or `command`. For `commands`, a nonempty list of file-inspection command strings. |
| `cwd`, `path`, `file_path`, `filename` | A literal path up to 1,024 characters, using letters, numbers, underscores, dots, slashes or hyphens, without a leading hyphen.            |
| `id`, `order_id`                       | A JavaScript safe integer or a string of 1–32 decimal digits.                                                                              |
| `count`, `limit`, `offset`, `page`     | A JavaScript safe integer.                                                                                                                 |

Accepted commands are simple invocations of `pwd`, `ls`, `cat`, `wc`, `head`, and `tail` with plain paths and short options such as `wc -l` or `head -n 5`. Simple `sh` and `bash` wrappers also qualify, for example `/bin/bash -lc 'cat /workspace/ledger.csv'`. A Python script, pipeline, or command containing redirection is omitted. The same call can still supply `cwd: /workspace`.
Other fields, including free text and nested objects, are omitted. For example, if `lookup_order` receives `{"order_id":"417","note":"rush"}`, the trace can retain `order_id`. If a value protected by `tracing.otlp.http.redactAttributes` also appears in a tool or model name, the trace becomes unavailable. An argument containing a protected value can be omitted on its own. Malformed JSON, duplicate keys, or an oversized payload can leave a span without argument evidence.

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
| `hostedTrace`                                      | Download the hosted turn's trace before cleanup. Use `true` or an object with `includeToolArguments` and `timeoutMs`.                                               | `false`                                              |
| `artifactPaths`                                    | Collect digests for up to eight exact output paths published by the root turn. See [Published artifacts](#published-artifacts).                                     | None                                                 |
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

### Published artifacts

For a file deliverable, ask the agent to write to a known path under `/workspace/outputs/` in an `openai_hosted` environment. Add the same path to the provider’s `config.artifactPaths` list. Promptfoo looks up each published file by its path and the completed root turn ID, downloads its bytes using the session’s credentials, and computes a SHA-256 digest before session cleanup. The digest can be graded after the session is deleted. [OpenAI’s files and artifacts guide](https://developers.openai.com/api/docs/guides/agents-api/environments/files)

To select a different file in each row, set `artifactPaths: ['{{outputPath}}']` and give each test an `outputPath` variable. Before starting the session, Promptfoo checks that the rendered list contains at most eight unique file paths under `/workspace/outputs/`.

Each entry in `response.metadata.artifacts` has a `path` and `status`. An `available` entry includes `sha256` and `sizeBytes`. A `missing` entry means the listing establishes that the root turn did not publish that path. An `unavailable` entry means the file could not be verified. Examples include a listing with a duplicate artifact ID or an entry with ambiguous session or turn ownership. Promptfoo reads up to 1 MiB per file and allows 10 seconds for all artifact reads combined, within the overall request deadline.

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
- Promptfoo saves artifact digests in the eval result. To keep the file contents, set `retainSession: true`, download the files, and delete the session.

See the [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart) for API prerequisites and the [session guide](https://developers.openai.com/api/docs/guides/agents-api/sessions) for lifecycle details.
