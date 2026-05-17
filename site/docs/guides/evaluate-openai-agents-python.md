---
title: Evaluate OpenAI Agents (Python SDK)
description: Evaluate the Python openai-agents SDK with Promptfoo tracing, SandboxAgent workflows, trace assertions, and agent red teams.
sidebar_position: 26
---

# Evaluate OpenAI Agents (Python SDK)

Use the Python `openai-agents` SDK with Promptfoo by wrapping your agent as a Python provider. This gives you full control over agent code, tools, sessions, and framework-specific tracing, while still letting Promptfoo score outputs and assert on the traced workflow.

:::note
The built-in [`openai:agents:*` provider](/docs/providers/openai-agents) is for the JavaScript `@openai/agents` SDK. For the Python SDK, use the Python provider path described here.
:::

## Quick Start

```bash
npx promptfoo@latest init --example openai-agents
cd openai-agents

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export OPENAI_API_KEY=your_api_key_here

# Run the eval
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache

# Optional: also emit a provider-level Python OpenTelemetry span
PROMPTFOO_ENABLE_OTEL=true npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
npx promptfoo@latest view
```

## What The Example Covers

- multi-turn execution over a persistent `SQLiteSession`
- SDK 0.14 `SandboxAgent` execution over a staged Unix-local Python workspace
- local-shell skill mounting with `ShellTool(environment={"type": "local", "skills": [...]})`
- specialist handoffs between a triage agent, an FAQ agent, and a seat-booking agent
- Promptfoo trace ingestion of the SDK's internal spans
- assertions on tool usage, tool arguments, sandbox commands, agent spans, tool order, and overall task success

## How The Tracing Works

Promptfoo can only assert on tool paths if it receives the agent's internal spans. The example does that by installing a custom `TracingProcessor` for the OpenAI Agents SDK and exporting those spans to Promptfoo's OTLP receiver.

At a high level:

1. Promptfoo enables tracing and injects a W3C `traceparent` into the Python provider context.
2. The example parses that trace context and configures a custom OpenAI Agents tracing processor.
3. The processor converts OpenAI Agents spans into OTLP JSON.
4. Promptfoo ingests those spans and makes them available in the Trace Timeline and `trajectory:*` assertions.

If you skip this exporter, Promptfoo will not see the SDK's tool and handoff spans, so `trajectory:*` assertions will not have the trace data they need.

If you also enable Promptfoo's Python OpenTelemetry wrapper instrumentation with `PROMPTFOO_ENABLE_OTEL=true`, the example will emit a provider-level Python span as well. The custom SDK spans will inherit that active OpenTelemetry span as their parent. The example config accepts both OTLP JSON and OTLP/protobuf because the SDK bridge emits JSON while the wrapper exporter uses protobuf by default.

SDK 0.14 adds custom spans for sandbox lifecycle work, and the SandboxAgent's shell tool emits `exec_command` function-tool spans. The example bridge maps SDK custom spans into normal OTLP attributes such as `sandbox.operation`, `command`, and `process.exit.code`, while Promptfoo normalizes OpenAI Agents `exec_command` tool spans as command trajectory steps. The same mapping also exposes command spans emitted by the SDK's experimental Codex tool as `command` and `codex.command`.

## Assertion Pattern

The example config asserts on the agent's actual behavior instead of only the final message:

```yaml
vars:
  steps_json: |
    [
      "My name is Ada Lovelace and my confirmation number is ABC123.",
      "Move me to seat 14C.",
      "Also, what is the baggage allowance?"
    ]

assert:
  - type: trajectory:tool-used
    value:
      - lookup_reservation
      - update_seat
      - faq_lookup

  - type: trajectory:tool-args-match
    value:
      name: update_seat
      args:
        confirmation_number: ABC123
        new_seat: 14C
      mode: partial

  - type: trajectory:tool-sequence
    value:
      steps:
        - lookup_reservation
        - update_seat
        - faq_lookup

  - type: trajectory:step-count
    value:
      type: span
      pattern: 'agent *'
      min: 3

  - type: trace-error-spans
    value:
      max_count: 0
```

Use `trajectory:goal-success` when you want a judge model to decide whether the traced workflow actually completed the task, not just whether it hit the right tool path.

## Long-Horizon Tasks

The example turns one eval row into a long-horizon task by passing a JSON-encoded list of user turns in `vars.steps_json`. The provider parses that JSON and executes the turns sequentially against a shared `SQLiteSession`, which lets the SDK preserve working memory across turns inside a single Promptfoo test case.

