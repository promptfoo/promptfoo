MCP Remote Server Integration & Security Hardening – Implementation Task

Problem and Motivation

Users integrating remote Model Context Protocol (MCP) servers with promptfoo are running into three recurring issues:

- Raw JSON function-call responses instead of executed tool results when using standard providers with MCP integration.
- HTTP 424 Failed Dependency errors when the provider attempts to retrieve tools from a remote MCP server, especially when authentication headers are required.
- Difficulty validating that read-only MCP servers truly prevent unauthorized actions (e.g., delete/modify) during red team tests.

Our goals are to make remote MCP servers first-class citizens: support URL-based servers with headers/auth cleanly, provide clearer diagnostics (which transport failed and why), add resiliency (timeouts/retries), and expose simple policy controls (tool allowlists and approval gating). We will also update docs and examples so users can succeed without relying on custom providers unless they really need advanced agent features.

Scope

This task covers:

1) Core improvements in MCP client/provider code to better support remote servers with headers, robust error handling, timeouts, and retries.
2) Optional policy controls in the provider (allowlist and approval gating) to mirror custom-provider ergonomics.
3) Documentation updates for URL-based servers, auth/header precedence, and new options.
4) Tests to validate header precedence, timeout behavior, retries, and tool transformation.
5) Example alignment is already in place under examples/mcp-testing; ensure they continue to work and reference the updated capabilities.

Non-goals

- Building a full approval UI/flow. If approval gating is enabled, we will implement a minimal, headless behavior.
- Changing existing provider contracts beyond the additions specified here.
- Implementing transport-level authentication handshakes beyond headers/bearer/api_key.

Detailed Requirements and Edits

1) Update misleading comment about remote URLs

- File: `src/providers/mcp/types.ts`
- Change: The `url?: string; // URL for remote server (not currently supported)` comment is incorrect, since `connectToServer` already supports URL transports. Update the comment to simply: `url?: string; // URL for remote MCP server`.

2) Header precedence: explicit headers should override generated auth headers

- File: `src/providers/mcp/client.ts` (inside the URL branch of `connectToServer`)
- Current merge order:
  - `const headers = { ...(server.headers || {}), ...authHeaders }`
- Required change:
  - `const headers = { ...authHeaders, ...(server.headers || {}) }`
- Rationale: Users may need to override `Authorization` or `X-API-Key` when both `auth` and `headers` are present.

3) Respect timeout in MCP config

- File: `src/providers/mcp/client.ts`
- Add optional timeout support using `this.config.timeout` (milliseconds) with `AbortController` for both:
  - `client.listTools()` during initialization
  - `client.callTool()` during invocations
- On timeout, throw a clear error: `MCP request timed out after ${timeoutMs}ms. Consider increasing mcp.timeout.`

4) Retry listing tools with exponential backoff

- File: `src/providers/mcp/client.ts`
- Wrap `client.listTools()` with 2–3 retries (e.g., delays 250ms, 500ms, 1000ms). Only retry on network/HTTP errors and 5xx. Do not retry on 401/403.
- Include the last error message in the thrown error after retries.

5) Improve transport diagnostics and error messages

- File: `src/providers/mcp/client.ts`
- When attempting URL transport, try Streamable HTTP first, then SSE (existing). If both fail, surface an error like:
  - `Failed to connect to MCP server <serverKey> at <url>. Tried Streamable HTTP and SSE. Last error: <message>`
- Include HTTP status code when available (e.g., 424) and note that it typically indicates an upstream dependency (e.g., auth, tool listing failure).

6) Sanitize `$schema` when transforming tools for OpenAI

- File: `src/providers/mcp/transform.ts`
- For `transformMCPToolsToOpenAi`, mirror the Google path behavior by removing `$schema` from the input schema before building the parameters. This avoids unexpected parameter validation behavior in OpenAI tool schemas.

7) Add optional provider-level policy controls

- Files: `src/providers/mcp/types.ts`, `src/providers/mcp/index.ts`
- Extend `MCPConfig` with:
  - `allowed_tools?: string[]` – Only these tool names are permitted at provider level (applies after client’s tool discovery).
  - `require_approval?: 'never' | 'always' | 'on_error'` – Minimal headless gating:
    - `never` (default): no gating.
    - `always`: reject all tool calls with an error: `Tool call blocked: approval required (require_approval=always)`.
    - `on_error`: if a previous attempt to call this tool within the same provider instance returned an error in this process, block subsequent attempts with: `Tool call blocked: prior error requires manual approval (require_approval=on_error)`.
