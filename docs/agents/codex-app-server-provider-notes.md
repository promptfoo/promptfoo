# Codex App Server Provider Notes

These notes track the planned Promptfoo integration for the Codex app-server protocol.
They are intentionally implementation-facing: keep them current as the provider, docs,
examples, and verification expand.

For the broader coding-agent provider taxonomy, see
[`coding-agent-provider-taxonomy.md`](./coding-agent-provider-taxonomy.md).

## Objective

Add an experimental Promptfoo provider that drives `codex app-server` directly. The
provider should complement, not replace, the existing OpenAI Codex SDK provider:

- Codex SDK provider: best default for CI and automation.
- Codex app-server provider: best for evaluating rich-client behavior exposed by the
  Codex app-server protocol, including streamed item events, approvals, skills,
  plugins, apps, filesystem requests, and thread lifecycle primitives.

Primary provider IDs:

- `openai:codex-app-server`
- `openai:codex-app-server:<model>`
- `openai:codex-desktop`
- `openai:codex-desktop:<model>`

Optional top-level aliases may be added after the OpenAI-scoped provider is stable:

- `codex:app-server`
- `codex:desktop`

## Source Material

- Official docs: https://developers.openai.com/codex/app-server
- Local CLI: `/Applications/Codex.app/Contents/Resources/codex app-server --help`
- Local generated schema command:

```bash
codex app-server generate-ts --out /tmp/codex-app-server-schema/ts
codex app-server generate-json-schema --out /tmp/codex-app-server-schema/json
```

Current local schema inspection was generated from `codex-cli 0.118.0`.

## Protocol Shape

Transport:

- `stdio://` default, JSONL messages.
- `ws://IP:PORT` experimental, one JSON-RPC message per WebSocket text frame.

Handshake:

1. Send `initialize` with Promptfoo client metadata.
2. Send `initialized` notification.
3. Start or resume a thread.
4. Start a turn.
5. Read notifications until `turn/completed`.

Core client requests:

- `initialize`
- `thread/start`
- `thread/resume`
- `thread/archive`
- `thread/unsubscribe`
- `thread/read`
- `turn/start`
- `turn/steer`
- `turn/interrupt`
- `review/start`
- `model/list`
- `skills/list`
- `plugin/list`
- `plugin/read`
- `app/list`

High-risk client requests that should not be exposed casually:

- `fs/writeFile`
- `fs/remove`
- `fs/copy`
- `config/value/write`
- `config/batchWrite`
- `plugin/install`
- `plugin/uninstall`
- `command/exec`

Core server notifications:

- `thread/started`
- `thread/status/changed`
- `turn/started`
- `turn/completed`
- `item/started`
- `item/completed`
- `item/agentMessage/delta`
- `item/commandExecution/outputDelta`
- `item/fileChange/outputDelta`
- `item/mcpToolCall/progress`
- `serverRequest/resolved`
- `thread/tokenUsage/updated`
- `error`

Core server requests requiring deterministic Promptfoo responses:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `item/tool/requestUserInput`
- `mcpServer/elicitation/request`
- `item/tool/call`

## Provider Contract

### Inputs

Promptfoo prompt strings remain the default. The provider should also accept a JSON
array of Codex input items:

```json
[
  { "type": "text", "text": "Review this project" },
  { "type": "local_image", "path": "/absolute/path/to/screenshot.png" },
  { "type": "skill", "name": "skill-creator", "path": "/absolute/path/SKILL.md" }
]
```

Supported input item types for the first implementation:

- `text`
- `local_image`, mapped to app-server `inputImage`
- `skill`

Unknown prompt JSON should be treated as plain text instead of throwing.

### Output

The provider response should include:

- `output`: final assistant text, assembled from `item/agentMessage/delta` and
  completed `agentMessage` items.
- `sessionId`: thread id.
- `raw`: serialized protocol-level turn summary and selected notifications.
- `metadata.codexAppServer`: thread id, turn id, model, cwd, sandbox, approvals,
  server requests, item counts, command/file/tool trajectories, and app-server
  protocol data useful for debugging.
- `metadata.skillCalls` / `metadata.attemptedSkillCalls`: heuristic skill usage
  where available.
- `tokenUsage`: from `thread/tokenUsage/updated` if emitted.
- `cost`: estimated from Promptfoo's Codex pricing table when model is known.

### Config

Provider-level config should be strict. Prompt-level merged config should strip unknown
keys so generic Promptfoo prompt config does not break rows.

Core config:

