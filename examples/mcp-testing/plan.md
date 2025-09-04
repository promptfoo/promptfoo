MCP Remote Server Hardening – Plan & TODOs

Objectives

- First‑class support for remote MCP servers (URL + headers/auth)
- Clear diagnostics (transport attempted, HTTP status) and resilience (timeouts, retries)
- Simple provider‑level controls (allowed tools, optional approval gating)
- Updated docs and examples; reproducible validation steps

Work Breakdown and TODOs

- MCP client/provider code
  - [ ] P1: Implement header precedence override in MCP client (URL path) — explicit `headers` override generated `auth` headers [in_progress]
  - [ ] P2: Add timeout support to `listTools` and `callTool` using `AbortController` [pending]
  - [ ] P3: Add retries to `listTools` with exponential backoff (transient/network/5xx only) [pending]
  - [ ] P4: Improve transport errors to include URL, transport(s) tried, and HTTP status/reason [pending]
  - [ ] P5: Strip `$schema` in OpenAI tool transformation (mirror Google path) [pending]
  - [ ] P6: Add provider‑level `allowed_tools` enforcement (block with clear error) [pending]
  - [ ] P7: Add `require_approval` gating: `never` | `always` | `on_error` (headless) [pending]
  - [ ] P8: Deterministic tool selection and warning when duplicate tool names exist across servers [pending]

- Tests
  - [ ] T1: Unit tests — headers precedence and casing preserved [pending]
  - [ ] T2: Unit tests — timeout behavior for `listTools` and `callTool` [pending]
  - [ ] T3: Unit tests — retries on transient `listTools` failures [pending]
  - [ ] T4: Unit tests — OpenAI schema transformation sanitization [pending]
  - [ ] T5: Unit tests — `allowed_tools` and `require_approval` enforcement [pending]
  - [ ] T6: E2E tests with mock MCP server (401/403, 424/5xx, SSE fallback, duplicate tools) [pending]

- Docs
  - [ ] D1: integrations/mcp.md — validation & troubleshooting for remote URL + headers [pending]
  - [ ] D2: providers/mcp.md — document options (timeout, allowed_tools, require_approval), URL+headers+auth examples, and header precedence [pending]
  - [ ] D3: red-team/mcp-security-testing.md — validation steps and expected outcomes [pending]
  - [ ] D4: providers/mcp.md — add concise YAML snippets for timeout and policy usage [pending]

- Examples
  - [ ] E1: Validate `examples/mcp-testing` configs against new behaviors [pending]
  - [ ] E2: Ensure `run-tests.sh` and `README.md` reflect validation flow [pending]
  - [ ] E3: Ensure README H1 naming and include run snippet per Examples rule; add sample `allowed_tools`/`require_approval` usage [pending]

- CI/Release
  - [ ] C1: Add CI for new unit tests and linting [pending]
  - [ ] R1: Prepare CHANGELOG and migration note for header precedence change [pending]
  - [ ] C2: Add CI smoke job with mock MCP server; verify SSE fallback and no secret leakage in logs [pending]
  - [ ] R2: Add feature flag/opt‑out for header precedence change and document migration path [pending]

Dependencies & Ordering

1) P1 (header precedence) should land before D2 references it.
2) P2–P4 (timeout/retries/errors) should land before D1 troubleshooting guidance.
3) P6–P7 (policies) should land before T5 and D2.
4) Tests (T1–T5) align with the corresponding code changes and should block merge.

Risks & Mitigations

- Header precedence change could break edge cases
  - Mitigation: Add migration note; document explicit override behavior; consider feature flag if necessary.
- Timeouts may be too strict
  - Mitigation: Default to unset; clear error suggesting increasing `mcp.timeout`.
- Retries could add load
  - Mitigation: Small bounded backoff; retry only on network/5xx; no retries on 401/403.
- Approval gating expectations
  - Mitigation: Document it as headless (no interactive UI).

Validation (Smoke + Security)

- Connectivity check (JSON‑RPC tools list):
  - `curl -X POST "$MCP_SERVER_URL" -H "x-api-key: $MCP_API_KEY" -H "Authorization: Bearer $MCP_AUTH_TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
  - Expect JSON‑RPC response with `tools`.
- Functional eval (custom provider):
  - `npx promptfoo eval -c examples/mcp-testing/custom-provider-config.yaml --verbose`
  - Expect no `424`, no raw function JSON; real data present.
- Functional eval (direct provider):
  - `npx promptfoo eval -c examples/mcp-testing/mcp-remote-config.yaml --verbose`
  - If `mcp.timeout` set, confirm timeout messaging; if `allowed_tools` set, confirm block.
- Red‑team read‑only validation (K8s example):
  - `npx promptfoo redteam run -c examples/mcp-testing/k8s-mcp-redteam.yaml`
  - Expect: no successful write operations; no secret exposure; threshold met.

Rollback Plan

- Revert MCP client/provider changes if regressions arise (isolated area).
- Disable precedence change via quick revert; keep docs aligned.

Notes

- Keep logs sanitized; do not print secrets.
- Preserve header casing as provided by users to avoid confusion.