- Implement enforcement in `MCPProvider.callApi` and `MCPProvider.callTool` before calling `mcpClient.callTool`.
- Note: We already support `tools` and `exclude_tools` on the client config. Keep that behavior intact; `allowed_tools` is provider-level and complementary.

8) Friendlier errors for invalid JSON payloads in MCPProvider

- File: `src/providers/mcp/index.ts`
- When the JSON parse fails, include a brief example of expected payload:
  - `Expected JSON: {"tool":"namespaces_list","args":{"namespace":"default"}}`

9) Header casing policy

- File: `src/providers/mcp/client.ts`
- Ensure headers are sent exactly as provided (no re-casing) and avoid rewriting `X-API-Key` to a different variant. Headers are case-insensitive on the wire, but preserving user-provided keys reduces confusion.

10) Unit tests (Jest)

- New tests under `test/providers/mcp/`:
  - `client.headers.test.ts`: verifies merge precedence (explicit headers override auth), preserves header casing.
  - `client.timeout.test.ts`: simulates delayed `listTools` and `callTool` to assert timeout error text.
  - `client.retry.test.ts`: simulates transient failures on `listTools`, succeeds after retries.
  - `transform.openai-schema.test.ts`: ensures `$schema` is stripped and resulting parameters are valid.
  - `provider.policy.test.ts`: verifies `allowed_tools` enforcement and `require_approval` behaviors.

11) Documentation updates (Docusaurus)

- Files:
  - `site/docs/integrations/mcp.md`
  - `site/docs/providers/mcp.md`
- Update to reflect:
  - URL-based remote MCP servers are supported with `server.url` and `server.headers` / `server.auth`.
  - Header precedence: explicit `headers` override automatically generated `auth` headers.
  - New options: `timeout`, `allowed_tools`, `require_approval` (document behavior and limitations).
  - Add short troubleshooting notes mapping common errors (424, timeouts) to likely causes.

12) Examples validation

- Directory: `examples/mcp-testing/`
- Ensure the provided configs remain valid and (optionally) reference `allowed_tools` / `require_approval` where helpful.
- Keep schema headers at top of YAML files.
- Confirm `run-tests.sh` is executable and instructions in `README.md` are accurate.

Acceptance Criteria

- URL-based remote MCP servers connect using Streamable HTTP or SSE; on failure, a clear error surfaces which transports were attempted and why they failed.
- If both `auth` and `headers` are provided, the explicit `headers` take precedence (verified by tests).
- Timeouts are enforced for tool listing and invocation with helpful error messages and configurable via `mcp.timeout`.
- Tool listing retries on transient failures with exponential backoff (verified by tests).
- `$schema` is stripped in OpenAI transformation; tests confirm the resulting schema shape.
- Provider-level policy controls work:
  - `allowed_tools` blocks disallowed tools with a clear error.
  - `require_approval=always` blocks calls with a clear error; `on_error` blocks subsequent calls after a failure.
- Documentation reflects the above and passes docs lint/build.
- Jest tests added and passing locally with coverage.

Testing Plan

1) Unit tests (Jest)

- Run with coverage and randomized order:
  - `npm test -- --coverage --randomize`

2) Manual tests

- Using the configs under `examples/mcp-testing/`:
  - `custom-provider-config.yaml` (for end-to-end with custom provider)
  - `mcp-remote-config.yaml` (direct provider path)
  - Red team configs (`mcp-redteam-config.yaml`, `k8s-mcp-redteam.yaml`)

- Validate:
  - Successful tool listing against a remote server requiring `x-api-key` and `Authorization` headers.
  - Meaningful error messages when auth is invalid (401/403) and when 424 occurs.
  - Timeout behavior by pointing to a deliberately slow endpoint.
  - Policy controls by setting `allowed_tools` to exclude a known tool.

3) Docs

- Build docs locally and verify the new sections render and link correctly.

Validation & Guidance

Step 1: Pre‑flight checks

- Ensure environment variables are set (see `examples/mcp-testing/env.example`). At minimum:
  - `OPENAI_API_KEY` (or other provider key)
  - `MCP_SERVER_URL` (or K8S variant)
  - `MCP_API_KEY`, `MCP_AUTH_TOKEN` if required by your server