- `apiKey`
- `base_url`
- `working_dir`
- `additional_directories`
- `skip_git_repo_check`
- `codex_path_override`
- `model`
- `model_provider`
- `service_tier`
- `sandbox_mode`
- `sandbox_policy`
- `approval_policy`
- `approvals_reviewer`
- `model_reasoning_effort`
- `reasoning_summary`
- `personality`
- `output_schema`
- `thread_id`
- `persist_threads`
- `thread_pool_size`
- `ephemeral`
- `persist_extended_history`
- `experimental_raw_events`
- `experimental_api`
- `cli_config`
- `cli_env`
- `inherit_process_env`
- `reuse_server`
- `deep_tracing`
- `request_timeout_ms`
- `startup_timeout_ms`
- `server_request_policy`

### Safety Defaults

Default stance should favor repeatable evals over convenience:

- `approval_policy`: `never`
- `sandbox_mode`: `read-only`
- `network_access_enabled`: `false`
- `ephemeral`: `true`
- `reuse_server`: `true` unless `deep_tracing` is enabled
- `inherit_process_env`: `false`
- Server-side approval requests: decline/cancel or empty grants unless explicitly
  configured.

Rationale:

- The app-server exposes shell, filesystem, app connector, plugin, and config surfaces.
- Promptfoo evals should be deterministic and should not block on human approval.
- Eval prompts and target behavior can be adversarial.

## Implementation Phases

1. Stdio JSON-RPC client
   - Spawn `codex app-server`.
   - Parse JSONL stdout.
   - Route responses, notifications, and server requests.
   - Capture stderr for debug logs.
   - Support abort and timeout.

2. Provider lifecycle
   - Register with `providerRegistry`.
   - Reuse app-server process by default.
   - Shut down child processes, pending requests, and readline handles.
   - Disable reuse when `deep_tracing` is enabled.

3. Thread and turn execution
   - Validate working directory.
   - Start/resume threads.
   - Start turns with prompt input, model, cwd, sandbox, approvals, effort, personality,
     service tier, and output schema.
   - Serialize turns per reused thread.
   - Unsubscribe/archive non-persistent threads during cleanup.

4. Streaming aggregation
   - Track `turnId`.
   - Assemble assistant deltas.
   - Store completed items.
   - Build item counts and trajectory metadata.
   - Capture command output, file changes, MCP calls, dynamic tool calls, web search,
     plans, reasoning summaries, and review output.

5. Server request handling
   - Deterministically answer command approvals.
   - Deterministically answer file-change approvals.
   - Return empty permission grants by default.
   - Support configured answers for `tool/requestUserInput`.
   - Decline/cancel MCP elicitation by default.
   - Support static dynamic-tool responses.
   - Record all requests and decisions in metadata.

6. Tracing
   - Wrap `callApi` in `withGenAISpan`.
   - Add item-level spans when streaming notifications arrive.
   - Sanitize command output, tool arguments, and message text before trace attributes.
   - Inject OTEL env when `deep_tracing` is enabled.

7. Docs and examples
   - Add provider docs.
   - Add provider index entry.
   - Add examples for basic usage, read-only repo review, structured output, approval
     handling, skills, and tracing.

8. Verification
   - Unit tests with mocked child process and mocked protocol frames.
   - Registry tests for provider IDs and model-in-path parsing.
   - Docs/examples lint where applicable.
   - Local smoke config using a harmless prompt and `sandbox_mode: read-only` if
     credentials/login are available.
   - Final dogfood: run the new provider against the git diff and iterate on comments.

## Progress Log

### 2026-04-09

- Added initial provider implementation at `src/providers/openai/codex-app-server.ts`.
- Added provider IDs under the OpenAI registry:
  - `openai:codex-app-server`
  - `openai:codex-app-server:<model>`
  - `openai:codex-desktop`
  - `openai:codex-desktop:<model>`
- Implemented stdio JSON-RPC lifecycle:
  - spawn `codex app-server --listen stdio://`
  - `initialize`
  - `initialized`
  - `thread/start`
  - `thread/resume`
  - `turn/start`
  - notification handling through `turn/completed`
  - `thread/unsubscribe`/`thread/archive` cleanup modes
- Implemented safe config defaults:
  - `approval_policy: never`
  - `sandbox_mode: read-only`
  - `ephemeral: true`
  - `thread_cleanup: unsubscribe`
  - process env isolation unless `inherit_process_env: true`
- Implemented deterministic server request responses:
  - command execution approvals default to `decline`
  - file changes default to `decline`
  - permission requests default to empty grants
  - user input requests default to empty answers
  - MCP elicitations default to `decline`
  - dynamic tools can use static configured responses
