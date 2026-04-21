---
sidebar_position: 65
title: Evaluate Coding Agents
description: Evaluate Codex, Claude, OpenCode, and plain LLM coding agents with promptfoo, including provider choice, sandboxing, tracing, assertions, and QA runs.
---

# Evaluate Coding Agents

Coding agents present a different evaluation challenge than standard LLMs. A chat model transforms input to output in one step. An agent decides what to do, does it, observes the result, and iterates—often dozens of times before producing a final answer.

This guide covers coding agent evals with promptfoo: [OpenAI Codex SDK](/docs/providers/openai-codex-sdk), [OpenAI Codex app-server](/docs/providers/openai-codex-app-server), [Claude Agent SDK](/docs/providers/claude-agent-sdk), [OpenCode SDK](/docs/providers/opencode-sdk), and plain LLM baselines.

## Why agent evals are different

Standard LLM evals test a function: given input X, does output Y meet criteria Z? Agent evals test a system with emergent behavior.

**Non-determinism compounds.** A chat model's temperature affects one generation. An agent's temperature affects every tool call, every decision to read another file, every choice to retry. Small variations cascade.

**Intermediate steps matter.** Two agents might produce identical final outputs, but one read 3 files and the other read 30. Cost, latency, and failure modes differ dramatically.

**Capability is gated by architecture.** You can't prompt a plain LLM into reading files. The model might be identical, but the agent harness determines what's possible. This means you're evaluating the system, not just the model.

## Capability tiers

| Tier                      | Example providers                                                | Use when you need                                             | Watch for                                     |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| **0: Text**               | `openai:gpt-5.1`, `anthropic:claude-sonnet-4-6`                  | Code generation, explanation, JSON output, baseline behavior  | No file reads, shell commands, or tool traces |
| **1: Coding agent SDK**   | `openai:codex-sdk`, `anthropic:claude-agent-sdk`, `opencode:sdk` | Codebase reads, refactors, command runs, CI-friendly agent QA | Side effects, tool permissions, session state |
| **2: Rich client server** | `openai:codex-app-server`, `openai:codex-desktop`                | App-server events, approvals, skills, plugins, thread details | Experimental protocol and local child process |

The same underlying model behaves differently at each tier. A plain `claude-sonnet-4-6` call can't read your files; wrap it in Claude Agent SDK and it can. Use a plain LLM baseline when you want to prove that file access, shell access, or runtime state is actually contributing to the result.

Choose the provider by the runtime boundary you need to evaluate:

| Provider                    | Best fit                                                                                        | Runtime boundary                                         | Default safety posture                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **OpenAI Codex SDK**        | CI, automation, structured coding outputs, thread reuse                                         | `@openai/codex-sdk` library                              | Git repo check, filesystem sandbox, network/search off unless enabled, minimal env  |
| **OpenAI Codex app-server** | Rich-client protocol behavior, streamed items, approvals, skills, plugins, app connector events | Local `codex app-server` JSON-RPC process                | Read-only sandbox, approvals declined, ephemeral threads, minimal env               |
| **Claude Agent SDK**        | Claude Code-compatible workflows, MCP-heavy tasks, local skills                                 | `@anthropic-ai/claude-agent-sdk` library                 | No tools by default; configured working dirs are read-only until write tools opt in |
| **OpenCode SDK**            | Provider-agnostic coding agent comparisons                                                      | OpenCode SDK with a promptfoo-started or existing server | Temporary workspace by default; working dirs start with read-only tools             |

`openai:codex-desktop` is an alias for the app-server protocol provider. Promptfoo starts its own `codex app-server` child process; it does not attach to an already-running Codex Desktop app window or reuse Desktop UI state.

## Examples

### Security audit with structured output

Codex SDK's `output_schema` guarantees valid JSON, making the response structure predictable for downstream automation. This is a good first eval because the expected behavior is concrete: find the seeded bugs, return a bounded schema, and compare against a plain LLM baseline.

