---
sidebar_position: 41
title: OpenAI Codex SDK
description: 'Evaluate local Codex coding agents with Promptfoo. Set up authentication, control workspace access, test structured output and skills, and trace agent runs.'
---

import Link from '@docusaurus/Link';

# OpenAI Codex SDK

Use `openai:codex-sdk` to evaluate Codex's final answers and tool activity. It runs the local Codex CLI through OpenAI's [TypeScript SDK](https://developers.openai.com/codex/sdk/).

For direct model API calls, use the [OpenAI provider](/docs/providers/openai).

<Link id="quick-start" />

## Quickstart

<Link id="installation" />

### Install

Use Node.js 22.22.0 or later. In your eval project, install Promptfoo and the SDK:

```bash
npm install --save-dev promptfoo @openai/codex-sdk@^0.153.2
```

The SDK includes the Codex CLI. Install it explicitly if your Promptfoo installation omits optional dependencies.

<Link id="setup" />
<Link id="option-1-use-your-chatgpt-login" />
<Link id="option-2-use-an-api-key" />

### Authenticate

Choose one authentication method:

- **ChatGPT sign-in:** run `npx codex login` and complete the browser flow. Leave `config.apiKey`, `OPENAI_API_KEY`, and `CODEX_API_KEY` unset to reuse that login.
- **API key:** set `OPENAI_API_KEY` in your shell or secret manager. `CODEX_API_KEY` is also supported. API usage is billed separately from ChatGPT subscriptions.

For custom Codex homes, CI, and AWS credentials, see [authentication and environment](#authentication-and-environment). OpenAI's [authentication guide](https://learn.chatgpt.com/docs/auth) covers account access and login storage.

<Link id="basic-usage" />

### Run your first eval

Save this config in your eval project. It asks for code in the final answer, with workspace writes and web search disabled:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a Python factorial function. Return only the code.'

providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      sandbox_mode: read-only
      approval_policy: never
      web_search_mode: disabled
      skip_git_repo_check: true

tests:
  - assert:
      - type: contains
        value: 'def factorial('
```

Run it and save the results:

```bash
npx promptfoo eval -c promptfooconfig.yaml --no-cache -o results.json
```

The assertion checks the final text. It does not execute the generated Python or verify that a file was created. For tasks that edit a repository, also check the resulting files or run the project's tests.

<Link id="provider-ids" />
<Link id="with-custom-model" />
<Link id="models" />
<Link id="mini-models" />
<Link id="model-reasoning-effort" />

## Provider IDs and models

These IDs select the same provider:

| ID                               | Model selection                               |
| -------------------------------- | --------------------------------------------- |
| `openai:codex-sdk`               | `config.model`, or Codex's configured default |
| `openai:codex-sdk:gpt-5.6-terra` | Model in the ID                               |
| `openai:codex:gpt-5.6-terra`     | Short alias for the same provider and model   |

A model in the ID takes precedence over `config.model`. To compare models, add one provider entry per model.

Choose a model your account can access from [OpenAI's Codex model guide](https://learn.chatgpt.com/docs/models). Use a concrete model such as `gpt-5.6-terra` for repeatable comparisons. Omitting it lets Codex choose from its configuration, so results can change when that configuration or its defaults change. GPT-6 Astra requires Codex 0.153.1 or later; the installation above includes a compatible runtime.

Set reasoning effort when you need to compare speed and answer quality:

```yaml
providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      sandbox_mode: read-only
      approval_policy: never
      model_reasoning_effort: high
```

Promptfoo accepts `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. The selected model and Codex runtime determine which levels work. `ultra` is a Codex setting that uses subagents, not a Responses API reasoning value. Check model availability and reasoning support when migrating older saved configs instead of reusing a retired model's settings.

<Link id="with-working-directory" />
<Link id="skipping-git-check" />
<Link id="git-repository-requirement" />
<Link id="multi-file-code-review" />

## Work with repository files

Set `working_dir` to the repository you want Codex to inspect or edit:

```yaml
providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      working_dir: ./sample-project
      sandbox_mode: read-only
      approval_policy: never
      web_search_mode: disabled
```

`working_dir` must already exist. Relative paths resolve from the config file's directory. If you omit it, Codex works in the directory where you launched Promptfoo. By default, that directory must be inside a Git repository; `skip_git_repo_check: true` skips only this check.

<Link id="sandbox-modes" />
<Link id="approval-policies" />
<Link id="sandbox-mode" />
<Link id="additional-directories" />

### Sandbox and approvals

Set permissions explicitly for repeatable evals. Promptfoo leaves unset sandbox and approval options to Codex's configuration and runtime defaults.

| `sandbox_mode`       | Command access                                                          |
| -------------------- | ----------------------------------------------------------------------- |
| `read-only`          | Read files without editing the workspace                                |
| `workspace-write`    | Read files and write within the workspace and configured writable roots |
| `danger-full-access` | Run commands without Codex's filesystem or network sandbox              |

Use `approval_policy: never` for unattended evals. Codex must work within the configured permissions and cannot ask you to approve an escalation. This setting does not grant extra access.

For editing tasks, use `workspace-write` with a disposable checkout. It can also allow writes to temporary directories; it is not a restriction to one exact folder. `additional_directories` adds writable roots in this mode, rather than limiting which files Codex can read:

```yaml
providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      working_dir: ./sample-project
      additional_directories:
        - ./shared-fixtures
      sandbox_mode: workspace-write
      approval_policy: never
      network_access_enabled: false
      web_search_mode: disabled
```

Both paths above resolve from the config file's directory. Codex's [sandbox and approval guide](https://learn.chatgpt.com/docs/agent-approvals-security) describes platform support and protected paths within writable roots.

### Keep test cases independent

A fresh thread resets conversation history, but it does not reset files. Tests that share a writable directory can change each other's inputs, including when they run concurrently.

Prepare a separate fixture directory for each independent editing test, then select it with a test variable:

```yaml
providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      working_dir: '{{workspaceDir}}'
      sandbox_mode: workspace-write
      approval_policy: never
      network_access_enabled: false
      web_search_mode: disabled
```

Create those directories before the eval and restore them before repeating it. For reproducible CI, also pin the SDK version, model, repository revision, and Codex configuration. A dedicated [Codex home](#authentication-and-environment) helps control user-level configuration and skills.

### Web search and network access

Web search and command network access are separate settings:

```yaml
providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      sandbox_mode: workspace-write
      approval_policy: never
      network_access_enabled: false
      web_search_mode: cached
```

- `web_search_mode`: `disabled`, `cached` for pre-indexed results, or `live` for live search.
- `network_access_enabled`: controls outbound access for commands in the `workspace-write` sandbox. It does not control model API requests, MCP connections, or the web search tool.

If omitted, these settings come from Codex. In particular, web search is not necessarily disabled. `network_access_enabled: false` does not restore sandbox restrictions when using `danger-full-access`.

## Inputs and structured output

### Text and local images

Plain text prompts work as usual. To attach a local image, use a prompt containing a JSON array of Codex input items:

```yaml
prompts:
  - |-
    [
      {"type": "text", "text": "Describe the layout in this screenshot."},
      {"type": "local_image", "path": "/absolute/path/to/screenshot.png"}
    ]
```

Replace the image path with an existing file. Use absolute image paths to avoid ambiguity; Promptfoo does not resolve them relative to the config file. Only `text` and `local_image` items with the fields shown above are recognized. Other JSON shapes, including Chat Completions message arrays and remote image URLs, are passed as plain prompt text.

<Link id="zod-schemas" />
<Link id="structured-bug-report-generation" />

### Structured output

Set `output_schema` to a JSON Schema object. The final response remains a string, so parse it in JavaScript assertions:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Describe a Python function named factorial that takes an integer n.'

providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      sandbox_mode: read-only
      approval_policy: never
      web_search_mode: disabled
      skip_git_repo_check: true
      output_schema:
        type: object
        properties:
          function_name:
            type: string
          parameters:
            type: array
            items:
              type: string
        required: [function_name, parameters]
        additionalProperties: false

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: JSON.parse(output).function_name === 'factorial'
```

Pass the schema object itself, not an `output_schema: file://...` string or a Zod instance. To author schemas with Zod, convert them to JSON Schema before supplying the config.

<Link id="ephemeral-threads-default" />

## Thread management

By default, each provider call starts a new conversation. Codex can still save its session history under `CODEX_HOME` (normally `~/.codex/sessions`); Promptfoo does not delete those files or request Codex's ephemeral mode.

<Link id="thread-based-conversations" />

### Persistent threads

Set `persist_threads: true` to continue a conversation across test cases that use the same prompt template and configuration. For ordered turns, run the tests serially:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - '{{request}}'

providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      sandbox_mode: read-only
      approval_policy: never
      web_search_mode: disabled
      skip_git_repo_check: true
      persist_threads: true

defaultTest:
  options:
    runSerially: true

tests:
  - vars:
      request: 'Remember BLUE-OTTER-19. Reply with exactly STORED.'
    assert:
      - type: equals
        value: STORED
  - vars:
      request: 'Return the marker I asked you to remember. Return nothing else.'
    assert:
      - type: equals
        value: BLUE-OTTER-19
```

These rows share a thread because they use the same `{{request}}` template. Changing only its rendered variables does not create a separate conversation. Changing the working directory, model, schema, permissions, environment, or other thread-affecting configuration creates a different pool entry.

`thread_pool_size` limits the number of pooled threads retained by this provider instance (default: `1`). The oldest entry is evicted when the pool is full. It does not set eval concurrency. Calls to the same retained thread are serialized, while different threads can run in parallel. Pools do not carry over to a new Promptfoo process.

<Link id="thread-resumption" />

### Resume a saved thread

Use the `sessionId` from a previous provider response as `thread_id`. The same Codex home must still have that session:

```yaml
providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      thread_id: '<session-id>'
      sandbox_mode: read-only
      approval_policy: never
```

An explicit `thread_id` resumes that conversation even without `persist_threads`. Set `persist_threads: true` as well to retain the resumed SDK thread object between calls.

### Caching behavior

This provider does not cache final responses. Each call runs a Codex turn. Thread pooling reuses conversation history; `--no-cache` and `options.bustCache` do not reset that history or your working directory. To start independent conversations, leave `persist_threads` disabled and omit `thread_id`.

Cached input tokens reported by Codex are model-side prompt caching, which can reduce token cost on later turns. History can still increase the input token count.

<Link id="skills" />

## Test skills

Point `working_dir` at a repository containing [Codex skills](https://learn.chatgpt.com/docs/build-skills), such as `.agents/skills/<name>/SKILL.md`. No Promptfoo skill toggle is required. Add both an output assertion and a `skill-used` assertion:

```yaml
tests:
  - assert:
      - type: equals
        value: CERULEAN-FALCON-SKILL
      - type: skill-used
        value: token-skill
```

The [skills example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/skills) includes the `token-skill` fixture and complete configs. See [Test agent skills](/docs/guides/test-agent-skills) for how to compare skill versions.

`skill-used` checks `response.metadata.skillCalls`. For Codex, this is inferred from successful commands that directly reference a `SKILL.md` file in a recognized skill directory. It does not prove that Codex followed the instructions. Wildcards and directory listings do not count, and a skill used without a detected file read may be missed.

<details>
<summary>Skill metadata and tracing</summary>

Each `skillCalls` entry contains `name`, `path`, and `source: heuristic`. `attemptedSkillCalls` can also appear when candidate reads were not all successful; retried paths can occur in both lists.

Recognized paths include skill directories within the active repository, the configured `CODEX_HOME/skills`, the default user Codex home, and `/etc/codex/skills`. Absolute repository skill paths outside the active repository are ignored.

With streaming enabled, detected skill reads add `promptfoo.skill.*` attributes to command spans. Use [trajectory assertions](/docs/configuration/expected-outputs/deterministic#trajectorytool-used) to check the commands or MCP calls made while following the skill.

</details>

<Link id="streaming" />
<Link id="tracing-and-observability" />
<Link id="streaming-mode-tracing" />
<Link id="viewing-traces" />

## Tracing

Set `enable_streaming: true` to capture SDK events such as commands, file changes, web searches, MCP calls, and messages as spans. Enable tracing at the config root:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      acceptFormats: [json]

providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      sandbox_mode: read-only
      approval_policy: never
      enable_streaming: true
```

Merge this into an eval config with prompts and tests. Inspect the resulting trace using [Promptfoo tracing](/docs/tracing). Assertions still receive the final answer after the turn finishes; this option does not stream partial tokens to assertions.

`gen_ai.turn` spans and `gen_ai.turn.index` attributes identify SDK turns. One SDK turn can contain multiple model requests and tool calls, so these markers do not count internal LLM round trips.

<Link id="deep-tracing" />

<details>
<summary>Deep tracing and Codex logs</summary>

Add `deep_tracing: true` to the provider config to propagate trace context into the Codex CLI and collect its native spans. Promptfoo configures the trace exporter for the active OTLP receiver unless you provide an exporter override. HTTP JSON, HTTP protobuf, and gRPC are supported.

**Deep tracing uses a fresh client and thread on every call.** It ignores `persist_threads`, `thread_id`, and `thread_pool_size`. Use streaming traces without deep tracing when evaluating conversation continuity.

Codex log export is separate. To send logs to Promptfoo's JSON receiver, add this to the Codex home's `config.toml`:

```toml
[otel]
log_user_prompt = false
exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }
```

The log endpoint needs the full `/v1/logs` path. If you set `cli_env.CODEX_HOME`, put the config in that home.

Promptfoo applies best-effort redaction to text on spans it creates from SDK events. Native Codex spans and logs are outside that sanitizer. Review trace content before sharing it.

</details>

<Link id="custom-environment-variables" />

## Authentication and environment

For OpenAI requests, API-key precedence is `config.apiKey`, Promptfoo `env.OPENAI_API_KEY`, Promptfoo `env.CODEX_API_KEY`, process `OPENAI_API_KEY`, then process `CODEX_API_KEY`. The resolved key overrides API-key entries in `cli_env`. With no resolved key, authentication comes from `cli_env` or Codex's login state.

The Codex subprocess receives a minimal environment with OS basics such as `PATH`, `HOME`, temporary-directory variables, and locale settings, plus resolved provider credentials. Pass other required variables explicitly in `cli_env`:

```yaml
providers:
  - id: openai:codex-sdk:gpt-5.6-terra
    config:
      sandbox_mode: read-only
      approval_policy: never
      cli_env:
        CODEX_HOME: '{{env.CODEX_HOME}}'
        HTTPS_PROXY: '{{env.HTTPS_PROXY}}'
```

Set both environment variables before using this fragment, or remove the entries you do not need. Use an absolute path for `CODEX_HOME`: it is passed through to Codex, unlike config-relative `working_dir`. A dedicated home needs its own configuration and usable authentication. A new empty home does not copy your existing ChatGPT login.

Process variables such as `CODEX_HOME`, proxy settings, certificate paths, and `SSH_AUTH_SOCK` are not inherited by default. Non-authentication fields in Promptfoo's `env` config are not forwarded to the subprocess either. `inherit_process_env: true` forwards the full process environment, with `cli_env` taking precedence. Variables passed to the CLI may also be available to agent commands; sandbox mode does not remove them.

Native OpenAI API graders need API credentials even when the target Codex provider uses ChatGPT sign-in. See [grading providers](/docs/configuration/expected-outputs/model-graded) when configuring model-graded assertions.

<Link id="option-3-run-on-amazon-bedrock" />

<details>
<summary>Run Codex on Amazon Bedrock</summary>

Set `model_provider: amazon-bedrock`, use the Bedrock model ID, and pass AWS credentials and a supported Region:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model_provider: amazon-bedrock
      model: openai.gpt-5.6-sol
      sandbox_mode: read-only
      approval_policy: never
      cli_env:
        AWS_REGION: '{{env.AWS_REGION}}'
        AWS_ACCESS_KEY_ID: '{{env.AWS_ACCESS_KEY_ID}}'
        AWS_SECRET_ACCESS_KEY: '{{env.AWS_SECRET_ACCESS_KEY}}'
```

For temporary credentials, also pass `AWS_SESSION_TOKEN`. For profile-based authentication, forward the required AWS profile and configuration variables instead. Check [Bedrock model access and Regions](/docs/providers/aws-bedrock#openai-models) before running the eval.

Promptfoo does not inject ambient OpenAI keys for a custom `model_provider` unless you explicitly supply `config.apiKey` or the keys in `cli_env`. Top-level `model_provider` takes precedence over `cli_config.model_provider`.

The [Bedrock example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/bedrock) has complete setup instructions.

</details>

<Link id="supported-parameters" />
<Link id="unsupported-capabilities-and-caveats" />

## Configuration reference

All fields below go under the provider's `config`. Unknown provider config keys are rejected. Prompt-level configuration takes precedence over provider configuration; unrelated prompt-level keys are ignored, while invalid values for known fields still fail validation.

### Model and execution

| Field                    | Default when omitted      | Purpose                                                                                  |
| ------------------------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| `model`                  | Codex configuration       | Requested model; a model in the provider ID takes precedence                             |
| `model_reasoning_effort` | Codex configuration       | `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, or `ultra`, subject to model support |
| `working_dir`            | Process working directory | Existing working directory; relative paths use the config directory                      |
| `additional_directories` | None                      | Additional writable directories for `workspace-write`; paths use the config directory    |
| `skip_git_repo_check`    | `false`                   | Allow an existing working directory outside Git                                          |
| `sandbox_mode`           | Codex configuration       | `read-only`, `workspace-write`, or `danger-full-access`                                  |
| `approval_policy`        | Codex configuration       | Use `never` for unattended runs; `on-request` depends on the runtime's approval handling |
| `network_access_enabled` | Codex configuration       | Boolean override for command network access in `workspace-write`                         |
| `web_search_mode`        | Codex configuration       | `disabled`, `cached`, or `live`                                                          |
| `output_schema`          | None                      | JSON Schema object for the final response                                                |
| `maxRetries`             | `3`                       | Maximum scheduler retries for retryable rate limits                                      |

`temperature`, `top_p`, `max_tokens`, `stop`, and `logprobs` are not supported provider fields. This provider does not implement embeddings, moderation, audio, image generation, or realtime API endpoints; use the [OpenAI provider](/docs/providers/openai) for those APIs.

### Threads and traces

| Field              | Default | Purpose                                                                          |
| ------------------ | ------- | -------------------------------------------------------------------------------- |
| `persist_threads`  | `false` | Retain threads by prompt template and configuration within the provider instance |
| `thread_pool_size` | `1`     | Maximum pooled threads retained when persistence is enabled                      |
| `thread_id`        | None    | Resume a saved Codex thread                                                      |
| `enable_streaming` | `false` | Aggregate SDK events and emit item spans                                         |
| `deep_tracing`     | `false` | Collect CLI-native spans; disables thread reuse and resumption                   |

<Link id="custom-binary-path" />
<Link id="goals-and-subagents" />

### Runtime and credentials

| Field                 | Default                                      | Purpose                                                                                  |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apiKey`              | Environment, then Codex login                | Explicit API key; prefer an environment variable or secret manager                       |
| `base_url`            | Codex configuration                          | Custom API base URL                                                                      |
| `model_provider`      | Codex configuration                          | Backend such as `openai` or `amazon-bedrock`                                             |
| `cli_env`             | Minimal environment and provider credentials | Extra CLI environment variables; strings, numbers, and booleans are converted to strings |
| `inherit_process_env` | `false`                                      | Include the full process environment before applying `cli_env`                           |
| `codex_path_override` | SDK's bundled CLI                            | Path to a custom Codex executable                                                        |
| `cli_config`          | None                                         | Codex configuration overrides, serialized as dotted TOML keys                            |

Use `cli_config` for supported [Codex configuration options](https://learn.chatgpt.com/docs/config-file/config-reference), including MCP servers and feature flags. Promptfoo forwards these overrides; it does not implement the features itself. SDK constructor options such as `configOverrides` are not exposed as provider fields.

<Link id="collaboration-mode-beta" />

<details>
<summary>Legacy settings</summary>

`web_search_enabled` is the boolean shorthand for `live` (`true`) or `disabled` (`false`). Prefer `web_search_mode`; it wins when both are set.

Promptfoo still accepts `approval_policy: on-failure` and `untrusted` for compatibility with older runtimes. Use `never` for unattended evals with the current SDK.

The legacy `collaboration_mode` field accepts `coding` or `plan` and forwards it as `cli_config.collaboration_mode`, but this is not a supported setting in the current Codex CLI configuration schema. It does not provide a reliable way to enable subagents. Configure supported capabilities through `cli_config.features` and consult the installed runtime's documentation.

</details>

<Link id="what-promptfoo-can-and-cant-evaluate" />

## Response fields and cost

| Field                 | Meaning                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `output`              | Final Codex answer as a string, including JSON-formatted answers         |
| `sessionId`           | Underlying Codex thread ID                                               |
| `tokenUsage`          | Input, output, and cached-input token counts when reported by the SDK    |
| `cost`                | Standard API estimate for a requested model in Promptfoo's pricing table |
| `metadata.skillCalls` | Detected successful skill reads, when present                            |
| `raw`                 | JSON string containing the SDK turn, including items and usage           |

Reasoning and cache-write counts are included in token details when Codex reports them. Cached input tokens are already part of the input total.

If the requested model is omitted or unknown to the pricing table, `cost` is undefined. The SDK turn does not report the backend-resolved model, so Promptfoo cannot infer it for pricing. Cost estimates do not represent ChatGPT subscription usage or automatically account for Fast, Flex, or Batch pricing. Missing cache-write counts can understate costs. Codex's instructions, tool definitions, and conversation history can make input usage much larger than the visible prompt.

## Troubleshooting

| Symptom                              | Check                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| SDK package missing or cannot load   | Install the SDK in the eval project and check the Node.js version                                    |
| Working-directory error              | Create the directory first; use a Git checkout or set `skip_git_repo_check: true`                    |
| Login or certificate errors          | Check the Codex home and pass required proxy or certificate variables through `cli_env`              |
| Model or reasoning setting rejected  | Check account access, model support, and the bundled or overridden CLI version                       |
| Later tests remember earlier answers | Disable `persist_threads` and remove `thread_id`; disabling response caching does not reset a thread |
| Later tests see earlier file edits   | Restore the fixture or give each independent test its own working directory                          |
| Resumed conversation starts fresh    | Disable `deep_tracing`, which ignores thread options                                                 |

Retryable Codex rate limits are passed to Promptfoo's scheduler with the SDK's reset hint, or a one-minute fallback delay. `maxRetries` controls retries. Hard quota exhaustion is returned as an error without retrying; increasing retries will not resolve it.

<Link id="advanced-examples" />
<Link id="comparison-with-claude-agent-sdk" />
<Link id="openai-codex-sdk-1" />
<Link id="claude-agent-sdk" />
<Link id="examples" />
<Link id="verified-end-to-end-example-runs" />
<Link id="see-also" />

## Examples and related guides

- [Basic code generation](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/basic)
- [Skill assertions and tracing](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/skills)
- [Persistent conversations](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/thread-persistence)
- [Read-only sandbox checks](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/sandbox)
- [Amazon Bedrock setup](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/bedrock)
- [Compare agent SDKs](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-agentic-sdks)
- [Codex App Server provider](/docs/providers/openai-codex-app-server) for evals using the app-server protocol
- [Claude Agent SDK provider](/docs/providers/claude-agent-sdk)
- [Codex Security SDK provider](/docs/providers/openai-codex-security) for managed security scans
