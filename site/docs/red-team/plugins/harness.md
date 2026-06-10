---
sidebar_label: Harness Preflight Plugins
description: Validate a coding-agent red-team harness with known-good and known-bad agents, canary placement, workspace isolation, network traps, trace and replay coverage, redaction, cleanup, budgets, and result integrity
---

# Harness Preflight Plugins

`harness:preflight` tests the eval range before you test a real coding agent. It should be part of every coding-agent red team.

```yaml
redteam:
  plugins:
    - harness:preflight
```

## Plugins

| Plugin                                                                                               | Tests                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`harness:policy-applied`](/docs/red-team/plugins/harness/policy-applied/)                           | The launched sandbox, network, approval, root, home, env, model, MCP, connector, browser, trace, and subagent policy matches the promptfoo config.                                                          |
| [`harness:workspace-isolation`](/docs/red-team/plugins/harness/workspace-isolation/)                 | Sibling repos, homes, temp paths, caches, mounted secrets, Docker socket, SSH agent, browser profile, and outside canaries are outside the target workspace.                                                |
| [`harness:secret-placement`](/docs/red-team/plugins/harness/secret-placement/)                       | Canaries are only in intended harness-only files, env, traps, or connector fixtures and absent from prompts, vars, goldens, grader prompts, safe stubs, traces, and reports.                                |
| [`harness:network-trap-coverage`](/docs/red-team/plugins/harness/network-trap-coverage/)             | Known-bad HTTP, HTTPS, DNS, raw socket, git, package manager, browser, telemetry, MCP, and webhook probes reach the owned trap when observation is expected.                                                |
| [`harness:artifact-redaction`](/docs/red-team/plugins/harness/artifact-redaction/)                   | Reports, traces, logs, HTML, JSON, JUnit, screenshots, replay bundles, UI payloads, and failures name the leak location without repeating raw canaries.                                                     |
| [`harness:known-bad-agent`](/docs/red-team/plugins/harness/known-bad-agent/)                         | A malicious stub that reads, prints, traces, copies, writes, or exfiltrates a canary fails.                                                                                                                 |
| [`harness:known-good-agent`](/docs/red-team/plugins/harness/known-good-agent/)                       | A safe stub that performs only the requested edit passes without false trap, canary, policy, hidden-write, lingering-process, or bogus-finding failures.                                                    |
| [`harness:state-reset`](/docs/red-team/plugins/harness/state-reset/)                                 | Homes, sessions, memory, browser profiles, tmp, package caches, venvs, containers, git, promptfoo cache, provider pools, env, network, MCP, and connector fixtures reset between cells.                     |
| [`harness:grader-injection-resistance`](/docs/red-team/plugins/harness/grader-injection-resistance/) | Target transcripts, terminal logs, traces, tool results, connector data, markdown, screenshots, and comments cannot instruct graders to pass.                                                               |
| [`harness:replay-completeness`](/docs/red-team/plugins/harness/replay-completeness/)                 | The saved bundle reproduces controlled failures with config, target, policy, versions, canary manifest, trap log, trace id, transcript, patch, env recipe, and command.                                     |
| [`harness:version-attestation`](/docs/red-team/plugins/harness/version-attestation/)                 | Reported Codex, promptfoo, provider, model, sandbox, proxy, OS/container, MCP, connector, plugin, git, package, browser, trap, and policy versions match launched processes.                                |
| [`harness:cleanup`](/docs/red-team/plugins/harness/cleanup/)                                         | Failed, timed-out, crashed, or malicious targets do not leave processes, ports, jobs, automations, containers, browser state, temp files, package cache changes, config changes, MCP servers, or listeners. |
| [`harness:resource-budget`](/docs/red-team/plugins/harness/resource-budget/)                         | stdout/stderr, trace volume, file creation, processes, browser tabs, network attempts, recursion, wall time, tokens, cost, retries, and child agents are capped and reported.                               |
| [`harness:result-integrity`](/docs/red-team/plugins/harness/result-integrity/)                       | The target cannot modify promptfoo results, HTML/JSON/JUnit reports, traces, databases, caches, summary verdicts, grading prompts, config, or upload payloads.                                              |

## Planned plugin candidates

These pages capture additional risk lanes that should be promoted to real plugins after generation, deterministic evidence, and QA fixtures exist. They are not included in the current built-in plugin constants.

| Candidate                                                                                                             | Planned risk area                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`harness:monitor-integration-regression`](/docs/red-team/plugins/harness/candidates/monitor-integration-regression/) | A red-team range can silently stop observing the very sinks its plugins depend on.                                                                                        |
| [`harness:identity-binding`](/docs/red-team/plugins/harness/candidates/identity-binding/)                             | Evidence is unreliable when target sessions, credentials, traces, containers, connectors, replay bundles, and result rows are not bound to the same eval case and tenant. |
| [`harness:control-plane-secret-isolation`](/docs/red-team/plugins/harness/candidates/control-plane-secret-isolation/) | Secrets can leak before the agent starts if orchestration payloads, queues, workflow UIs, result DBs, or provider raw blobs carry them.                                   |
| [`harness:host-mount-integrity`](/docs/red-team/plugins/harness/candidates/host-mount-integrity/)                     | Container and sandbox mounts can accidentally expose host devices, docker sockets, package caches, SSH agents, browser profiles, keychains, or agent homes.               |
| [`harness:egress-proxy-bypass-techniques`](/docs/red-team/plugins/harness/candidates/egress-proxy-bypass-techniques/) | Network controls need coverage beyond ordinary HTTP requests.                                                                                                             |

## Pass criteria

A useful preflight produces one safe pass, one controlled failure, a trace id, a redacted report, a trap log, a replay command, a version/policy manifest, cleanup evidence, and a canary scan of every persisted artifact.

After preflight passes, add [`coding-agent:core`](/docs/red-team/plugins/coding-agent) or [`coding-agent:codex`](/docs/red-team/plugins/coding-agent).
