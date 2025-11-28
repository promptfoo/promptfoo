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

| Tier           | Example                                          | Can Do                                       | Cannot Do                |
| -------------- | ------------------------------------------------ | -------------------------------------------- | ------------------------ |
| **0: Text**    | `openai:gpt-5.1`, `anthropic:claude-sonnet-4`    | Generate code, discuss patterns, return JSON | Read files, execute code |
| **1: Agentic** | `openai:codex-sdk`, `anthropic:claude-agent-sdk` | Read/write files, run commands, iterate      | (Full capabilities)      |

The same underlying model behaves differently at each tier. A plain `claude-sonnet-4` call can't read your files; wrap it in Claude Agent SDK and it can.

Both agentic providers have similar capabilities. The differences are in defaults and ecosystem:

| Aspect                  | Codex SDK                        | Claude Agent SDK                 |
| ----------------------- | -------------------------------- | -------------------------------- |
| **Default permissions** | Full access (Git repo required)  | Read-only until you opt-in       |
| **Structured output**   | `output_schema`                  | `output_format.json_schema`      |
| **State management**    | Thread-based (`persist_threads`) | Stateless (or `resume` sessions) |
| **Safety**              | Git repo check                   | Tool allowlists                  |
| **Ecosystem**           | OpenAI Responses API             | MCP servers, CLAUDE.md           |

## Basic structure

An agent eval looks like any other promptfoo config, but the provider does the heavy lifting:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./src # Agent operates here
      model: gpt-5.1-codex

prompts:
  - Find all security vulnerabilities in this codebase.

tests:
  - assert:
      - type: icontains
        value: vulnerability
```

The agent reads files, reasons, and returns output. Your assertions check whether it did the job. Run with `npx promptfoo eval`.

The scenarios below show common patterns: structured output, refactoring with tests, and multi-file changes.

## Scenarios

### Security audit with structured output

This scenario uses Codex SDK to scan code for vulnerabilities and return findings as validated JSON.

The key insight: `output_schema` guarantees the response structure, making downstream automation reliable.

<details>
<summary>Full configuration</summary>

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Security audit with structured output

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
      - type: is-json
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

**What to observe:**

- Codex reads files, reasons about vulnerabilities, returns structured JSON
- A plain LLM given the same prompt explains _how_ to do a security audit instead of _doing_ one
- Token usage is high (~1M) because Codex loads system context; this is expected

### Refactoring with test verification

This scenario uses Claude Agent SDK to modify code and verify tests pass.

The key insight: Claude Agent SDK defaults to read-only tools. You must explicitly enable writes via `append_allowed_tools` and `permission_mode`.

<details>
<summary>Full configuration</summary>

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

**What to observe:**

- The agent modifies files, runs tests, reports results
- Output is the agent's final text response, not file contents
- For file-level verification, read the files after the eval or enable [tracing](/docs/tracing/)

### Multi-file feature implementation

This scenario tests an agent's ability to coordinate changes across multiple files.

<details>
<summary>Full configuration</summary>

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

**What to observe:**

- `llm-rubric` evaluates semantic completion, not just string matching
- The agent coordinates multiple file operations
- This is where agents diverge most from plain LLMs

## Evaluation techniques

### Structured output validation

Two approaches exist, with different tradeoffs:

**Provider-enforced** (Codex `output_schema`, Claude `output_format.json_schema`): The provider guarantees valid JSON. Use `is-json` assertion.

```yaml
providers:
  - id: openai:codex-sdk
    config:
      output_schema:
        type: object
        required: [result]
        properties:
          result: { type: string }

tests:
  - assert:
      - type: is-json
```

**Prompt-based**: Ask for JSON in your prompt. Output may be wrapped in markdown code blocks.

````yaml
tests:
  - assert:
      - type: javascript
        value: |
          const text = String(output);
          const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          const json = match ? match[1].trim() : text;
          try {
            JSON.parse(json);
            return { pass: true };
          } catch (e) {
            return { pass: false, reason: e.message };
          }
````

### Cost and latency assertions

Agent tasks are expensive. Set thresholds:

```yaml
tests:
  - assert:
      - type: cost
        threshold: 0.25
      - type: latency
        threshold: 30000
```

Token distribution tells you what's happening:

| Pattern                     | Meaning                                      |
| --------------------------- | -------------------------------------------- |
| High prompt, low completion | Agent reading files (expected)               |
| Low prompt, high completion | Model generating text (not exercising agent) |

### Handling non-determinism

Agent runs vary. Strategies:

**Run multiple times:**

```bash
npx promptfoo eval -c config.yaml --repeat 3
```

**Flexible assertions:**

```yaml
- type: javascript
  value: |
    const text = String(output).toLowerCase();
    // Accept multiple phrasings
    const found = text.includes('vulnerability') ||
                  text.includes('security issue') ||
                  text.includes('risk identified');
    return { pass: found };
```

**High variance = ambiguous prompt.** If the same prompt fails 50% of the time, clarify instructions rather than running more retries.

### LLM-as-judge for semantic quality

JavaScript checks structure. For semantic quality, use model grading:

```yaml
- type: llm-rubric
  value: |
    Is bcrypt used correctly (proper salt rounds, async hashing)?
    Is MD5 completely removed?
    Score 1.0 for secure, 0.5 for partial, 0.0 for insecure.
  threshold: 0.8
```

## Safety

Coding agents execute code. Before running evals:

:::warning

Never give agents access to production credentials, real customer data, or network access to internal systems.

:::

**Sandboxing strategies:**

- Run in ephemeral containers with no network
- Mount repos read-only, write to separate volumes
- Use dummy API keys and mock services
- Restrict tools: `disallowed_tools: ['Bash']`

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
