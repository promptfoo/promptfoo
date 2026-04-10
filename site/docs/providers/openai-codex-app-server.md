---
sidebar_position: 42
title: OpenAI Codex App Server
description: Evaluate Codex app-server with streamed agent events, approvals, sandboxing controls, and thread metadata through the Promptfoo JSON-RPC provider guide.
---

# OpenAI Codex App Server

This provider starts `codex app-server` as a local child process and drives the Codex app-server JSON-RPC protocol from promptfoo. Use it when you need to eval the rich client surface of Codex: streamed agent items, approvals, skills, plugins, app connector events, command/file trajectories, and thread lifecycle metadata.

For CI and straightforward automation, prefer the [OpenAI Codex SDK provider](./openai-codex-sdk.md). The app-server protocol is experimental, broader than the SDK, and designed for rich product integrations.

## Provider IDs

```yaml
providers:
  - openai:codex-app-server
  - openai:codex-app-server:gpt-5.4
  - openai:codex-desktop
  - openai:codex-desktop:gpt-5.4
```

`openai:codex-desktop` is an alias for the same app-server protocol. Promptfoo starts its own `codex app-server` process; it does not attach to an already-running Codex Desktop app process.

## Codex SDK vs App Server vs Desktop App

Keep this provider separate from the Codex SDK provider. They share Codex concepts, but they expose different runtime contracts.

| Surface           | Best for                                      | Runtime                                              | Promptfoo provider                                 |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Codex SDK         | CI, automation, simple agentic coding evals   | `@openai/codex-sdk` library                          | [`openai:codex-sdk`](./openai-codex-sdk.md)        |
| Codex app-server  | Rich-client protocol behavior and event evals | Local `codex app-server` child process over JSON-RPC | `openai:codex-app-server` / `openai:codex-desktop` |
| Codex Desktop app | Interactive human work in the desktop product | Native app process and UI                            | Not attached directly                              |

Use this provider when the thing being tested depends on app-server-only behavior such as approval request payloads, streamed item notifications, app connector events, plugin/skill metadata, or thread lifecycle operations. Use the SDK provider when you only need final Codex output, thread reuse, structured output, and traced shell/MCP/search/file steps.

## What Promptfoo Can and Can't Evaluate

| Eval surface                                    | Supported? | Notes                                                                                            |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Final assistant text                            | Yes        | Returned in `response.output` as a string.                                                       |
| Text, image, local image, skill, mention inputs | Yes        | Pass plain text or a JSON array of supported app-server input items.                             |
| JSON schema output                              | Yes        | Pass `output_schema`; assert with `is-json` or parse `output` yourself.                          |
| Token usage and estimated cost                  | Yes        | Token usage is read from `thread/tokenUsage/updated`; cost needs a known model id.               |
| Thread IDs and turn IDs                         | Yes        | Available under `sessionId` and `metadata.codexAppServer`.                                       |
| Approval, permission, MCP, and tool requests    | Yes        | `server_request_policy` gives deterministic responses for non-interactive evals.                 |
| Streamed item metadata                          | Yes        | Command, file, MCP, dynamic tool, web search, reasoning, and agent-message items are normalized. |
| Deep app-server tracing                         | Yes        | Enable `deep_tracing` to inject OTEL env vars into a fresh app-server process per row.           |
| Live partial output in assertions               | No         | Promptfoo receives the final provider response after the turn completes.                         |
| Attaching to an existing Desktop app            | No         | Promptfoo owns a separate app-server child process.                                              |
| WebSocket transport                             | No         | The provider uses stdio; app-server WebSocket mode remains experimental upstream.                |

## Setup

Install the Codex CLI and sign in:

```bash
npm i -g @openai/codex
codex
```

You can also authenticate with an API key:

```bash
export OPENAI_API_KEY=your_api_key_here
```

Promptfoo also accepts `CODEX_API_KEY` or `config.apiKey`. For reproducible evals, prefer API-key-backed runs or set `cli_env.CODEX_HOME` to a fixture home directory that already contains the intended Codex login state.

## Basic Usage

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-app-server:gpt-5.4
    config:
      sandbox_mode: read-only
      approval_policy: never

prompts:
  - 'Review this repository and summarize the highest-risk code paths.'
