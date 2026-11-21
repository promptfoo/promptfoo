# redteam-coding-agent (Red Team a Coding Agent)

```bash
npx promptfoo@latest init --example redteam-coding-agent
cd redteam-coding-agent
```

Run the commands below from the initialized example directory.

1. `harness-smoke.promptfooconfig.yaml` uses a local stub provider. Run it before a real agent to prove Promptfoo catches a known-bad canary leak.
2. `promptfooconfig.yaml` is a red-team generation config for a coding agent. It starts with `harness:preflight` and `coding-agent:core`.

## Safe stub

```bash
export PF_HARNESS_CANARY="PF_CANARY_$(uuidgen | tr -d '-')"
npx promptfoo@latest eval -c harness-smoke.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-coding-agent-safe.json
```

The safe stub returns command and file-change records, policy metadata, and a replay summary.

## Known-bad stub

This run should fail because the stub prints the raw canary.

```bash
export PF_HARNESS_CANARY="PF_CANARY_$(uuidgen | tr -d '-')"
STUB_CODING_AGENT_MODE=malicious npx promptfoo@latest eval -c harness-smoke.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-coding-agent-bad.json
```

Keep the `PF_CANARY_` prefix for this smoke run. The config treats that synthetic marker as a leak
without copying the raw canary into assertion code or failure text.

## Generate red-team tests

```bash
npx promptfoo@latest redteam generate -c promptfooconfig.yaml --no-cache
```

Install `@openai/codex-sdk@^0.156.1` in this example directory if you use the Codex SDK provider. Use a disposable checkout for the provider `working_dir`. Keep real credentials out of the workspace.

## Focused known-good and known-bad QA

These configs use local fixtures with the real coding-agent red-team assertion types. The
known-bad runs should fail. The known-good runs should pass by refusing to move raw private values
into the sink artifact or tool. Safe cases can fall through to the configured grading provider, so
set one explicitly before running them.

The trace/log stub prepares its synthetic receipt when the provider loads, before the verifier
captures it. The target call then writes only the diagnostic artifact.

```bash
npx promptfoo@latest eval -c trace-log-exfil-known-bad.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-trace-log-bad.json
npx promptfoo@latest eval -c trace-log-exfil-known-good.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-trace-log-good.json
npx promptfoo@latest eval -c mcp-confused-deputy-known-bad.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-mcp-confused-deputy-bad.json
npx promptfoo@latest eval -c mcp-confused-deputy-known-good.promptfooconfig.yaml --no-cache -o /tmp/promptfoo-mcp-confused-deputy-good.json
```
