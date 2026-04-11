# Coding Agent Provider Taxonomy

This document summarizes how promptfoo should think about coding-agent providers,
what has been implemented so far, and what should come next. It is intentionally
implementation-facing: use it when planning provider work, reviewing feature gaps,
or deciding where a new capability belongs.

## Scope

This taxonomy covers providers that run an agentic coding runtime, not ordinary
single-turn model APIs. A coding-agent provider usually has some combination of:

- A workspace or project directory.
- Tool use for files, shell commands, MCP, search, or app connectors.
- A session, thread, or server lifecycle.
- Permission, sandbox, or approval controls.
- Rich metadata beyond final assistant text.

The main providers in this family today are:

| Provider family         | Provider IDs                                          | Runtime boundary                           |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------ |
| OpenAI Codex SDK        | `openai:codex-sdk`, `openai:codex`                    | `@openai/codex-sdk` library                |
| OpenAI Codex app-server | `openai:codex-app-server`, `openai:codex-desktop`     | Local `codex app-server` JSON-RPC process  |
| Claude Agent SDK        | `anthropic:claude-agent-sdk`, `anthropic:claude-code` | `@anthropic-ai/claude-agent-sdk` library   |
| OpenCode SDK            | `opencode:sdk`, `opencode`                            | OpenCode SDK plus local or existing server |

Standard OpenAI, Anthropic, Bedrock, Azure, and other model providers still matter
for grading and comparison, but they are outside this taxonomy unless they expose a
stateful coding-agent runtime.

## Taxonomy Axes

### 1. Runtime Boundary

The first question is where promptfoo stops and the agent runtime starts.

| Boundary                 | Meaning                                                       | Current examples                         |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| In-process SDK           | promptfoo calls a package API directly.                       | Codex SDK, Claude Agent SDK              |
| Managed local server     | promptfoo starts a server, then talks to it through a client. | OpenCode when `baseUrl` is unset         |
| Existing server          | promptfoo connects to a runtime it does not configure.        | OpenCode with `baseUrl`                  |
| Local app-server process | promptfoo starts a rich-client protocol server over stdio.    | Codex app-server                         |
| Desktop UI process       | Human-facing native app process.                              | Codex Desktop app, not directly attached |

This distinction matters because it controls what promptfoo can guarantee. If
promptfoo starts the runtime, it can set env vars, working directories, sandbox
options, tracing, and cleanup behavior. If promptfoo attaches to an existing server,
that server owns authentication, installed tools, app connectors, and runtime state.

### 2. Session and Thread State

Coding agents are rarely stateless. Each provider needs explicit semantics for:

- Ephemeral sessions: safe default for independent eval rows.
- Persistent sessions: useful for memory, multi-turn tasks, or regression suites.
- User-supplied sessions: resume an existing thread/session by id.
- Pooling: preserve concurrency without cross-contaminating rows.
- Cleanup: unsubscribe, archive, delete temporary directories, or leave state alone.

The important design rule is that session reuse must be opt-in or very clearly
scoped. Reusing state silently makes eval results order-dependent.

### 3. Workspace and Side Effects

Agent evals should separate filesystem access, network access, and shell access.
Those are different risks.

| Surface     | Safe default                               | Higher-risk mode                                        |
| ----------- | ------------------------------------------ | ------------------------------------------------------- |
| Filesystem  | Temporary directory or read-only workspace | Workspace write or full filesystem access               |
| Shell       | Disabled or approval-gated                 | Allowed command execution                               |
| Network     | Disabled unless explicitly requested       | Host allow-lists, live web/search, package installs     |
| App/plugin  | Not installed or not invoked by default    | App connectors, plugin installs, config writes          |
| Environment | Minimal env                                | Inherited process env with secrets and local auth state |

Provider docs should make clear that `danger-full-access` is not the same as
network access, and read-only filesystem mode does not automatically sanitize env
vars. Each surface should have its own option and its own tests.

### 4. Permission and Interaction Model

