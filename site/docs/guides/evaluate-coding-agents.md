---
sidebar_position: 65
title: Evaluate Coding Agents
description: Compare AI coding agents for code generation, security analysis, and refactoring with promptfoo
---

# Evaluate Coding Agents

This guide covers the CLI-based coding agents built into promptfoo: [OpenAI Codex SDK](/docs/providers/openai-codex-sdk) and [Claude Agent SDK](/docs/providers/claude-agent-sdk). Both run headless and integrate directly with promptfoo's eval framework.

IDE agents like Cursor, Copilot, and Aider aren't directly supported. [Open an issue](https://github.com/promptfoo/promptfoo/issues) if you'd like to see support added.

## Capability tiers

Agent capabilities are gated by tools and environment, not prompting. You can't prompt-engineer a plain LLM into reading files.

**Tier 0: Text Generation** (Plain LLM)

- Receives your prompt text only
- Can discuss code, generate snippets, return structured JSON
- Cannot read files or execute code

**Tier 1: Code Analysis** (OpenAI Codex SDK)

- Receives your prompt + full codebase context
- Can analyze code, detect vulnerabilities, modify files, execute commands
- High token usage (~1M tokens for system overhead)

**Tier 2: Tool-Based Agents** (Claude Agent SDK, Cursor, Aider)

- Receives your prompt + codebase + explicit tool permissions
- Can read, write, execute commands, iterate on failures
- Explicit tool calls (Read, Grep, Bash) you can observe and restrict

Claude Agent SDK defaults to read-only tools when `working_dir` is set. To enable writes or bash, configure `append_allowed_tools` and `permission_mode`.

## When to use each

| Agent Type         | Best For                       | Structured Output  | File Access    |
| ------------------ | ------------------------------ | ------------------ | -------------- |
| **Plain LLM**      | Code review, simple generation | JSON schema or raw | No             |
| **Codex SDK**      | Security audits, schema tasks  | Native JSON schema | Full           |
| **Claude SDK**     | Refactoring, multi-file edits  | JSON schema        | Configurable   |
| **Cursor/Copilot** | IDE integration                | IDE-specific       | IDE-controlled |

## Scenario 1: Security audit

**Goal**: Scan Python code for vulnerabilities and return structured findings.

```yaml title="promptfooconfig.yaml"
description: 'Security audit with structured output'

prompts:
  - 'Analyze all Python files in the current directory for security vulnerabilities.'

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
              required: [file, severity, category, issue, recommendation]
              properties:
                file: { type: string }
                severity: { type: string, enum: [critical, high, medium, low] }
                category: { type: string }
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
          const foundMD5 = vulns.some(v => v.issue?.toLowerCase().includes('md5'));
          return {
            pass: vulns.length >= 3 && foundMD5,
            reason: `Found ${vulns.length} vulnerabilities (MD5: ${foundMD5})`
          };
```

### Test codebase

Create intentionally vulnerable code:

```python title="test-codebase/user_service.py"
import hashlib

class UserService:
    def create_user(self, username: str, password: str):
        # BUG: Using MD5 for password hashing
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

### Results

| Metric          | Codex SDK                          | Plain LLM                        |
| --------------- | ---------------------------------- | -------------------------------- |
| Task completion | **PASS** - Analyzed code           | **FAIL** - Returned instructions |
| Vulnerabilities | 3 (MD5, CVV logging, data storage) | N/A                              |
| Token usage     | 1.06M prompt, 2.3K output          | 41 prompt, 726 output            |
| Duration        | 2m 24s                             | Under 5s                         |

The plain LLM returned instructions on how to use Bandit instead of analyzing the code. Same prompt, different interpretation: without file access, it explained rather than did.

Token overhead is task-dependent. Harder tasks use more. Use `working_dir` to limit scope.

## Scenario 2: Automated refactor

**Goal**: Replace MD5 with bcrypt while ensuring tests pass.

```yaml title="promptfooconfig.yaml"
description: 'Refactor with test verification'

prompts:
  - |
    Refactor user_service.py to use bcrypt instead of MD5.
    Run the test suite and report results.

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
          const testsPassed = text.includes('passed') || text.includes('success');
          return {
            pass: hasBcrypt && testsPassed,
            reason: `Bcrypt: ${hasBcrypt}, Tests: ${testsPassed}`
          };
      - type: cost
        threshold: 0.50
```

Claude Agent SDK returns text describing what it did. You evaluate based on what the agent reports. For deeper inspection, enable [tracing](/docs/tracing/) and check `context.trace`.

## Scenario 3: Cross-file feature

**Goal**: Add rate limiting across multiple files.

```yaml title="promptfooconfig.yaml"
description: 'Add rate limiting to Flask API'

