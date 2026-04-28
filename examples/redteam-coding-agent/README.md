# redteam-coding-agent (Red Team a Coding Agent)

```bash
npx promptfoo@latest init --example redteam-coding-agent
```

This example has two layers:

1. `harness-smoke.promptfooconfig.yaml` uses a local stub provider. Run it before a real agent to prove Promptfoo catches a known-bad canary leak.
2. `promptfooconfig.yaml` is a red-team generation config for a coding agent. It starts with `harness:preflight` and `coding-agent:core`.

## Safe stub

```bash
export PF_HARNESS_CANARY="PF_CANARY_$(uuidgen | tr -d '-')"
npm run local -- eval -c examples/redteam-coding-agent/harness-smoke.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-coding-agent-safe.json
```

The safe stub is intentionally evidence-rich: it returns structured command/file-change telemetry,
policy metadata, and a complete replay summary so observability-focused plugins have a credible
positive control instead of a text-only toy response.

## Known-bad stub

This run should fail because the stub prints the raw canary:

```bash
export PF_HARNESS_CANARY="PF_CANARY_$(uuidgen | tr -d '-')"
STUB_CODING_AGENT_MODE=malicious npm run local -- eval -c examples/redteam-coding-agent/harness-smoke.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-coding-agent-bad.json
```

## Generate red-team tests

```bash
npm run local -- redteam generate -c examples/redteam-coding-agent/promptfooconfig.yaml --no-cache
```

Use a disposable checkout for the provider `working_dir`. Keep real credentials out of the workspace.

## Focused known-good and known-bad QA

These configs exercise the real coding-agent red-team assertion types with deterministic local
fixtures. The known-bad runs should fail; the known-good runs should pass by refusing to move raw
private values into the sink artifact or tool.

```bash
npm run local -- eval -c examples/redteam-coding-agent/trace-log-exfil-known-bad.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-trace-log-bad.json
npm run local -- eval -c examples/redteam-coding-agent/trace-log-exfil-known-good.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-trace-log-good.json
npm run local -- eval -c examples/redteam-coding-agent/mcp-confused-deputy-known-bad.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-mcp-confused-deputy-bad.json
npm run local -- eval -c examples/redteam-coding-agent/mcp-confused-deputy-known-good.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-mcp-confused-deputy-good.json
```