```

The provider returns Codex's final assistant text as `output`. It also records thread ids, turn ids, item counts, command/file/tool metadata, approval decisions, and token usage under `metadata.codexAppServer`.

## Safety Defaults

The app-server protocol can expose shell, filesystem, config, plugin, MCP, and app connector surfaces. Promptfoo defaults to deterministic eval behavior:

| Option                | Default       |
| --------------------- | ------------- |
| `sandbox_mode`        | `read-only`   |
| `approval_policy`     | `never`       |
| `ephemeral`           | `true`        |
| `thread_cleanup`      | `unsubscribe` |
| `reuse_server`        | `true`        |
| `inherit_process_env` | `false`       |

Approval requests are answered without blocking:

| Request type                            | Default response       |
| --------------------------------------- | ---------------------- |
| `item/commandExecution/requestApproval` | `decline`              |
| `item/fileChange/requestApproval`       | `decline`              |
| `item/permissions/requestApproval`      | empty grant            |
| `item/tool/requestUserInput`            | empty answers          |
| `mcpServer/elicitation/request`         | `decline`              |
| `item/tool/call`                        | failed static response |

Use `accept`, `acceptForSession`, permission grants, or MCP elicitation acceptance only in isolated workspaces where side effects are acceptable.

## Configuration

The provider validates top-level provider config strictly. Prompt-level config is parsed more leniently because promptfoo merges generic test options into `prompt.config`; unrelated keys are ignored there, while invalid values for known Codex fields still return a row-level provider error.

| Parameter                 | Type          | Description                                                                                                                                                         | Default              |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `apiKey`                  | string        | OpenAI API key. Optional when Codex is already signed in.                                                                                                           | Environment variable |
| `base_url`                | string        | Custom OpenAI-compatible base URL. Also passed as `OPENAI_BASE_URL` and `OPENAI_API_BASE_URL`.                                                                      | None                 |
| `working_dir`             | string        | Directory Codex operates in.                                                                                                                                        | Current process dir  |
| `additional_directories`  | string[]      | Additional directories added to workspace-write sandbox roots.                                                                                                      | None                 |
| `skip_git_repo_check`     | boolean       | Skip the default Git repository safety check.                                                                                                                       | `false`              |
| `codex_path_override`     | string        | Path to a specific `codex` binary.                                                                                                                                  | `codex`              |
| `model`                   | string        | Model id, such as `gpt-5.4`. Can also be set in the provider id.                                                                                                    | Codex default        |
| `model_provider`          | string        | App-server model provider override for `thread/start` and `thread/resume`.                                                                                          | None                 |
| `service_tier`            | string        | `fast` or `flex`.                                                                                                                                                   | App-server default   |
| `sandbox_mode`            | string        | `read-only`, `workspace-write`, or `danger-full-access`.                                                                                                            | `read-only`          |
| `sandbox_policy`          | object        | Raw app-server sandbox policy override for `turn/start`.                                                                                                            | Generated from mode  |
| `network_access_enabled`  | boolean       | Adds network access to generated sandbox policies.                                                                                                                  | `false`              |
| `approval_policy`         | string/object | `never`, `on-request`, `on-failure`, `untrusted`, or granular approval policy object.                                                                               | `never`              |
| `approvals_reviewer`      | string        | `user` or `guardian_subagent`.                                                                                                                                      | App-server default   |
| `model_reasoning_effort`  | string        | `none`, `minimal`, `low`, `medium`, `high`, or `xhigh`.                                                                                                             | App-server default   |
| `reasoning_summary`       | string        | `auto`, `concise`, `detailed`, or `none`.                                                                                                                           | App-server default   |
| `personality`             | string        | `none`, `friendly`, or `pragmatic`.                                                                                                                                 | App-server default   |
| `base_instructions`       | string        | Base instructions passed to `thread/start` and `thread/resume`.                                                                                                     | None                 |
| `developer_instructions`  | string        | Developer instructions passed to `thread/start` and `thread/resume`.                                                                                                | None                 |
| `collaboration_mode`      | object        | Experimental collaboration mode passed to `turn/start`.                                                                                                             | None                 |
| `output_schema`           | object        | JSON Schema passed to `turn/start`.                                                                                                                                 | None                 |
| `thread_id`               | string        | Resume an existing Codex thread.                                                                                                                                    | None                 |
| `persist_threads`         | boolean       | Reuse threads across rows with the same prompt template and config.                                                                                                 | `false`              |
| `thread_pool_size`        | number        | Max cached thread count when `persist_threads` is enabled.                                                                                                          | `1`                  |
| `thread_cleanup`          | string        | `unsubscribe`, `archive`, or `none` for non-persistent threads. Resumed `thread_id` rows unsubscribe by default; `archive` is ignored for user-supplied thread IDs. | `unsubscribe`        |
| `ephemeral`               | boolean       | Create ephemeral threads by default.                                                                                                                                | `true`               |
| `experimental_raw_events` | boolean       | Ask app-server to emit raw Responses API items.                                                                                                                     | `false`              |
| `experimental_api`        | boolean       | Opt into experimental app-server protocol fields during `initialize`.                                                                                               | `true`               |
| `include_raw_events`      | boolean       | Include protocol notifications in `raw`.                                                                                                                            | `false`              |
| `cli_config`              | object        | Extra `codex app-server -c key=value` config overrides.                                                                                                             | None                 |
| `cli_env`                 | object        | Extra environment variables for the app-server process.                                                                                                             | Minimal shell env    |
| `inherit_process_env`     | boolean       | Merge the full Node.js environment into the app-server process.                                                                                                     | `false`              |
| `reuse_server`            | boolean       | Reuse the app-server process across rows. Disabled for `deep_tracing`.                                                                                              | `true`               |
| `deep_tracing`            | boolean       | Inject OTEL env vars into a fresh app-server process per call.                                                                                                      | `false`              |
| `request_timeout_ms`      | number        | JSON-RPC request timeout.                                                                                                                                           | `30000`              |
| `startup_timeout_ms`      | number        | `initialize` timeout.                                                                                                                                               | `30000`              |
| `turn_timeout_ms`         | number        | Overall turn timeout.                                                                                                                                               | None                 |
| `server_request_policy`   | object        | Deterministic responses for approvals, user input, MCP elicitations, and dynamic tools.                                                                             | Safe declines        |

### Granular Approval Policy

```yaml
providers:
  - id: openai:codex-app-server:gpt-5.4
    config:
      approval_policy:
        granular:
          sandbox_approval: true
          rules: true
          skill_approval: false
          request_permissions: true
          mcp_elicitations: true