- Implemented output normalization:
  - assistant delta aggregation
  - completed `agentMessage` fallback/preference
  - token usage from `thread/tokenUsage/updated`
  - cost estimate for known Codex models
  - metadata with item counts, items, server request decisions, thread/turn ids
- Implemented provider-level GenAI tracing and item spans.
- Added mocked protocol tests in `test/providers/openai-codex-app-server.test.ts`.
- Added registry tests in `test/providers/index.test.ts`.
- Verification so far:
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - `npx vitest run test/providers/index.test.ts -t "Codex app-server|Codex desktop" --sequence.shuffle=false`
  - `npm run tsc -- --pretty false`
- Expanded mocked protocol tests to cover:
  - `thread/resume`
  - structured prompt input normalization
  - default `thread/unsubscribe` cleanup
  - user input request policy
  - dynamic tool static response policy
  - metadata sanitization
- Ran a real local smoke eval through `npm run local -- eval -c examples/openai-codex-app-server/promptfooconfig.yaml --no-cache -o /tmp/promptfoo-codex-app-server-example.json`.
  - Result: pass.
  - Provider returned Codex app-server `sessionId`, token usage, item counts, thread id,
    turn id, and structured JSON output.
- Ran docs build:
  - `cd site && SKIP_OG_GENERATION=true npm run build`
  - Result: pass.
- First dogfood review through `examples/openai-codex-app-server/review-diff/promptfooconfig.yaml`
  found four actionable provider issues:
  - startup timeout could leak a spawned app-server and leave a rejected reusable
    connection promise cached
  - reused connections closed over the first turn's server request policy
  - app-server exit during a turn could leave the eval waiting forever when no turn
    timeout was configured
  - `raw` response payload serialized unsanitized protocol items
- Fixed the dogfood findings and added regression coverage:
  - failed startup closes the process and a later call spawns a fresh process
  - active turns store their effective config so prompt-level server request policies are
    honored on reused servers
  - connection exit resolves active turns with a provider error and removes the dead
    connection from reuse maps
  - `raw` now contains sanitized thread, turn, token usage, notifications, and item
    metadata
  - final output now uses the last completed `agentMessage`, which avoids concatenating
    progress messages with final structured review output
- Verification after fixes:
  - `npm run tsc -- --pretty false`
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - Result: pass, 13 provider tests.
- Second dogfood review passed the Promptfoo eval and returned valid JSON, but still
  reported two provider comments:
  - legacy `execCommandApproval` / `applyPatchApproval` requests identify the active
    thread with `conversationId` and expect legacy review decisions
  - persistent thread-pool eviction deleted local handles without unsubscribing the
    evicted loaded thread
- Additional hardening from the second dogfood pass:
  - stdio parser now buffers partial JSON-RPC lines and rejoins literal newlines inside
    command-output strings as escaped newlines before parsing
  - legacy approval requests now map prompt-level policy to `approved`,
    `approved_for_session`, `denied`, and `abort`
  - legacy server requests can find active turn state by `conversationId`
  - evicted persistent cached threads now send `thread/unsubscribe` before being removed
  - added regression coverage for literal-newline JSON-RPC notifications, legacy
    approval requests, and persistent thread-pool eviction
- Verification after second dogfood fixes:
  - `npm run tsc -- --pretty false`
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - Result: pass, 16 provider tests.
- Third dogfood review passed transport/eval and reported two lifecycle comments:
  - stale persistent thread handles remained after a reused app-server process exited
  - JSON-RPC request timeout cleanup removed the pending request but left an abort
    listener attached
- Additional hardening from the third dogfood pass:
  - connection close now removes cached thread handles owned by that connection key
  - per-request timeout cleanup now removes abort listeners before rejecting
  - added regression coverage for cached-thread invalidation after process exit and
    abort-listener cleanup on JSON-RPC timeout
- Verification after third dogfood fixes:
  - `npm run tsc -- --pretty false`
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - Result: pass, 18 provider tests.
- Fourth dogfood review passed transport/eval and reported two thread-cache comments:
  - persistent thread caching was still enabled for fresh-per-call app-server processes
    (`reuse_server: false` or `deep_tracing`)
  - pool eviction could unsubscribe an active cached thread before its turn completed
- Additional hardening from the fourth dogfood pass:
  - thread caching is now allowed only when the app-server connection itself is reusable
  - active/reserved thread ids are protected with a small refcount while a call is using
    them
  - thread-pool eviction skips protected threads and temporarily allows the pool to
    exceed its soft cap rather than evicting an in-flight turn
  - added regression coverage for non-reusable persistent-thread configs and active-turn
    eviction avoidance
