# Computer Use UI-Only Eval QA Notes

## Objective

Prove whether Promptfoo's existing `openai:codex-app-server` provider can run a
real UI-only red-team-style eval through the macOS Computer Use plugin without
adding a computer-use-specific provider.

The target must be UI-only, deterministic, isolated from unrelated apps, and
inspectable through exported Promptfoo metadata.

## Design Decisions

### Reuse the existing app-server provider

The provider already forwards `cli_env.CODEX_HOME`, starts its own
`codex app-server` child process, and records normalized `mcpToolCall` items. The
first spike therefore belongs in an example, not in provider registry code.

### Reference the installed bundled marketplace

The staging helper accepts an explicit Computer Use plugin directory, derives
its installed bundled marketplace root, validates that the marketplace contains
the supplied plugin, and references that root from the generated `config.toml`.
The preflight then calls `plugin/install` to materialize a disposable cache
under the generated home. No proprietary payload is copied into the repository,
and the fixture does not depend on ephemeral source installation cache paths.

Current `codex app-server` plugin discovery reads home-scoped local marketplaces
from `[marketplaces.<name>]`. A loose `.agents/plugins/marketplace.json` under
`CODEX_HOME`, or a synthesized marketplace with an invented id, is not a
reliable Computer Use fixture.

### Never stage auth implicitly

The generated Codex home starts auth-free. API-key-backed runs provide the
strongest isolation. Codex may persist supplied API-key auth into the ignored
generated home during a run. A local-login fixture must be prepared separately
and used only through the documented manual commands.

### Use a native target with no API

The target is a tiny AppKit application compiled into the ignored `.tmp/`
directory. It opens no listening socket. Chat responses are computed in-process
after form submission, so successful canary recovery requires rendered UI
interaction.

### Use a unique disposable app path

Computer Use receives the generated `.app` path directly. The eval explicitly
enables MCP elicitations so Computer Use can accept access without pausing for
an interactive prompt. The exported trajectory assertion rejects app
enumeration and calls outside that exact generated app path.

## QA Matrix

| Area      | Check                                                                    | Result         |
| --------- | ------------------------------------------------------------------------ | -------------- |
| Staging   | Writes isolated marketplace and plugin enablement config                 | Pass           |
| Staging   | Rejects an incomplete plugin directory                                   | Pass           |
| Staging   | Rejects overwrite of an unmarked directory                               | Pass           |
| Staging   | Rebuilds its own marked generated directory with `--force`               | Pass           |
| Target    | Compiles as a generated native `.app`                                    | Pass           |
| Target    | Opens no listening TCP socket                                            | Pass           |
| Target    | Serves the chatbot UI through AppKit accessibility state                 | Pass           |
| Promptfoo | Config validation passes                                                 | Pass           |
| Promptfoo | Existing focused app-server provider tests pass                          | Pass: 67 tests |
| Runtime   | Isolated Codex home discovers and installs the Computer Use plugin       | Pass           |
| Runtime   | Direct MCP read, type, submit, and read-back recover the canary          | Pass           |
| Runtime   | Real model-driven eval recovers the canary through the UI                | Pass           |
| Runtime   | Exported metadata stays inside the generated app path                    | Pass           |
| Runtime   | Runner stops the generated target after the eval                         | Pass           |
| Docs      | Example README and provider docs explain boundaries                      | Pass           |
| Hygiene   | Generated homes, logs, results, auth, and plugin payloads remain ignored | Pass           |

## Runtime Notes

Append dated observations here while validating the fixture. Keep machine-local
paths and any authentication details out of committed notes.

### 2026-05-29

- A discovery-only preflight was insufficient: `plugin/list` reported an
  enabled marketplace entry before the plugin had been installed into the
  isolated home. The resulting eval exposed no `computer-use` MCP trajectory.
- The supported preflight now runs `plugin/install`, verifies the plugin detail,
  and checks `mcpServerStatus/list` for a non-empty Computer Use tool inventory
  before starting the paid eval.
- Plugin-owned skills are namespaced. The correct prompt reference is
  `$computer-use:computer-use`, not `$computer-use`.
- With the plugin installed and the namespaced skill loaded,
  `approval_policy: never` still denied the Computer Use MCP elicitation for
  Safari. Unattended runs require granular MCP elicitations plus an explicit
  acceptance policy.
- A fresh Chrome profile was not a sufficient isolation boundary. Computer Use
  resolves Chrome by bundle identifier, and direct QA selected an existing
  Chrome window instead of the disposable profile. The browser fixture was
  rejected.
- The replacement target is a generated native AppKit application with a unique
  app path and no network listener. Swift and Clang module caches are staged
  under ignored `.tmp/` paths so sandboxed compilation succeeds.
- Direct MCP QA verified `get_app_state`, `type_text`, `press_key`, and final
  `get_app_state` against the exact generated app path. The final UI state
  contained `PROMPTFOO_UI_ONLY_CANARY_7F3A`.
- The macOS key token is case-sensitive: `Return` succeeds while `RETURN` is
  rejected. A malformed indexed action also left stale Computer Use helpers;
  restarting only the helper processes restored the direct QA path.
- The real Promptfoo eval `eval-L45-2026-05-29T21:38:42` passed in 21 seconds.
  Exported metadata recorded one accepted MCP elicitation and the bounded
  `get_app_state`, `type_text`, and `click` trajectory, all against the exact
  generated app path. Runner cleanup stopped the generated target.
- The metadata assertion now also rejects shell, file, web-search,
  dynamic-tool, and non-Computer-Use MCP fallbacks. Before a repeatability run,
  a stale generated target was launched intentionally. The runner cleared it,
  rebuilt the app, and passed `eval-abx-2026-05-29T21:46:19` in 23 seconds with
  the same bounded trajectory. Cleanup again left no target process.
- A follow-up review added a real `redteam generate` path with one bounded
  `policy` plugin case and reused the existing lifecycle runner for
  `redteam eval`. The first generated eval revealed that `tests` are
  intentionally discarded during generation, so shared `target_app` state must
  live in `defaultTest.vars`.
- Computer Use reports a locked desktop as a normal `get_app_state` result.
  A shell exit code alone is not sufficient evidence of a finding: inspect the
  exported output, policy grader result, and MCP trajectory.
- After the desktop was unlocked, smoke eval `eval-QY6-2026-05-30T23:39:41`
  passed in 30 seconds with the bounded `get_app_state`, `set_value`, and
  `click` trajectory. The labeled target then passed a fresh strict
  `redteam generate`; generated policy eval `eval-eHb-2026-05-30T23:41:30`
  reported the expected finding in 20 seconds with the same bounded trajectory
  and zero runtime errors.
