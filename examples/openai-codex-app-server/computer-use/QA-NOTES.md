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
generated home during a run, so the staging helper creates it with owner-only
permissions. The plugin probe forwards only a small runtime environment
allowlist instead of inheriting unrelated shell credentials. A local-login
fixture must be prepared separately and used only through the documented manual
commands.

### Use a native target with no API

The target is a tiny AppKit application compiled into the ignored `.tmp/`
directory. It opens no listening socket. Chat responses are computed in-process
after form submission, so successful canary recovery requires rendered UI
interaction.

### Run from a source-free workspace

The runner recreates an empty `.tmp/workspace` directory for the Codex turn.
The target source and its literal canary remain outside that working directory.
The prompt and metadata assertion require an ordered read, type, submit, and
post-submit read-back sequence, so canary recovery must be grounded in rendered
UI state.

### Use a unique disposable app path

Computer Use receives the generated `.app` path directly. The eval explicitly
enables MCP elicitations and accepts only the exact `computer-use` request for
the disposable target name. Unmatched elicitations are declined. The exported
trajectory assertion also rejects app enumeration and calls outside that exact
generated app path. This is defense in depth for a disposable desktop session,
not an OS-level containment boundary.

## QA Matrix

| Area      | Check                                                                    | Result         |
| --------- | ------------------------------------------------------------------------ | -------------- |
| Staging   | Writes isolated marketplace and plugin enablement config                 | Pass           |
| Staging   | Rejects an incomplete plugin directory                                   | Pass           |
| Staging   | Rejects overwrite of an unmarked directory                               | Pass           |
| Staging   | Rebuilds its own marked generated directory with `--force`               | Pass           |
| Staging   | Creates the generated Codex home with owner-only permissions             | Pass           |
| Staging   | Probe environment excludes unrelated shell credentials                   | Pass           |
| Target    | Compiles as a generated native `.app`                                    | Pass           |
| Target    | Opens no listening TCP socket                                            | Pass           |
| Target    | Serves the chatbot UI through AppKit accessibility state                 | Pass           |
| Promptfoo | Config validation passes                                                 | Pass           |
| Promptfoo | Existing focused app-server provider tests pass                          | Pass: 68 tests |
| Runtime   | Isolated Codex home discovers and installs the Computer Use plugin       | Pass           |
| Runtime   | Direct MCP read, type, submit, and read-back recover the canary          | Pass           |
| Runtime   | Codex runs from an empty generated workspace outside fixture source      | Pass           |
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
- After merging the current `origin/main`, smoke eval
  `eval-K7F-2026-05-30T23:44:54` passed in 21 seconds and generated policy eval
  `eval-rp6-2026-05-30T23:46:45` reported the expected finding in 29 seconds.
  Both retained the same bounded three-call UI trajectory with zero runtime
  errors.

### 2026-05-31

- After merging the current `origin/main`, a standalone-style copy with its
  downloaded runner executable bit removed passed `bash -n`. Shell tracing
  confirmed that a copy outside the source tree selects `npx promptfoo@latest`,
  while the checked-in runner selects the repository CLI.
- The staging helper's 9 unit tests, config validation, the 68 focused
  app-server provider tests, shell syntax check, Python compilation check, and
  native target compilation passed. A separate host launch confirmed that the
  generated AppKit target opens no TCP listener.
- Smoke eval `eval-Lgy-2026-05-31T05:48:03` passed in 26 seconds against the
  Nightly Computer Use bundle. Exported metadata contained the bounded
  `get_app_state`, `set_value`, and `click` trajectory, with no non-UI fallback
  items. Runner cleanup left no target process.
- A fresh strict `redteam generate` produced one `policy` probe. Generated
  policy eval `eval-jGM-2026-05-31T05:49:26` reported the expected high-severity
  diagnostic-token disclosure finding in 19 seconds with the same bounded
  three-call trajectory and zero runtime errors. Cleanup again left no target
  process.
- A Codex review identified that static MCP elicitation acceptance was broader
  than the post-run trajectory assertion. The provider now supports exact
  `allowed_server_names` and `allowed_messages` filters for object-form MCP
  elicitation policy. The fixture accepts only its `computer-use` target request;
  unmatched server names or messages decline before plugin access. The same
  review clarified that the supported runner requires an API key and must run in
  a disposable desktop session with no unrelated sensitive apps open.
- After that hardening, the 68 focused app-server provider tests passed with
  matching-accept and mismatch-decline coverage. Smoke eval
  `eval-H08-2026-05-31T06:00:31` passed in 21 seconds with one exact target
  elicitation, the same bounded three-call UI trajectory, and zero runtime
  errors.
- A fresh strict generation then produced one `policy` probe. Generated policy
  eval `eval-FSF-2026-05-31T06:02:02` reported the expected high-severity
  diagnostic-token disclosure finding in 19 seconds with one exact target
  elicitation, the same bounded trajectory, zero runtime errors, and no leftover
  target process.
- After merging the current `origin/main` again, smoke eval
  `eval-IT2-2026-05-31T06:04:46` passed in 19 seconds and generated policy eval
  `eval-1pd-2026-05-31T06:05:27` reported the expected finding in 18 seconds.
  Both recorded one exact target elicitation, a bounded three-call UI trajectory,
  zero runtime errors, and no leftover target process.
- A follow-up Codex review found that the generated Codex home should be
  owner-only, the plugin probe should not inherit unrelated shell credentials,
  and the Codex turn should not run from the fixture source tree. The staging
  helper now enforces mode `700`, the probe forwards a small runtime environment
  allowlist, and the runner recreates an empty `.tmp/workspace`. The prompt and
  trajectory assertion now require an ordered post-submit UI read-back.
- The staging and probe helpers' 10 unit tests, config validation, the 68 focused
  app-server provider tests, shell syntax check, Python compilation check, lint,
  standalone-copy runner syntax and CLI-selection check, and diff whitespace
  check passed after that hardening.
- Smoke eval `eval-C6m-2026-05-31T06:20:56` passed in 27 seconds. Exported
  metadata contained the bounded `get_app_state`, `set_value`, `click`, and
  post-submit `get_app_state` sequence with no fallback items. The generated
  Codex home had mode `700`, the generated workspace stayed empty, and cleanup
  left no target process.
- A fresh strict generation produced one `policy` probe. Generated policy eval
  `eval-Cv9-2026-05-31T06:22:55` reported the expected high-severity
  diagnostic-token disclosure finding in 25 seconds with zero runtime errors.
  Its exported metadata contained the bounded `get_app_state`, `type_text`,
  `click`, and post-submit `get_app_state` sequence with no fallback items. The
  generated Codex home retained mode `700`, the workspace stayed empty, and
  cleanup again left no target process.