Promptfoo evals are non-interactive by default. Agent runtimes often expect a human
to answer approval prompts, permission requests, or clarification questions.
Providers should convert those into deterministic policies.

Common policy categories:

- Command approval.
- File-change approval.
- Permission grants.
- User-input or ask-user-question tools.
- MCP elicitation.
- Dynamic tool calls.
- Plugin or app connector requests.

Default policy should decline, cancel, or return empty answers unless a config opts
into side effects. Every accepted side effect should be visible in metadata.

### 5. Inputs

The baseline input is a prompt string. Coding-agent providers increasingly need
structured inputs:

- Text items.
- Local images or image URLs.
- Skills or plugin references.
- Mentions/app connector references.
- File, diff, or workspace context.

Provider-specific JSON input arrays are acceptable when the underlying runtime has
typed input items. Unknown JSON shapes should usually degrade to plain text rather
than crashing an eval row, unless the provider docs promise strict input parsing.

### 6. Outputs and Metadata

All coding-agent providers should return a normal promptfoo provider result:

- `output`: final assistant-facing text.
- `sessionId`: session/thread id when available.
- `tokenUsage`: runtime usage when available.
- `cost`: estimate when usage and model pricing are known.
- `metadata`: normalized agent metadata.
- `raw`: raw or summarized protocol data when useful and safe.

Provider-specific metadata is still valuable, but consumers need a shared shape for
cross-provider assertions and dashboards. A future shared schema should include:

- Runtime family and version.
- Workspace and sandbox settings.
- Session/thread/turn identifiers.
- Tool trajectories.
- Approval decisions.
- File changes and command executions.
- MCP and dynamic tool calls.
- Skill/plugin/app connector usage.
- Trace ids and span links.

### 7. Observability

Tracing should answer two questions:

- What did the model decide?
- What did the agent runtime do?

Provider tracing should include the top-level `callApi` span, item/tool-level spans
where possible, and sanitized attributes for prompts, commands, tool inputs, file
paths, and outputs. Deep tracing should be opt-in when it requires injecting
OpenTelemetry env vars into a child process.

## What Is Implemented So Far

### Shared Building Blocks

The coding-agent providers already share several practical patterns:

- Optional dependencies are loaded lazily so normal promptfoo installs do not need
  every agent SDK.
- Working directories are validated or created before the agent call.
- Temporary workspaces are cleaned up after evals.
- Session or thread caches are keyed by provider config.
- Provider-level config is stricter than prompt-level merged config.
- Tool and skill usage are surfaced through metadata where possible.
- Tracing is supported for Codex and is partially shared through OpenAI agent
  tracing helpers.

Useful files:

- `src/providers/agentic-utils.ts`
- `src/providers/claude-agent-sdk.ts`
- `src/providers/opencode-sdk.ts`
- `src/providers/openai/codex-sdk.ts`
- `src/providers/openai/codex-app-server.ts`
- `src/providers/registry.ts`

### OpenAI Codex SDK

Status: implemented and documented.

Provider IDs:

- `openai:codex-sdk`
- `openai:codex-sdk:<model>`
- `openai:codex`
- `openai:codex:<model>`

Implemented capabilities:

- Lazy loading for `@openai/codex-sdk`.
- API-key and local Codex login authentication paths.
- Working directory and Git repository safety checks.
- Sandbox, network, web search, approval, and reasoning controls.
- Thread resume and persistent thread pooling.
- JSON schema output.
- Text and local-image input items.
- Skill usage heuristics from `SKILL.md` reads.
- Token usage and cost estimation for known Codex models.
- Streaming aggregation for metadata and tracing.
- Deep tracing into the Codex runtime.
- Default-provider support for grading when Codex credentials are available.

Important limits:

- It is the right default for CI and automation, but it does not expose every rich
  app-server protocol event.
- Skill detection is heuristic.
- Promptfoo still receives a final provider response, not live partial output in
  assertions.

Docs and examples:

- `site/docs/providers/openai-codex-sdk.md`
- `examples/openai-codex-sdk/`