The example also returns `tokenUsage.numRequests`, cached-input tokens, and reasoning-token detail from the SDK's raw model responses. That preserves the real multi-call footprint of handoffs and tool/model loops instead of collapsing every eval row to one request.

That pattern is useful when you want to evaluate:

- multi-step workflows that need memory
- agent handoffs over time
- task completion after several intermediate actions
- regressions in tool usage across longer trajectories

Promptfoo does not infer a dollar `cost` for this path automatically. A Python provider can mix models, hosted tools, and custom backends inside one agent graph, while the SDK's aggregate usage objects do not identify the priced model for each request. Return `cost` from your provider only when you can account for every billed model and hosted tool used by the run.

## Sandbox Agents

OpenAI Agents SDK 0.14 introduced `SandboxAgent`, `Manifest`, and `SandboxRunConfig` for agents that need a live filesystem. Promptfoo does not need a special provider for this path: keep using a Python provider and pass a sandbox run config to the SDK.

The bundled example follows the same shape as the SDK's official sandbox coding examples: stage a small repo with a task file, source file, tests, and maintainer instructions; force the agent to inspect the workspace through shell commands; then assert on both the answer and the trace.

```python
from agents import ModelSettings, Runner
from agents.run import RunConfig
from agents.sandbox import Manifest, SandboxAgent, SandboxRunConfig
from agents.sandbox.entries import File
from agents.sandbox.sandboxes.unix_local import UnixLocalSandboxClient

agent = SandboxAgent(
    name="Workspace analyst",
    model="gpt-5.4-mini",
    instructions="Inspect the workspace with shell before answering.",
    default_manifest=Manifest(
        entries={
            "repo/task.md": File(content=b"Find the high-severity issue."),
        }
    ),
    model_settings=ModelSettings(include_usage=True),
)

result = Runner.run_sync(
    agent,
    "Inspect the staged repo and summarize the issue.",
    run_config=RunConfig(
        sandbox=SandboxRunConfig(client=UnixLocalSandboxClient()),
    ),
)
```

The bundled example includes a `sandbox-workflow` provider label and a sandbox test that asserts the agent reported the staged ticket, ran the requested unittest command, and emitted the expected sandbox trace shape:

```yaml
assert:
  - type: trace-span-count
    value:
      pattern: tool exec_command
      min: 2
  - type: trace-span-count
    value:
      pattern: sandbox.start
      min: 1
  - type: trace-span-count
    value:
      pattern: response *
      min: 2
  - type: trajectory:step-count
    value:
      type: command
      pattern: '*unittest*'
      min: 1
```

Use `UnixLocalSandboxClient` for local development, `DockerSandboxClient` when you need container isolation, and hosted sandbox clients when your application already depends on managed execution. Keep credentials and secrets out of staged `Manifest` files unless the sandbox backend and trace redaction policy are appropriate for that data.

## Skills

The Python SDK exposes Agent Skills through shell environments rather than through Codex-style ambient discovery. For a local, reproducible eval, mount the skill on `ShellTool` explicitly. The bundled example also defines a small `SkillShellExecutor` that runs those local shell commands:

```python
from pathlib import Path

from agents import Agent, ShellTool

discount_review_skill = {
    "name": "discount-review",
    "description": "Inspect the discount policy fixture with the bundled checklist.",
    "path": "/path/to/skills/discount-review",
}

agent = Agent(
    name="Local Skill Analyst",
    instructions="Use the discount-review skill for discount-policy review tasks.",
    tools=[
        ShellTool(
            environment={
                "type": "local",
                "skills": [discount_review_skill],
            },
            executor=SkillShellExecutor(cwd=Path(__file__).parent),
        )
    ],
)
```

The bundled `skill-workflow` example keeps the task small on purpose: it mounts a `discount-review` skill, asks the agent to inspect a local fixture repo, and has the skill run a helper script before answering.

```yaml
assert:
  - type: trajectory:step-count
    value:
      type: command
      pattern: '*discount-review/SKILL.md*'
      min: 1
  - type: trajectory:step-count
    value:
      type: command
      pattern: '*analyze_discount_policy.py*'
      min: 1
  - type: contains
    value: return discount_percent >= 20
  - type: not-contains
    value: 'stderr:'
```