- Verification after fourth dogfood fixes:
  - `npm run tsc -- --pretty false`
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - Result: pass, 20 provider tests.
- Fifth dogfood review passed transport/eval and reported one persistent-thread race:
  - concurrent calls with the same persistent-thread cache key could both miss the cache
    while the first `thread/start` was still pending, creating duplicate persistent
    threads and leaking the earlier one
- Additional hardening from the fifth dogfood pass:
  - added an in-flight thread promise map keyed by thread cache key
  - concurrent same-cache `thread/start` / `thread/resume` callers now share the same
    pending thread handle
  - added regression coverage for concurrent same-cache persistent calls, ensuring only
    one `thread/start` is sent and both turns use the shared thread
- Verification after fifth dogfood fix:
  - `npm run tsc -- --pretty false`
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - Result: pass, 21 provider tests.
- Sixth dogfood review passed transport/eval and reported two cache/default comments:
  - reusable connections could keep the first request timeout for requests that did not
    pass a per-call timeout
  - persistent thread cache keys omitted thread-start options such as `ephemeral`,
    `experimental_raw_events`, and `persist_extended_history`
- Additional hardening from the sixth dogfood pass:
  - all provider-owned app-server requests now pass the effective per-call request
    timeout explicitly
  - persistent thread cache keys now include thread-start options that can change thread
    semantics
  - added regression coverage for prompt-level request timeouts on reused connections and
    thread-start option changes in persistent cache keys
- Verification after sixth dogfood fixes:
  - `npm run tsc -- --pretty false`
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - Result: pass, 23 provider tests.
- Seventh dogfood retry:
  - first attempt hit an external Codex connectivity failure (`Network is unreachable`,
    `Reconnecting... 2/5`), which the provider surfaced as a clean provider error
  - retry completed transport/eval and reported one metadata issue: skill-root detection
    used the parent process env instead of the resolved app-server child env
- Additional hardening from the seventh dogfood pass:
  - turn state now carries the resolved app-server environment produced by
    `prepareEnvironment`
  - skill root detection now uses the child env for `CODEX_HOME`, `HOME`, and
    `USERPROFILE`
  - added regression coverage for `cli_env.HOME` skill-call metadata detection