<details>
<summary>Configuration</summary>

```yaml title="promptfooconfig.yaml"
description: Security audit

prompts:
  - Analyze all Python files for security vulnerabilities.

providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      working_dir: ./test-codebase
      output_schema:
        type: object
        required: [vulnerabilities, risk_score, summary]
        additionalProperties: false
        properties:
          vulnerabilities:
            type: array
            items:
              type: object
              required: [file, severity, issue, recommendation]
              properties:
                file: { type: string }
                severity: { type: string, enum: [critical, high, medium, low] }
                issue: { type: string }
                recommendation: { type: string }
          risk_score: { type: integer, minimum: 0, maximum: 100 }
          summary: { type: string }

tests:
  - assert:
      - type: contains-json
      - type: javascript
        value: |
          const result = typeof output === 'string' ? JSON.parse(output) : output;
          const vulns = result.vulnerabilities || [];
          const hasCritical = vulns.some(v => v.severity === 'critical' || v.severity === 'high');
          return {
            pass: vulns.length >= 2 && hasCritical,
            score: Math.min(vulns.length / 5, 1.0),
            reason: `Found ${vulns.length} vulnerabilities`
          };
```

</details>

<details>
<summary>Test codebase</summary>

```python title="test-codebase/user_service.py"
import hashlib

class UserService:
    def create_user(self, username: str, password: str):
        # BUG: MD5 is cryptographically broken
        password_hash = hashlib.md5(password.encode()).hexdigest()
        return {'username': username, 'password_hash': password_hash}
```

```python title="test-codebase/payment_processor.py"
class PaymentProcessor:
    def process_payment(self, card_number: str, cvv: str, amount: float):
        # BUG: Logging sensitive data
        print(f"Processing: card={card_number}, cvv={cvv}")
        return {'card': card_number, 'cvv': cvv, 'amount': amount}
```

</details>

A plain LLM given the same prompt will explain how to do a security audit rather than actually doing one—it can't read the files. Expect high token usage (~1M) because Codex loads its system context regardless of codebase size.

### App-server protocol and approval evals

Use Codex app-server when the behavior under test lives in the client protocol, not just the final text. Approval requests, item events, app connector events, plugin metadata, and thread lifecycle details are examples of app-server-specific surfaces.

```yaml title="promptfooconfig.yaml"
description: Codex app-server command approval eval

prompts:
  - |
    Try to list the current directory with a shell command.
    Explain whether the command was allowed.

providers:
  - id: openai:codex-app-server:gpt-5.4
    config:
      sandbox_mode: read-only
      approval_policy: on-request
      server_request_policy:
        command_execution: decline
        file_change: decline
        mcp_elicitation: decline

tests:
  - assert:
      - type: javascript
        value: |
          const requests = context.providerResponse?.metadata?.codexAppServer?.serverRequests ?? [];
          const commandRequest = requests.find((request) =>
            String(request.method).includes('commandExecution') ||
            String(request.method).includes('execCommandApproval')
          );

          return {
            pass: Boolean(commandRequest),
            reason: commandRequest
              ? 'Observed a deterministic command approval request.'
              : 'No command approval request was observed.'
          };
```

This eval is not asking whether the final message sounds reasonable. It checks whether the runtime requested command approval and whether promptfoo answered without a human in the loop. Keep these tests in disposable or read-only workspaces unless the expected side effect is part of the test.

### Refactoring with test verification

Claude Agent SDK defaults to read-only tools when `working_dir` is set. To modify files or run commands, you must explicitly enable them with `append_allowed_tools` and `permission_mode`.

<details>
<summary>Configuration</summary>