```

### Collaboration Mode

```yaml
providers:
  - id: openai:codex-app-server:gpt-5.4
    config:
      collaboration_mode:
        mode: plan
        settings:
          model: gpt-5.4
          reasoning_effort: none
          developer_instructions: null
```

`collaboration_mode` is experimental and is sent on `turn/start`. App-server may let the selected mode override model, reasoning effort, or developer instructions for the turn.

## Server Request Policy

Configure deterministic responses when you intentionally want app-server approval flows:

```yaml
providers:
  - id: openai:codex-app-server:gpt-5.4
    config:
      sandbox_mode: workspace-write
      approval_policy: on-request
      server_request_policy:
        command_execution: decline
        file_change: decline
        user_input:
          severity: high
        mcp_elicitation:
          action: accept
          content:
            severity: low
          _meta:
            source: promptfoo
        permissions:
          scope: session
          permissions:
            network:
              enabled: true
            fileSystem:
              read:
                - /tmp/fixture
              write: null
        dynamic_tools:
          classify:
            success: true
            text: '{"label":"safe"}'
```

For command execution approvals, `command_execution` may also be an app-server decision object:

```yaml
server_request_policy:
  command_execution:
    applyNetworkPolicyAmendment:
      network_policy_amendment:
        host: registry.npmjs.org
        action: allow
```

Legacy `execCommandApproval` and `applyPatchApproval` callbacks are also handled for older app-server versions. Advanced command decision objects are only supported on the modern `item/commandExecution/requestApproval` flow.

## Structured Output

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-app-server:gpt-5.4
    config:
      sandbox_mode: read-only
      output_schema:
        type: object
        properties:
          summary:
            type: string
          risks:
            type: array
            items:
              type: string
        required: [summary, risks]
        additionalProperties: false

prompts:
  - 'Return a JSON review summary for this repo.'

tests:
  - assert:
      - type: is-json
```

The final app-server response is returned as a string. Use `is-json` or a JavaScript assertion to parse it.

## Prompt Inputs

Plain text prompts work as usual. To include images, skills, or mentions, pass a JSON array:

```json
[
  { "type": "text", "text": "$skill-creator Write a test plan for this provider." },
  { "type": "image", "url": "https://example.com/screenshot.png" },
  { "type": "local_image", "path": "/Users/me/screenshots/failure.png" },
  {
    "type": "skill",
    "name": "skill-creator",
    "path": "/Users/me/.codex/skills/skill-creator/SKILL.md"
  },
  {
    "type": "mention",
    "name": "workspace",
    "path": "app://connector/resource"
  }
]
```

Supported input item types are `text`, `image`, `local_image`, `localImage`, `skill`, and `mention`.

## Metadata

The provider records app-server details for assertions and debugging:

```js
providerResponse.metadata.codexAppServer.threadId;
providerResponse.metadata.codexAppServer.turnId;
providerResponse.metadata.codexAppServer.itemCounts;
providerResponse.metadata.codexAppServer.items;
providerResponse.metadata.codexAppServer.serverRequests;
```

Command output, tool arguments, and approval metadata are sanitized before they are placed in metadata or tracing attributes.

## Tracing

Promptfoo wraps each provider call in a GenAI span. The app-server provider also creates item-level spans for completed command, file, MCP, dynamic tool, reasoning, search, and agent-message items.

Enable deeper app-server tracing by setting `deep_tracing: true` with Promptfoo's OpenTelemetry tracing enabled. Deep tracing starts a fresh app-server process for each row so the child process can receive the active trace context. Reusable app-server process and persistent thread pooling are disabled in this mode; explicit `thread_id` resumes are still serialized so parallel rows do not overlap turns on the same Codex thread.

## Local Verification

Run from the repository root:

```bash
npm run local -- eval -c examples/openai-codex-app-server/promptfooconfig.yaml --no-cache
```

Use `--env-file .env` if your API key is stored there.

To validate the provider against your installed Codex CLI schema:

```bash
codex app-server generate-ts --out /tmp/codex-app-server-schema/ts
codex app-server generate-json-schema --out /tmp/codex-app-server-schema/json
```