- Verification after seventh dogfood fix:
  - `npm run tsc -- --pretty false`
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`
  - Result: pass, 24 provider tests.
- Eighth dogfood review:
  - `npm run local -- eval -c examples/openai-codex-app-server/review-diff/promptfooconfig.yaml --no-cache --no-share -o /tmp/promptfoo-codex-app-server-review.json`
  - Result: pass.
  - Provider output: `{"comments":[],"summary":"No actionable findings; TypeScript and focused provider tests passed."}`
  - This confirms the provider can be used to review the current git diff and return
    schema-valid JSON with no remaining actionable comments from the dogfood reviewer.
- Final verification sweep:
  - `npm run f`: pass with existing complexity warnings only; no formatting changes needed
  - `npm run tsc -- --pretty false`: pass
  - `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`:
    pass, 24 provider tests
  - `npx vitest run test/providers/index.test.ts -t "Codex app-server|Codex desktop" --sequence.shuffle=false`:
    pass, 2 registry tests
  - `npm run l`: pass with existing complexity warnings only
  - `cd site && SKIP_OG_GENERATION=true npm run build`: pass
  - `npm run local -- eval -c examples/openai-codex-app-server/promptfooconfig.yaml --no-cache --no-share -o /tmp/promptfoo-codex-app-server-example.json`:
    pass

## QA Matrix

Required mocked unit tests:

- Constructor defaults and strict config validation.
- Prompt-level unknown config stripping.
- Missing/inaccessible/non-directory working directory.
- Git check and `skip_git_repo_check`.
- API key/env isolation and explicit `cli_env`.
- Handshake order: `initialize`, `initialized`, `thread/start`, `turn/start`.
- Model from provider path overrides/defaults correctly.
- `thread_id` uses `thread/resume`.
- `persist_threads` reuses cached thread and serializes turns.
- Non-persistent calls unsubscribe/archive as configured.
- Assistant deltas aggregate into final output.
- Completed `agentMessage` fallback works when deltas are missing.
- Token usage from `thread/tokenUsage/updated`.
- Error notification produces provider error.
- Failed turn produces provider error.
- Abort before start.
- Abort during turn sends `turn/interrupt` and returns aborted error.
- Command approval request default decline.
- File change request default decline.
- Permission request default empty grant.
- User input request configured answers.
- Dynamic tool call configured static response.
- MCP elicitation default decline/cancel.
- Metadata contains item counts, trajectories, approvals, raw notifications, and server
  request decisions without leaking API keys.
- `cleanup` kills child process and unregisters provider.
- `deep_tracing` injects OTEL env and disables reuse/thread persistence.
- Provider-level GenAI tracing records response body, token usage, session id, and item
  count attributes.

Required docs/examples checks:

- Provider docs render in Docusaurus.
- Examples are listed and runnable from repo root with `npm run local -- eval ... --no-cache`.
- Config docs call out experimental status, safety defaults, and difference from Codex SDK.

## Open Questions

- Whether to expose WebSocket transport in the first public version. Stdio is enough for
  Promptfoo-managed app-server processes; WebSocket is useful for external clients but
  adds auth and lifecycle complexity.
- Whether to support top-level `codex:*` aliases immediately or keep all new IDs under
  `openai:*` for consistency with the existing Codex SDK provider.
- Whether to persist generated app-server protocol types in source. The current plan is
  to implement a narrow local type surface and document how to regenerate schemas instead
  of committing a large generated bundle.

## Critical Audit Follow-up

Review feedback and red-team audit items addressed after the initial dogfood pass:

- Fixed registry env propagation for object-shaped provider configs. `loadApiProvider`
  already merges suite-level and provider-level env into `providerOptions.env`; the
  registry now passes that merged env to `OpenAICodexAppServerProvider`.
- Fixed `service_tier` to match the generated app-server schema from `codex-cli 0.118.0`:
  `fast` and `flex` only.
- Reset the hoisted `spawn` mock implementation in `beforeEach` to satisfy `test/AGENTS.md`
  mock isolation rules.
- Regenerated app-server TypeScript and JSON Schema into
  `/tmp/codex-app-server-schema-current.XVTCwL` during the audit and compared rare
  app-server fields against the implementation.
- Added coverage for schema-supported rare fields:
  - `model_reasoning_effort: none`
  - exact `personality` values: `none`, `friendly`, `pragmatic`
  - granular approval policy objects
  - app-server command approval amendment objects
  - session-scoped permission grants
  - accepted MCP elicitation responses with content and metadata
  - `base_instructions`, `developer_instructions`, and `collaboration_mode`
- Dogfood review then found additional issues:
  - reusable app-server connections stayed alive after JSON-RPC request timeouts, which
    could leave late side-effecting responses unmanaged
  - docs listed `thread_pool_size` as unlimited even though the implementation defaults
    to `1`
  - provider cleanup cleared active turns before resolving them, which could hang
    shutdown while a turn was in flight
  - raw JSON-RPC notifications were retained even when `include_raw_events` was false
  - spawned app-server processes could be missed if cleanup ran while `initialize` was
    still pending
  - concurrent persistent thread starts could temporarily exceed `thread_pool_size` and
    remain over capacity after active turns finished
  - deep-tracing calls that shared a `thread_id` could overlap turns because the queue key
    returned early
  - the OpenAI provider docs heading change would have broken the existing `#codex-sdk`
    anchor
  - default `thread_id` resumes skipped unsubscribe cleanup
  - sent JSON-RPC request aborts kept the reusable app-server alive
  - retryable app-server `error` notifications with `willRetry: true` were treated as
    terminal
  - concurrent default-cleanup `thread_id` rows could unsubscribe while another row was
    queued for the same thread
- Fixed these by closing/evicting connections on timeout and abort, resolving active
  turns during cleanup, tracking pending initialization processes, making raw event
  retention opt-in, rebalancing the persistent thread pool after turns finish, serializing
  explicit `thread_id` turns even under deep tracing, preserving the OpenAI docs
  `#codex-sdk` heading, default-unsubscribing non-persistent resumed threads, honoring
  retryable app-server errors, and deferring resumed-thread unsubscribe until no other
  protected queued caller remains.
- Updated docs to explain why the app-server provider should stay separate from the
  Codex SDK provider: the SDK is the right default for CI and automation, while app-server
  is for rich-client protocol event surfaces and does not attach to a running Codex
  Desktop app.

Latest focused verification after these fixes:

- `npx vitest run test/providers/openai-codex-app-server.test.ts --sequence.shuffle=false`:
  pass, 35 provider tests.
- `npm run local -- eval -c examples/openai-codex-app-server/review-diff/promptfooconfig.yaml --no-cache --no-share`:
  pass with `{"comments":[],"summary":"No actionable issues found in the current diff."}`.