Today, the Python SDK does not expose a first-class skill invocation event that Promptfoo can normalize into `skill-used`. For Python SDK skill evals, assert on the observable workflow instead: the skill file was read, the helper command ran cleanly, and the final answer reflects the skill's result. If your application already tracks selected skills, you can also return `metadata.skillCalls` from the Python provider yourself and use Promptfoo's [`skill-used`](/docs/configuration/expected-outputs/deterministic/#skill-used) assertion on top of that.

Hosted shell follows the same eval idea, but the attachment shape changes from a local path to a hosted `skill_reference`. Keep local shell for examples you want users to run from a fresh clone; use hosted shell when your product already depends on uploaded, versioned skills.

## Experimental Codex Tool

The Python SDK's Codex integration is available as `codex_tool` from `agents.extensions.experimental.codex`. It lets a regular Python SDK agent delegate a bounded workspace task to Codex during a tool call:

```python
from agents import Agent
from agents.extensions.experimental.codex import ThreadOptions, TurnOptions, codex_tool

agent = Agent(
    name="Repo assistant",
    instructions="Use Codex for repository inspection tasks.",
    tools=[
        codex_tool(
            sandbox_mode="workspace-write",
            working_directory="/path/to/repo",
            default_thread_options=ThreadOptions(
                model="gpt-5.4",
                model_reasoning_effort="low",
                approval_policy="never",
                web_search_mode="disabled",
            ),
            default_turn_options=TurnOptions(idle_timeout_seconds=60),
        )
    ],
)
```

Evaluate that agent through the same Python provider pattern. The example tracing bridge exposes Codex command execution spans as `command` and `codex.command`, so Promptfoo's trajectory assertions can verify that Codex actually inspected files or ran commands.

If Codex itself is the system under test, prefer Promptfoo's dedicated [`openai:codex-sdk`](/docs/providers/openai-codex-sdk) or [`openai:codex-app-server`](/docs/providers/openai-codex-app-server) providers. The app-server provider supports `approvals_reviewer: auto_review` (`guardian_subagent` remains a legacy alias); the Python `openai-agents` SDK 0.14.1 package does not expose a public automatic-review API.

## Red Team The Agent

The example includes two red-team configs. `promptfooconfig.redteam.yaml` targets the Python SDK airline agent with trace capture enabled. `promptfooconfig.redteam.coding.yaml` targets the `SandboxAgent` coding workflow and exercises coding-agent risks such as repository prompt injection, terminal-output injection, synthetic secret reads, sandbox write escapes, network egress, delayed CI exfiltration, generated vulnerabilities, automation poisoning, steganographic exfiltration, and verifier sabotage.

```bash
npx promptfoo@latest redteam generate -c promptfooconfig.redteam.yaml -o redteam.generated.yaml --remote --force --strict
npx promptfoo@latest redteam eval -c redteam.generated.yaml --no-cache --no-share -j 1 -o redteam-results.json

npx promptfoo@latest redteam generate -c promptfooconfig.redteam.coding.yaml -o redteam.coding.generated.yaml --remote --force --strict
npx promptfoo@latest redteam eval -c redteam.coding.generated.yaml --no-cache --no-share -j 1 -o redteam-coding-results.json
```

Both configs use only `jailbreak:meta` and `jailbreak:hydra` strategies; Promptfoo also includes the generated baseline/direct probes that those strategies transform. The target returns only the user-visible final answer, but each generated test inherits trace assertions so you can catch internal tool-path failures even when the final answer looks like a refusal. For example, the airline red team forbids traced `update_seat` calls during adversarial probes.

Keep generated corpora and result JSON files as local run artifacts unless you intentionally want to commit a fixed adversarial corpus. This sample is not production-hardened, so useful red-team runs should find some real breaks. Inspect failures alongside the Trace Timeline to separate output-only policy failures from internal tool-use or sandbox-boundary failures.

## Multimodal Input

The Python provider runs your own function, so you can pass structured multimodal input directly to `Runner.run_sync()` instead of a plain string:

```python
result = Runner.run_sync(
    agent,
    [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "What is in this image?"},
                {"type": "input_image", "image_url": f"data:image/jpeg;base64,{image_b64}"},
            ],
        }
    ],
)
```

Python SDK image input items use `image_url`; the JavaScript SDK examples use `image`.

## Telemetry

After the eval finishes, open the web UI and inspect the **Trace Timeline** for any row. You should see:

- a provider-level Python span when `PROMPTFOO_ENABLE_OTEL=true`
- agent spans
- handoff spans
- generation spans
- function-tool spans with tool names and arguments
- sandbox lifecycle spans such as `sandbox.start` and `sandbox.running` when using `SandboxAgent`
- shell command spans such as `tool exec_command`, normalized as command trajectory steps
- Codex command custom spans when using the SDK's experimental `codex_tool`

That same trace data powers `trace-span-*` and `trajectory:*` assertions.

## Related Docs

- [Python Provider](/docs/providers/python)
- [Tracing](/docs/tracing)
- [OpenAI Agents (JavaScript SDK)](/docs/providers/openai-agents)