- Verify network reachability and auth with curl:
  - `curl -X POST "$MCP_SERVER_URL" -H "x-api-key: $MCP_API_KEY" -H "Authorization: Bearer $MCP_AUTH_TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
  - Expected: a JSON‑RPC result listing `tools` (not an HTML error page)

Step 2: Functional validation (recommended: custom provider)

- Run: `npx promptfoo eval -c examples/mcp-testing/custom-provider-config.yaml --verbose`
- Expected:
  - No `ERR_INVALID_ARG_TYPE`
  - No `424 Failed Dependency`
  - Outputs contain actual data (e.g., “namespace”, “pod”), not raw function call JSON like `{"type":"function"...}`
  - 0 failed assertions

Step 3: Functional validation (direct provider)

- Run: `npx promptfoo eval -c examples/mcp-testing/mcp-remote-config.yaml --verbose`
- If you configured `mcp.timeout`, induce a slow response to confirm a timeout error includes the hint to increase `mcp.timeout`.
- If you configured `allowed_tools`, try invoking a disallowed tool and confirm a clear “blocked” error.

Step 4: Security validation (read‑only)

- Run: `npx promptfoo redteam run -c examples/mcp-testing/k8s-mcp-redteam.yaml`
- Expected:
  - Threshold met (e.g., ≥ 0.8) with no evidence of successful write operations
  - No secret exposure indicators (e.g., tokens, api keys) detected by the custom grader
  - Tool discovery does not reveal disallowed admin tools

Step 5: Inspect results

- `npx promptfoo view` to open the web UI
- Confirm failing cases (if any) have actionable messages (auth, transport, or policy).

Troubleshooting quick map

- `424 Failed Dependency`: Often tool listing/auth at the server; verify headers and server logs.
- Raw JSON function calls in output: Use the custom provider or the native mcp provider; ensure you are not treating the LLM’s tool call as final output.
- `ERR_INVALID_ARG_TYPE` with remote URL: Ensure you are not using stdio transport for remote servers; use URL + headers.
- Timeouts: Increase `mcp.timeout` and verify network latency; check server performance.

Coding Checklist

- Create a feature branch:
  - `git checkout -b feat/mcp-remote-hardening`
- Make code edits as specified above.
- Run linter and formatter:
  - `npm run l`
  - `npm run f`
- Run tests:
  - `npm test -- --coverage --randomize`
- Validate examples manually as needed (avoid starting long-running services by default).
- Update docs pages listed above following Docusaurus guidelines (minimal edits to existing headings; action-oriented language; add front matter if needed).
- Commit using Conventional Commits:
  - `feat(mcp): support remote URL headers precedence, timeouts, retries`
  - `docs(mcp): document remote URL support, timeout, policy controls`
  - `test(mcp): add unit tests for headers precedence, timeout, retries`
- Open PR with GitHub CLI:
  - `gh pr create -f -B main -t "feat(mcp): remote server hardening" -b "..."`

Risks and Mitigations

- Behavior changes in header precedence could surprise users relying on the old merge order. Mitigate by documenting precedence clearly and highlighting in the PR description.
- Timeouts too aggressive for some deployments. Default to undefined/no-timeout unless provided; document guidance.
- Retry logic causing duplicate load on sensitive servers. Keep retries small (2–3) and only on transient/network/5xx.

Roll-back Plan

- Changes are isolated to MCP provider/client and docs. In case of regressions, revert the feature branch and restore previous behavior (no timeouts, old header merge order, no provider-level policies).

Appendix A: Expected MCP Provider JSON Payload

When directly using the `mcp` provider, prompts must contain a JSON payload, for example:

```
{"tool":"namespaces_list","args":{"namespace":"default"}}
```

If the payload cannot be parsed as JSON, the provider should return an error that includes an example similar to the above.

Ready-to-Send Discord Reply

Hey! Thanks for all the detail — we’ve put together a complete solution that should cover your use case end to end.

1) Working approach now
- Use our custom provider (`mcp-agent-provider`) with your remote MCP server and auth headers. It handles remote URL transports and executes tool calls (not just returning raw JSON). We’ve added turnkey configs and a test runner here:
- Configs: `examples/mcp-testing/custom-provider-config.yaml`
- Runner: `examples/mcp-testing/run-tests.sh`

2) If you want to stick with built‑in providers
- We’re hardening promptfoo’s native MCP support to better handle remote servers: clearer errors (transport + status), header precedence (explicit headers override auth), optional timeouts/retries, and basic policy controls (allowlist, approval gating). Docs will reflect these workflows so you won’t need a custom provider for standard cases.

3) Red team your read‑only server
- Use `examples/mcp-testing/k8s-mcp-redteam.yaml`. It focuses on the exact risks you mentioned: unauthorized write attempts, privilege escalation, command injection, and secret exposure. Results will flag any violation (e.g., “deleted successfully”) so you can fix and re‑test quickly.

Quick start

```
cd examples/mcp-testing
cp env.example .env  # add your keys/URL
./run-tests.sh       # choose K8s red team or functional tests
```

If anything looks off (timeouts, 424s, or auth issues), the new error messages should point to the root cause. Happy to iterate with you on any findings or gaps!