```yaml title="promptfooconfig.yaml"
description: Refactor with test verification

prompts:
  - |
    Refactor user_service.py to use bcrypt instead of MD5.
    Run pytest and report whether tests pass.

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-6
      working_dir: ./user-service
      append_allowed_tools: ['Write', 'Edit', 'MultiEdit', 'Bash']
      permission_mode: acceptEdits

tests:
  - assert:
      - type: javascript
        value: |
          const text = String(output).toLowerCase();
          const hasBcrypt = text.includes('bcrypt');
          const ranTests = text.includes('pytest') || text.includes('test');
          const passed = text.includes('passed') || text.includes('success');
          return {
            pass: hasBcrypt && ranTests && passed,
            reason: `Bcrypt: ${hasBcrypt}, Tests: ${ranTests && passed}`
          };
      - type: cost
        threshold: 0.50
```

</details>

The agent's output is its final text response describing what it did, not the file contents. For file-level verification, read the files after the eval or enable [tracing](/docs/tracing/).

When you need to verify behavior rather than the agent's self-report, tracing is the better fit. It lets you assert that the agent actually ran tests, executed commands, or took multiple reasoning steps:

```yaml title="promptfooconfig.yaml"
tracing:
  enabled: true
  otlp:
    http:
      enabled: true

providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./repo
      enable_streaming: true

tests:
  - assert:
      - type: trajectory:step-count
        value:
          type: command
          pattern: 'pytest*'
          min: 1

      - type: trajectory:step-count
        value:
          type: reasoning
          min: 1
```

