---
sidebar_position: 65
title: Evaluate Coding Agents
description: Compare AI coding agents for code generation, security analysis, and refactoring with promptfoo
---

# Evaluate Coding Agents

Coding agents present a different evaluation challenge than standard LLMs. A chat model transforms input to output in one step. An agent decides what to do, does it, observes the result, and iterates—often dozens of times before producing a final answer.

This guide covers evaluating CLI-based coding agents with promptfoo: [OpenAI Codex SDK](/docs/providers/openai-codex-sdk) and [Claude Agent SDK](/docs/providers/claude-agent-sdk).

## Why agent evals are different

Standard LLM evals test a function: given input X, does output Y meet criteria Z? Agent evals test a system with emergent behavior.

**Non-determinism compounds.** A chat model's temperature affects one generation. An agent's temperature affects every tool call, every decision to read another file, every choice to retry. Small variations cascade.

**Intermediate steps matter.** Two agents might produce identical final outputs, but one read 3 files and the other read 30. Cost, latency, and failure modes differ dramatically.

**Capability is gated by architecture.** You can't prompt a plain LLM into reading files. The model might be identical, but the agent harness determines what's possible. This means you're evaluating the system, not just the model.

## Capability tiers

| Tier           | Example                                                  | Can Do                                       | Cannot Do                |
| -------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------ |
| **0: Text**    | `openai:gpt-5.1`, `anthropic:claude-sonnet-4-5-20250929` | Generate code, discuss patterns, return JSON | Read files, execute code |
| **1: Agentic** | `openai:codex-sdk`, `anthropic:claude-agent-sdk`         | Read/write files, run commands, iterate      | (Full capabilities)      |

The same underlying model behaves differently at each tier. A plain `claude-sonnet-4-5-20250929` call can't read your files; wrap it in Claude Agent SDK and it can.

Both agentic providers have similar capabilities. The differences are in defaults and ecosystem:

| Aspect                  | Codex SDK                        | Claude Agent SDK                 |
| ----------------------- | -------------------------------- | -------------------------------- |
| **Default permissions** | Full access (Git repo required)  | Read-only until you opt-in       |
| **Structured output**   | `output_schema`                  | `output_format.json_schema`      |
| **State management**    | Thread-based (`persist_threads`) | Stateless (or `resume` sessions) |
| **Safety**              | Git repo check                   | Tool allowlists                  |
| **Ecosystem**           | OpenAI Responses API             | MCP servers, CLAUDE.md           |

## Examples

### Security audit with structured output

Codex SDK's `output_schema` guarantees valid JSON, making the response structure predictable for downstream automation.

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
      model: claude-sonnet-4-5-20250929
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
      model: claude-sonnet-4-5-20250929
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

Provider-enforced schemas (Codex `output_schema`, Claude `output_format.json_schema`) guarantee valid JSON. Use `contains-json` to validate—it extracts JSON from markdown code blocks and surrounding text, which agents often produce:

```yaml
- type: contains-json
  value:
    type: object
    required: [vulnerabilities]
```

The `value` is optional. Without it, the assertion just checks that valid JSON exists. With a schema, it validates structure.

### Cost and latency

Agent tasks are expensive. A security audit might cost $0.10–0.30 and take 30–120 seconds. Set thresholds to catch regressions:

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
- Tool restrictions via `disallowed_tools: ['Bash']`

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./sandbox
      disallowed_tools: ['Bash']
```

See [Sandboxed code evals](/docs/guides/sandboxed-code-evals) for container-based approaches.

## Evaluation principles

**Test the system, not the model.** "What is a linked list?" tests knowledge. "Find all linked list implementations in this codebase" tests agent capability.

**Measure objectively.** "Is the code good?" is subjective. "Did it find the 3 intentional bugs?" is measurable.

**Include baselines.** A plain LLM fails tasks requiring file access. This makes capability gaps visible.

**Check token patterns.** Huge prompt + small completion = agent reading files. Small prompt + large completion = you're testing the model, not the agent.

## See also

- [OpenAI Codex SDK provider](/docs/providers/openai-codex-sdk)
- [Claude Agent SDK provider](/docs/providers/claude-agent-sdk)
- [Agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/agentic-sdk-comparison)
- [Sandboxed code evals](/docs/guides/sandboxed-code-evals)
- [Tracing](/docs/tracing/)