prompts:
  - |
    Add rate limiting:
    1. Create rate_limiter.py with Redis-backed limiter
    2. Update api.py with decorator
    3. Add tests to test_api.py
    4. Update requirements.txt

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./flask-api
      append_allowed_tools: ['Write', 'Edit', 'MultiEdit']
      permission_mode: acceptEdits

tests:
  - assert:
      - type: javascript
        value: |
          const text = String(output).toLowerCase();
          const hasLimiter = text.includes('rate_limiter') || text.includes('rate limiter');
          const hasTests = text.includes('test') && text.includes('rate');
          return {
            pass: hasLimiter && hasTests,
            reason: `Rate limiter: ${hasLimiter}, Tests: ${hasTests}`
          };

      - type: llm-rubric
        value: |
          Did the agent complete all four tasks?
          Score 1.0 if all four, 0.5 if 2-3, 0.0 if fewer.
        threshold: 0.75
```

## Structured output

Two approaches:

**1. Provider-level** (recommended): Use `output_schema` (Codex) or `output_format.json_schema` (Claude). Returns parsed JSON.

```yaml
providers:
  - id: openai:codex-sdk
    config:
      output_schema:
        type: object
        required: [vulnerabilities]
        properties:
          vulnerabilities: { type: array }
```

**2. Prompt-based**: Ask for JSON in your prompt. May return markdown-wrapped output.

````yaml
tests:
  - assert:
      - type: javascript
        value: |
          const text = String(output);
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          const result = JSON.parse(jsonMatch ? jsonMatch[1].trim() : text);
          return { pass: Array.isArray(result.vulnerabilities) };
````

Use `is-json` when the provider returns raw JSON. Use regex extraction for prompt-based JSON.

## Threads and state

Codex SDK supports thread-based conversations with `persist_threads: true`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      persist_threads: true
      thread_pool_size: 2

tests:
  - vars:
      request: 'Create a User class with email validation'
  - vars:
      request: 'Add password hashing with bcrypt'
    assert:
      - type: javascript
        value: |
          const hasBoth = output.includes('validate_email') && output.includes('bcrypt');
          return { pass: hasBoth, reason: hasBoth ? 'Context preserved' : 'Lost context' };
```

## Cost and latency

Agent tasks cost more than simple LLM calls. A security audit might cost $0.10-0.30 and take 30-120 seconds. Complex features can cost several dollars.

```yaml
tests:
  - assert:
      - type: cost
        threshold: 0.25
      - type: latency
        threshold: 15000
```

Optimization: smaller models save ~70%, limit `working_dir` scope, use `thread_pool_size` for multi-task runs.

## Safety

SDK-based agents can execute arbitrary code.

:::warning
Never give agents access to production credentials, real customer data, or network access to internal systems.
:::

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./sandbox
      disallowed_tools:
        - bash # Disable shell for analysis-only tasks
```

Use ephemeral containers, read-only mounts, dummy API keys. See [Sandboxed code evals](/docs/guides/sandboxed-code-evals).

## Handling flakiness

Agent runs are noisy. The same prompt can succeed or fail.

**Run multiple times:**

```bash
npx promptfoo eval -c config.yaml --repeat 3
```

**Design flexible assertions:**

```yaml
- type: javascript
  value: |
    const text = String(output).toLowerCase();
    const found = text.includes('vulnerability') || text.includes('security issue');
    return { pass: found };
```

High variance on a specific prompt often indicates ambiguous instructions.

## LLM-as-judge for code

JavaScript checks structure. For semantic quality:

```yaml
- type: llm-rubric
  value: |
    Is bcrypt used correctly? Is MD5 completely removed?
    Score 1.0 for secure, 0.5 for partial, 0.0 for insecure.
  threshold: 0.8
```

## Evaluation principles

**Test agent capabilities, not model knowledge.** "What is a linked list?" tests the model. "Find all linked list implementations in this codebase" tests the agent.

**Measure objectively.** "Is the code high quality?" is subjective. "Did it find the 3 intentional bugs?" is measurable.

**Include a baseline.** A plain LLM fails tasks requiring file access, making comparisons meaningful.

**Check token patterns.** Huge prompts, small completions = agent is reading files. Small prompt, large completion = you're testing the model.

## See also

- [OpenAI Codex SDK provider docs](/docs/providers/openai-codex-sdk)
- [Claude Agent SDK provider docs](/docs/providers/claude-agent-sdk)
- [Agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/agentic-sdk-comparison)
- [Sandboxed code evals](/docs/guides/sandboxed-code-evals)
