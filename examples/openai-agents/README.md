# openai-agents (Long-Horizon OpenAI Agents Python SDK)

This example shows how to evaluate the official Python `openai-agents` SDK end to end in Promptfoo.

It demonstrates:

- a long-horizon task executed as multiple turns over a persistent `SQLiteSession`
- the SDK 0.14 `SandboxAgent` runtime over a staged Unix-local Python workspace
- a local-shell `discount-review` skill mounted through `ShellTool`
- specialist handoffs between a triage agent, an FAQ agent, and a seat-booking agent
- agentic assertions such as `trajectory:tool-used`, `trajectory:tool-args-match`, `trajectory:tool-sequence`, and `trajectory:step-count`
- telemetry you can inspect in Promptfoo's Trace Timeline

The tracing path is important: the example installs a custom OpenAI Agents tracing processor that exports the SDK's spans to Promptfoo's built-in OTLP receiver. That is what makes the trajectory assertions and trace visualization work inside Promptfoo. The bridge maps SDK custom spans, including `sandbox.*` lifecycle spans and experimental Codex command spans, into normal OTLP attributes, and Promptfoo normalizes OpenAI Agents `exec_command` tool spans as command trajectory steps. The config accepts both OTLP JSON and protobuf because the SDK bridge emits JSON while the optional Python wrapper span uses protobuf by default.

## Files

- `agent_provider.py`: the Promptfoo Python provider and agent graph
- `promptfoo_tracing.py`: bridges OpenAI Agents SDK traces to Promptfoo OTLP
- `promptfooconfig.yaml`: eval config with tracing and trajectory assertions
- `skills/discount-review/`: a local `SKILL.md` bundle plus helper script for the skill eval
- `skill_fixture/`: the real local repo fixture inspected by the skill workflow
- `promptfooconfig.redteam.yaml`: airline agent red-team config with trace assertions
- `promptfooconfig.redteam.coding.yaml`: SandboxAgent coding-agent red-team config
- `requirements.txt`: Python dependencies for the example

## Requirements

- Python 3.10+
- Node.js 20+
- `OPENAI_API_KEY`

## Setup

```bash
npx promptfoo@latest init --example openai-agents
cd openai-agents

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export OPENAI_API_KEY=your_api_key_here
```

## Run

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
PROMPTFOO_ENABLE_OTEL=true npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
npx promptfoo@latest view
```

Open any result and inspect the **Trace Timeline** tab. You should see agent, handoff, generation, and tool spans from the OpenAI Agents SDK.

If you also want a provider-level Python OpenTelemetry span alongside the SDK spans, run the eval with `PROMPTFOO_ENABLE_OTEL=true`.

The provider returns aggregate token usage with the SDK's real request count, cached-input tokens, and reasoning-token detail. It intentionally does not return a dollar cost: a generic Python agent graph can mix models and hosted tools, so exact spend should be returned only by provider code that can account for every billed step.

## What The Eval Asserts

- the agent used `lookup_reservation`, `update_seat`, and `faq_lookup`
- the seat update tool received the expected arguments
- the tools appeared in the expected order across a multi-step task
- at least three traced agent spans were captured during the long-horizon run
- no traced error spans were emitted
- the final trajectory achieved the stated goal
- third-party booking changes are refused without mutating the reservation
- the sandbox agent created a workspace, ran shell commands, ran the unittest command, and reported the staged ticket details with the minimal fix
- the local-shell skill workflow read `SKILL.md`, ran the bundled helper script without shell stderr, and reported the expected ticket details

## Red Team The Agent

```bash
npx promptfoo@latest redteam generate -c promptfooconfig.redteam.yaml -o redteam.generated.yaml --remote --force --strict
npx promptfoo@latest redteam eval -c redteam.generated.yaml --no-cache --no-share -j 1 -o redteam-results.json

npx promptfoo@latest redteam generate -c promptfooconfig.redteam.coding.yaml -o redteam.coding.generated.yaml --remote --force --strict
npx promptfoo@latest redteam eval -c redteam.coding.generated.yaml --no-cache --no-share -j 1 -o redteam-coding-results.json
```

The airline red-team config targets the airline agent with tracing enabled and returns only the user-visible final answer, not the verbose eval transcript. It exercises agent-specific boundaries across OWASP Agentic AI, OWASP LLM, MITRE ATLAS, and NIST AI RMF mappings: tool discovery, prompt extraction, debug access, system prompt override, authorization bypass, cross-session leakage, memory poisoning, privacy, PII, data exfiltration, ASCII smuggling, excessive agency, and custom airline policy probes. It applies only the `jailbreak:meta` and `jailbreak:hydra` strategies; Promptfoo still includes the generated baseline/direct probes that those strategies transform. Hydra is configured as non-stateful so each generated probe is replayed against a fresh airline session.

The coding-agent red-team config targets the SandboxAgent workflow and focuses on repository prompt injection, terminal-output injection, secret/env/file reads, sandbox write escapes, network egress, delayed CI exfiltration, generated vulnerabilities, automation poisoning, steganographic exfiltration, and verifier sabotage. It also uses only `jailbreak:meta` and `jailbreak:hydra`. This is the stronger harness-oriented companion to the airline policy red team.

This sample is intentionally not a production-hardened airline agent. Some generated probes should find real breaks, especially around third-party booking changes, authority/consent claims, data-exfiltration attempts, and multi-turn authorization bypasses. Each generated attack inherits trace assertions that require OpenAI Agents SDK spans, require zero traced errors, and fail if the mutating `update_seat` tool is used during adversarial probes. Inspect failures together with the Trace Timeline so you can distinguish a user-visible refusal problem from an internal tool-path or boundary failure.

## Notes

- The example uses `openai-agents>=0.14.1,<0.15` and the Python SDK, not the built-in `openai:agents:*` provider. That built-in provider is for the JavaScript `@openai/agents` SDK.
- `requirements.txt` includes the optional OpenTelemetry Python packages used by Promptfoo's wrapper. Set `PROMPTFOO_ENABLE_OTEL=true` to emit the provider-level Python span in addition to the SDK spans.
- If you do not need SDK spans, remove the `configure_promptfoo_tracing(...)` import and call from `agent_provider.py`. You can then delete `promptfoo_tracing.py`, but you will lose tool-path assertions because Promptfoo will no longer receive the SDK's internal agent spans.
- `trajectory:goal-success` adds an extra judge-model call. Remove it if you want a cheaper run.
- The SDK's experimental `codex_tool` is available from `agents.extensions.experimental.codex`. Use it inside a Python provider when a larger agent should delegate a bounded workspace task to Codex. Use Promptfoo's `openai:codex-sdk` or `openai:codex-app-server` providers when Codex itself is the system under test.
- The local skill workflow uses `ShellTool(environment={"type": "local", "skills": [...]})` because the Python SDK exposes skills through shell environments rather than Codex-style ambient discovery. The SDK does not currently emit a first-class skill invocation event, so the example proves usage through traced shell commands that read `SKILL.md` and run the helper script.