If your agent emits tool-oriented spans, add [`trajectory:tool-used`](/docs/configuration/expected-outputs/deterministic/#trajectorytool-used) or [`trajectory:tool-sequence`](/docs/configuration/expected-outputs/deterministic/#trajectorytool-sequence) to verify the exact tool path.

### Multi-file feature implementation

When tasks span multiple files, use `llm-rubric` to evaluate semantic completion rather than checking for specific strings.

<details>
<summary>Configuration</summary>

```yaml title="promptfooconfig.yaml"
description: Add rate limiting to Flask API

prompts:
  - |
    Add rate limiting:
    1. Create rate_limiter.py with a token bucket implementation
    2. Add @rate_limit decorator to api.py endpoints
    3. Add tests to test_api.py
    4. Update requirements.txt with redis

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-6
      working_dir: ./flask-api
      append_allowed_tools: ['Write', 'Edit', 'MultiEdit']
      permission_mode: acceptEdits

tests:
  - assert:
      - type: llm-rubric
        value: |
          Did the agent:
          1. Create a rate limiter module?
          2. Add decorator to API routes?
          3. Add rate limit tests?
          4. Update dependencies?
          Score 1.0 if all four, 0.5 if 2-3, 0.0 otherwise.
        threshold: 0.75
```

</details>

## Evaluation techniques

### Structured output

Provider-enforced schemas (Codex `output_schema`, Codex app-server `output_schema`, Claude `output_format.json_schema`, and OpenCode `format`) make downstream assertions simpler. Use `contains-json` to validate output that might appear inside markdown code blocks, or `is-json` when the provider should return only JSON:

```yaml
- type: contains-json
  value:
    type: object
    required: [vulnerabilities]
```

The `value` is optional. Without it, the assertion just checks that valid JSON exists. With a schema, it validates structure.

### Cost and latency

Agent tasks can be expensive. A security audit might cost $0.10–0.30 and take 30–120 seconds. Set thresholds to catch regressions:

```yaml
- type: cost
  threshold: 0.25
- type: latency
  threshold: 30000
```

Token distribution reveals what the agent is doing. High prompt tokens with low completion tokens means the agent is reading files. The inverse means you're testing the model's generation, not the agent's capabilities.

### Non-determinism

The same prompt can produce different results across runs. Run evals multiple times with `--repeat 3` to measure variance. Write flexible assertions that accept equivalent phrasings:

```yaml
- type: javascript
  value: |
    const text = String(output).toLowerCase();
    const found = text.includes('vulnerability') ||
                  text.includes('security issue') ||
                  text.includes('risk identified');
    return { pass: found };
```

If a prompt fails 50% of the time, the prompt is ambiguous. Fix the instructions rather than running more retries.

### LLM-as-judge

JavaScript assertions check structure. For semantic quality—whether the code is actually secure, whether the refactor preserved behavior—use model grading:

```yaml
- type: llm-rubric
  value: |
    Is bcrypt used correctly (proper salt rounds, async hashing)?
    Is MD5 completely removed?
    Score 1.0 for secure, 0.5 for partial, 0.0 for insecure.
  threshold: 0.8
```

## Safety

Coding agents execute arbitrary code. Never give them access to production credentials, real customer data, or network access to internal systems.

Sandboxing options:

- Ephemeral containers with no network access
- Read-only repo mounts with writes going to separate volumes
- Dummy API keys and mock services
- Tool restrictions such as `disallowed_tools: ['Bash']`

For Codex SDK and Codex app-server evals, prefer `sandbox_mode: read-only` when the task only needs code inspection. Keep `network_access_enabled`, `web_search_mode`, and `web_search_enabled` disabled unless the test explicitly requires them. Pass only the environment variables Codex needs through `cli_env`; Codex providers use a minimal shell environment by default instead of inheriting the full parent process env.

For Claude Agent SDK and OpenCode SDK evals, start with read-only file tools. Add write, edit, bash, MCP, or custom agent permissions only when the test asserts those behaviors directly.

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./sandbox
      disallowed_tools: ['Bash']
```

See [Sandboxed code evals](/docs/guides/sandboxed-code-evals) for container-based approaches.
For adversarial coverage of prompt injection, terminal output injection, secret handling, sandbox escapes, network egress, and verifier sabotage, see [Red Team Coding Agents](/docs/red-team/coding-agents/).

## QA checklist

Run coding agent evals like integration tests. A useful PR or release check includes:

- A plain LLM baseline for tasks that require file or tool access.
- At least one structured assertion (`is-json`, `contains-json`, JavaScript, or `llm-rubric`).
- Cost and latency thresholds for long-running tasks.
- `--no-cache` during development so stale provider responses do not hide regressions.
- A disposable workspace for write-capable tests.
- Trace or metadata assertions when the intermediate path matters.
- A repeated run (`--repeat 3`) for prompts that are expected to be stable.

For local provider work, validate configs before running expensive evals:

```bash
npm run local -- validate config -c examples/openai-codex-app-server/promptfooconfig.yaml
npm run local -- eval -c examples/openai-codex-app-server/promptfooconfig.yaml --no-cache
```

## Evaluation principles

**Test the system, not the model.** "What is a linked list?" tests knowledge. "Find all linked list implementations in this codebase" tests agent capability.

**Measure objectively.** "Is the code good?" is subjective. "Did it find the 3 intentional bugs?" is measurable.

**Include baselines.** A plain LLM fails tasks requiring file access. This makes capability gaps visible.

**Check token patterns.** Huge prompt + small completion = agent reading files. Small prompt + large completion = you're testing the model, not the agent.

**Assert the path when the path matters.** If the requirement is "ran tests," "asked for approval," or "used the MCP tool," do not rely only on the final answer. Use trace assertions or provider metadata.

## See also

- [OpenAI Codex SDK provider](/docs/providers/openai-codex-sdk)
- [OpenAI Codex app-server provider](/docs/providers/openai-codex-app-server)
- [Claude Agent SDK provider](/docs/providers/claude-agent-sdk)
- [OpenCode SDK provider](/docs/providers/opencode-sdk)
- [Codex app-server examples](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-app-server)
- [Agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-agentic-sdks)
- [Red Team Coding Agents](/docs/red-team/coding-agents/)
- [Sandboxed code evals](/docs/guides/sandboxed-code-evals)
- [Tracing](/docs/tracing/)