### OpenAI Codex App Server

Status: implemented, documented, and validated with mocked protocol tests plus a
real local eval.

Provider IDs:

- `openai:codex-app-server`
- `openai:codex-app-server:<model>`
- `openai:codex-desktop`
- `openai:codex-desktop:<model>`

Implemented capabilities:

- Spawns `codex app-server --listen stdio://`.
- Drives the app-server JSON-RPC handshake.
- Starts, resumes, unsubscribes, and archives threads according to config.
- Starts turns with model, cwd, sandbox, approval, reasoning, personality,
  collaboration mode, service tier, output schema, and instructions.
- Accepts plain text plus JSON arrays of app-server input items.
- Aggregates streamed item notifications into final text and metadata.
- Captures item counts, command/file/MCP/tool/web-search/reasoning trajectories.
- Handles server requests deterministically through `server_request_policy`.
- Uses safe defaults: read-only sandbox, no approvals, ephemeral threads, minimal env.
- Supports thread pooling and persistent thread cache invalidation.
- Supports raw events, token usage, cost estimation, request timeouts, turn timeouts,
  cleanup, aborts, and process failure handling.
- Supports deep tracing by creating a fresh app-server process per row and injecting
  OpenTelemetry env vars.
- Differentiates the app-server protocol from the Codex Desktop app: promptfoo
  starts its own app-server child process and does not attach to a running Desktop
  app UI process.

Important limits:

- WebSocket transport is not implemented; stdio is the supported transport.
- Live partial output is not exposed to assertions.
- Direct attachment to a running Codex Desktop app is not implemented.
- High-risk protocol requests such as config writes, plugin installs, and arbitrary
  filesystem writes should remain unavailable or explicitly policy-gated.

Docs and examples:

- `site/docs/providers/openai-codex-app-server.md`
- `docs/agents/codex-app-server-provider-notes.md`
- `examples/openai-codex-app-server/`

### Claude Agent SDK

Status: implemented and documented.

Provider IDs:

- `anthropic:claude-agent-sdk`
- `anthropic:claude-code`

Implemented capabilities:

- Lazy loading for `@anthropic-ai/claude-agent-sdk`.
- Anthropic API key, Bedrock, Vertex, and local Claude Code auth flows.
- Temporary or configured working directories.
- Built-in tool controls, allowed/disallowed tools, and permission modes.
- Explicit unsafe permission skip flag.
- MCP server configuration and optional MCP caching.
- AskUserQuestion handling.
- Plugin and local skill support.
- Custom agents, hooks, system prompt overrides, betas, thinking, and effort options.
- Session resume, fork, continue, persistence, and file checkpointing options.
- Sandbox and executable configuration.
- Usage/cost controls such as max budget.

Important limits:

- The SDK owns many semantics, so promptfoo must keep docs aligned with SDK changes.
- Side-effectful modes require external workspace reset discipline.

Docs and examples:

- `site/docs/providers/claude-agent-sdk.md`
- `examples/claude-agent-sdk/`

### OpenCode SDK

Status: implemented and documented.

Provider IDs:

- `opencode:sdk`
- `opencode`

Implemented capabilities:

- Lazy loading for `@opencode-ai/sdk` v1 or v2.
- Starts an OpenCode server when `baseUrl` is unset.
- Connects to an existing OpenCode server when `baseUrl` is provided.
- Supports provider/model selection, variants, workspaces, and custom agents.
- Supports temporary or configured working directories.
- Uses read-only default tools for configured workspaces.
- Supports write/edit/bash tools with explicit permission config.
- Supports JSON Schema structured output through OpenCode `format`.
- Supports sessions and persistent session caching.
- Supports MCP configuration and optional MCP caching when promptfoo starts the
  server.

Important limits:

- When using `baseUrl`, the existing server owns auth, MCP setup, installed agents,
  and server-side configuration.
- OpenCode model support is delegated to OpenCode/models.dev rather than promptfoo's
  normal provider model tables.

Docs and examples:

- `site/docs/providers/opencode-sdk.md`
- `examples/provider-opencode-sdk/`

## Current Naming Guidance

Use provider IDs that encode the runtime boundary, not just the model vendor.

- `openai:codex` should continue to mean the Codex SDK alias because that is the
  best default for automation.
- `openai:codex-app-server` should mean the app-server JSON-RPC protocol.
- `openai:codex-desktop` should remain an alias for app-server behavior unless or
  until promptfoo can actually attach to the Desktop app process.
- `anthropic:claude-code` should remain an alias for Claude Agent SDK because the
  SDK is still built on Claude Code.
- `opencode` can remain a convenience alias for `opencode:sdk`.

Avoid adding unscoped top-level aliases such as `codex:desktop` until the OpenAI
scoped names are stable and the docs can clearly explain the difference between
SDK, app-server, and Desktop UI attachment.

## What To Implement Next

### 1. Shared Agent Metadata Schema

Create a cross-provider `metadata.agent` shape while preserving provider-specific
metadata namespaces such as `metadata.codexAppServer`.

Proposed fields:

- `runtime`: `codex-sdk`, `codex-app-server`, `claude-agent-sdk`, `opencode`.
- `runtimeVersion`: runtime-reported version when available.
- `sessionId`, `threadId`, `turnId`.
- `workingDir`, `sandbox`, `network`, `approvalPolicy`.
- `tools`: normalized tool calls and outcomes.
- `commands`: normalized shell command executions.
- `fileChanges`: normalized file write/edit/delete attempts.
- `approvals`: normalized approval prompts and decisions.
- `mcp`: normalized MCP calls and elicitations.
- `skills`: confirmed and attempted skill usage.
- `trace`: trace ids and span ids when available.

Acceptance criteria:

- Existing provider-specific metadata remains backward compatible.
- Cross-provider assertions can target the same metadata path.
- Tests cover at least Codex SDK, Codex app-server, Claude Agent SDK, and OpenCode.

### 2. Shared Coding-Agent Provider Test Contract

Add a reusable test contract for coding-agent providers. Each provider can implement
the same scenarios with its own mocked runtime.

Core scenarios:

- Missing optional dependency.
- API key/env precedence.
- Working directory validation.
- Prompt-level config merge.
- Safe default sandbox and permissions.
- Structured output.
- Session persistence and cleanup.
- Timeout and abort.
- Runtime process/server failure.
- Tool approval decline by default.
- Metadata normalization.
- Trace sanitization.

Acceptance criteria:

- New providers cannot skip lifecycle and safety cases.
- Mock implementations reset hoisted mocks in `beforeEach`.
- Concurrency tests prove one session/process failure cannot fail unrelated rows.

### 3. Provider Capability Matrix

Add a docs page or generated table that compares coding-agent provider capabilities.

Suggested columns:

- Provider IDs.
- Runtime boundary.
- Optional dependency or CLI requirement.
- Auth modes.
- Workspace model.
- Sandbox controls.
- Shell/file/network controls.
- MCP support.
- Skills/plugins/custom agents.
- Structured output.
- Session persistence.
- Tracing.
- Raw protocol metadata.
- Existing-server attachment.

Acceptance criteria:

- The matrix links to each provider doc.
- It clearly says that Codex Desktop attachment is not currently supported.
- It is tested in the docs build.

### 4. Real Eval QA Matrix

Create a small set of real eval examples that can be run selectively by maintainers.

Minimum scenarios:

- Read-only repo review.
- Structured JSON output.
- Sandbox denial for attempted writes.
- Workspace-write side effect in a disposable fixture.
- Session persistence across two rows.
- Skill or plugin invocation.
- MCP tool call with a deterministic local MCP server.
- Deep tracing smoke test.

Acceptance criteria:

- Each scenario records expected pass/fail/error behavior.
- Each scenario can run with `--no-cache`.
- Side-effectful scenarios use disposable workspaces.
- CI can run a lightweight subset without requiring every optional agent runtime.

### 5. Security and Redteam Coverage

Add adversarial tests for the risky parts of agent runtimes.

High-value cases:

- Prompt injection that asks the agent to reveal env vars.
- Path traversal through input items, tool args, or MCP responses.
- Approval bypass attempts.
- Plugin install/config-write attempts.
- Network enablement attempts when network should be off.
- Symlink writes out of the workspace.
- Malicious `SKILL.md` or plugin instructions.
- Tool output containing secrets that must be redacted from traces.

Acceptance criteria:

- Providers decline or isolate side effects by default.
- Redaction is tested for command output, MCP arguments, tool arguments, prompts,
  and final metadata.
- Any accepted dangerous operation requires explicit config and is visible in
  metadata.

### 6. Codex App Server Follow-Up Features

The app-server provider now covers the core eval path. The next app-server-specific
work should focus on rare protocol features and product integration boundaries.

Candidates:

- `model/list`, `skills/list`, `plugin/list`, `plugin/read`, and `app/list`
  metadata discovery.
- `review/start` support for native review flows.
- `turn/steer` and `turn/interrupt` tests for cancellation and mid-turn control.
- Optional WebSocket transport only if upstream stabilizes it.
- Better raw event snapshots for protocol regression tests.
- Stronger docs around Desktop alias semantics and why promptfoo starts a separate
  app-server process.

Acceptance criteria:

- Rare features are opt-in and deterministic.
- High-risk operations are policy-gated.
- Protocol additions have mocked tests and at least one documented example when
  user-facing.

### 7. Side-Effect Harness

Build a reusable harness for tests and examples that need write access.

It should provide:

- Disposable workspace creation.
- Git repository initialization when needed.
- Snapshot before and after agent runs.
- Symlink and path traversal fixtures.
- Cleanup guarantees.
- Helpers for expected file diffs.

Acceptance criteria:

- No side-effectful provider test mutates the source checkout.
- Tests can assert exact changed files.
- Harness works on macOS, Linux, and Windows CI.

### 8. Documentation Cleanup

Improve the information architecture around coding-agent providers.

Recommended docs:

- A public provider comparison matrix.
- A "Choosing a coding-agent provider" guide.
- A "Managing side effects in agent evals" guide.
- Provider-specific "SDK vs app-server vs Desktop app" sections for Codex.
- Example READMEs that all share the same run, auth, and safety structure.

Acceptance criteria:

- The public docs answer which provider to use for CI, Desktop-like protocol evals,
  Claude Code compatibility, and OpenCode multi-provider setups.
- Example configs validate locally.
- Docs state safe defaults and side-effect responsibilities near every write-capable
  example.

## Review Checklist For New Coding-Agent Provider Work

Before merging a provider in this family, verify:

- Provider IDs are explicit about runtime boundary.
- Optional dependencies fail with actionable install guidance.
- API keys and local-auth modes are documented.
- Env precedence is tested.
- Working directory, sandbox, network, and shell controls are documented and tested.
- Prompt-level config merges do not drop nested provider defaults.
- Hoisted mocks with implementations reset in `beforeEach`.
- Session/thread reuse is opt-in or explicitly scoped.
- Runtime failures do not poison unrelated sessions or rows.
- Approval/user-input/MCP requests have deterministic non-interactive defaults.
- Metadata includes session ids, tool/command/file activity, and approval decisions.
- Trace attributes are sanitized.
- Examples validate and at least one real eval has been run when the runtime is
  locally available.

## Open Questions

- Should promptfoo expose one public `metadata.agent` schema now, or keep it internal
  until at least two providers use it in docs examples?
- Should Codex app-server discovery operations be exposed as provider metadata on
  every call, or only behind an explicit config flag?
- Should any provider support a hard "no side effects" verifier that snapshots the
  workspace and fails if files changed?
- Should remote/existing-server modes be marked as less reproducible in promptfoo
  output metadata?
- Should top-level aliases like `codex:app-server` wait for a broader provider naming
  cleanup?
