---
sidebar_position: 65
title: Evaluate Coding Agents
description: Compare AI coding agents for code generation, security analysis, and refactoring with promptfoo
---

# Evaluate Coding Agents

**TL;DR**: Pick your agent based on what it needs to do, then jump to the matching [scenario](#scenarios). Use the [capability tiers](#capability-tiers) to understand what's possible, and the [evaluation methodology](#evaluation-methodology) for designing assertions.

This guide covers the CLI-based coding agents built into promptfoo: [OpenAI Codex SDK](/docs/providers/openai-codex-sdk) and [Claude Agent SDK](/docs/providers/claude-agent-sdk). These run headless and integrate directly with promptfoo's eval framework.

IDE-based agents like Cursor, Copilot, and Aider are mentioned for comparison but aren't directly supported. [Open an issue](https://github.com/promptfoo/promptfoo/issues) if you'd like to see support for your favorite coding agent.

## Capability tiers

Agent capabilities are gated by tools and environment, not prompting. You can't prompt-engineer a plain LLM into reading files—that requires architectural support.

**Tier 0: Text Generation** (Plain LLM via standard provider)

- **What it receives**: Your prompt text only
- **Can do**: Discuss code, generate snippets, explain concepts, return structured JSON via provider APIs
- **Cannot do**: Read files or execute code on its own
- **Use for**: Code review (paste code in prompt), explaining patterns

:::note

"Plain LLM" means using models like gpt-5.1 or claude-sonnet-4 through promptfoo's standard chat/completions providers without an agent harness. The same models can be full coding agents when wrapped by Codex SDK or Claude Agent SDK.

:::

**Tier 1: Code Analysis** (OpenAI Codex SDK provider)

- **What it receives**: Your prompt + full codebase context (1M+ tokens)
- **Can do**: Analyze code, detect vulnerabilities, produce structured JSON, modify files, execute commands
- **Best for**: Security audits, code analysis, generating reports with guaranteed JSON structure
- **Tradeoff**: High token usage (~1M tokens for system overhead)

:::note

Codex SDK is a full-featured coding agent with file modification and execution capabilities. This guide focuses on analysis use cases where structured output matters most. The Git repository requirement (enabled by default) provides safety through version control.

:::

**Tier 2: Tool-Based Agents** (Claude Agent SDK, Cursor, Aider)

- **What it receives**: Your prompt + codebase + explicit tool permissions
- **Can do**: Read, write, execute commands, iterate on failures (when configured)
- **Key difference**: Explicit tool calls (Read, Grep, Bash) you can observe and restrict
- **Use for**: Refactoring, feature implementation, test generation

:::note

Claude Agent SDK defaults to **read-only** tools (Read, Grep, Glob, LS) when `working_dir` is set. To enable writes or bash, configure `append_allowed_tools` and `permission_mode`. See [Claude Agent SDK docs](/docs/providers/claude-agent-sdk/) for details.

:::

Both SDK-based agents (Codex and Claude) have full coding capabilities. The key differences are output format (native JSON schema vs markdown) and tool visibility (implicit vs explicit).

## When to use each agent

| Agent Type                               | Best For                             | Structured Output  | File System Access    | Tradeoffs                     |
| ---------------------------------------- | ------------------------------------ | ------------------ | --------------------- | ----------------------------- |
| **Plain LLM** (gpt-5.1, claude-sonnet-4) | Code review, simple generation       | JSON schema or raw | No                    | Fast, cheap, limited context  |
| **OpenAI Codex SDK**                     | Security audits, schema-driven tasks | Native JSON schema | Full (Git required)   | High token use, strict output |
| **Claude Agent SDK**                     | Refactoring, multi-file edits        | JSON schema        | Configurable per-tool | Explicit tool control         |
| **Cursor/Copilot/Aider**                 | IDE integration, interactive coding  | IDE-specific       | IDE-controlled        | Interactive, non-automated    |

### Quick recommendations

**Use OpenAI Codex SDK when:**

- You need guaranteed JSON structure (security reports, test results)
- Task requires analyzing code without modifying it
- You want thread-based conversation state
- Working in a Git repository

**Use Claude Agent SDK when:**

- Task requires reading and writing multiple files
- Need bash commands (running tests, git operations)
- Want MCP server integration
- Using CLAUDE.md project context files

**Use plain LLM when:**

- Simple code generation or review
- Don't need file system access
- Want maximum control over tool use
- Cost and latency are critical

**Use IDE agents (Cursor/Copilot/Aider) when:**

- Working interactively in an IDE
- Need real-time code completion
- Want integrated git workflows

## Scenarios

1. **[Security audit](#scenario-1-security-audit)** - Find vulnerabilities in existing code
2. **[Automated refactor](#scenario-2-automated-refactor-with-tests)** - Modify code while preserving behavior
3. **[Cross-file feature](#scenario-3-cross-file-feature-implementation)** - Implement features spanning multiple files

## Scenario 1: Security audit

**Goal**: Scan Python code for security vulnerabilities and return structured findings.

**Best agents**: OpenAI Codex SDK (native structured output) or Claude Agent SDK (flexible file access)

### Configuration

This example uses OpenAI Codex SDK with JSON schema to enforce consistent output:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Security audit with structured output'

prompts:
  - 'Analyze all Python files in the current directory for security vulnerabilities.'

providers:
  - id: openai:codex-sdk
    label: codex-gpt-5.1
    config:
      model: gpt-5.1-codex
      working_dir: ./test-codebase
      skip_git_repo_check: true
      # Enforce JSON structure
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
              additionalProperties: false
              properties:
                file: { type: string }
                severity:
                  type: string
                  enum: [critical, high, medium, low]
                category:
                  type: string
                  enum: [authentication, cryptography, data-exposure, input-validation, other]
                issue: { type: string }
                recommendation: { type: string }
          risk_score:
            type: integer
            minimum: 0
            maximum: 100
          summary: { type: string }

tests:
  - description: 'Find security vulnerabilities'
    assert:
      # First check it's valid JSON
      - type: is-json
      # Then verify structured output
      - type: javascript
        value: |
          // Parse output - with output_schema, Codex returns valid JSON
          // but in JS assertions, output is always a string
          const result = typeof output === 'string' ? JSON.parse(output) : output;

          // Check required fields exist
          if (!Array.isArray(result.vulnerabilities) ||
              typeof result.risk_score !== 'number' ||
              typeof result.summary !== 'string') {
            return {
              pass: false,
              score: 0,
              reason: 'Missing required fields'
            };
          }

          // Check for key vulnerabilities in test code
          const vulns = result.vulnerabilities;
          const foundMD5 = vulns.some(v =>
            v.issue?.toLowerCase().includes('md5') ||
            v.category === 'cryptography'
          );
          const foundDataExposure = vulns.some(v =>
            v.category === 'data-exposure' ||
            v.issue?.toLowerCase().includes('password') ||
            v.issue?.toLowerCase().includes('cvv')
          );

          const score = (vulns.length >= 3 ? 0.4 : 0) +
                       (foundMD5 ? 0.3 : 0) +
                       (foundDataExposure ? 0.3 : 0);

          return {
            pass: score >= 0.6,
            score: score,
            reason: `Found ${vulns.length} vulnerabilities (MD5: ${foundMD5}, Data exposure: ${foundDataExposure})`
          };
        metric: 'Vulnerability Detection'
```

### Test codebase

Create intentionally vulnerable code for testing:

```python title="test-codebase/user_service.py"
import hashlib
import random
import string

class UserService:
    def __init__(self):
        self.users = {}
        # BUG: Predictable session tokens
        self.sessions = {}

    def create_user(self, username: str, password: str):
        # BUG: Using MD5 for password hashing (insecure)
        password_hash = hashlib.md5(password.encode()).hexdigest()
        self.users[username] = {
            'password_hash': password_hash,
            'created_at': '2024-01-01'
        }
        return username

    def create_session(self, username: str):
        # BUG: Weak random token generation
        token = ''.join(random.choice(string.ascii_letters) for _ in range(10))
        self.sessions[token] = username
        return token
```

```python title="test-codebase/payment_processor.py"
import json
import hashlib

class PaymentProcessor:
    def process_payment(self, card_number: str, cvv: str, amount: float):
        # BUG: Logging sensitive data in plain text
        print(f"Processing payment: card={card_number}, cvv={cvv}, amount={amount}")

        # BUG: Using MD5 for transaction verification
        transaction_id = hashlib.md5(f"{card_number}{amount}".encode()).hexdigest()

        # BUG: Storing sensitive data without encryption
        transaction = {
            'card_number': card_number,
            'cvv': cvv,
            'amount': amount,
            'id': transaction_id
        }

        return transaction
```

### Results

Running the evaluation:

```bash
npm run local -- eval -c promptfooconfig.yaml
```

Real results comparing Codex SDK vs Plain LLM (gpt-5.1):

| Metric                       | OpenAI Codex SDK (gpt-5.1-codex)      | Plain LLM (gpt-5.1)                     |
| ---------------------------- | ------------------------------------- | --------------------------------------- |
| Task completion              | **PASS** - Analyzed code              | **FAIL** - Returned Bandit instructions |
| Vulnerabilities found        | 3 (MD5, CVV logging, data storage)    | N/A (didn't perform analysis)           |
| Structured output compliance | 100% (enforced by schema)             | N/A (returned text, not JSON)           |
| Token usage                  | 1,062,383 (1.06M prompt, 2.3K output) | 767 (41 prompt, 726 output)             |
| Duration                     | 2m 24s                                | Under 5s                                |
| Pass rate                    | 100%                                  | 0%                                      |

The plain LLM returned instructions on how to use Bandit instead of actually analyzing the code. Codex SDK performed the security audit and returned actionable JSON.

### Why the plain LLM failed

The plain LLM returned this:

> "To analyze all Python files in a directory for security vulnerabilities and return the findings in JSON format, we can use static code analysis tools like Bandit. Below is a step-by-step guide on how you might achieve this using Python and Bandit:..."

Same prompt, different interpretation:

- **Plain LLM understood**: "Explain how someone would do this task"
- **Codex SDK understood**: "Do this task"

Without file system access, the plain LLM defaulted to explaining rather than doing.

### Token usage breakdown

Token distribution shows a dramatic difference:

|                       | Plain LLM | Codex SDK | Ratio       |
| --------------------- | --------- | --------- | ----------- |
| **Prompt tokens**     | 41        | 1,060,074 | **25,855x** |
| **Completion tokens** | 726       | 2,309     | 3.2x        |
| **Total**             | 767       | 1,062,383 | 1,385x      |

The 25,000x prompt difference is the entire codebase being read into context:

- Instruction: 41 tokens
- `payment_processor.py`: ~500 tokens
- `user_service.py`: ~400 tokens
- Codex system prompts and tools: ~1.059M tokens

Agent runs allocate more tokens to reading and inspecting code than to generating text, compared to chat use cases. But the reasoning step itself is still nontrivial—these models use significant compute to synthesize findings from massive context.

### Scaling

In this test, Codex used ~1M total prompt tokens across its internal turns and tool calls. The bulk was Codex's own planning and tool usage, not the ~1K tokens of file content. This overhead is **task-dependent**—harder tasks or ones where Codex iterates more will use more tokens.

For larger codebases:

- Token usage scales with files touched and task complexity, not total repo size
- Modern frontier models support hundreds of thousands of tokens per request (sometimes up to ~1M depending on provider). Agents use streaming, caching, and compaction rather than loading everything at once
- Real-world scaling depends on which files the agent decides to read

**For larger codebases**: Use `working_dir` to limit scope to specific subdirectories. Only add `additional_directories` if there are extra paths the agent truly needs (it expands scope, not limits it).

See the [agentic-sdk-comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/agentic-sdk-comparison) for a working implementation.

## Scenario 2: Automated refactor with tests

**Goal**: Refactor code (e.g., replace MD5 with bcrypt) while ensuring tests still pass.

**Best agents**: Claude Agent SDK (bash + file writes) or Cursor/Aider (IDE integration)

### Configuration outline

```yaml title="promptfooconfig.yaml"
description: 'Refactor user authentication with test verification'

prompts:
  - |
    Refactor user_service.py to use bcrypt instead of MD5 for password hashing.
    After making changes, run the test suite and ensure all tests pass.
    Report your results including: what you changed, test output, and final status.

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./user-service
      # Default is read-only. Enable writes and bash for refactoring:
      append_allowed_tools: ['Write', 'Edit', 'MultiEdit', 'Bash']
      permission_mode: acceptEdits

tests:
  - description: 'Successful refactor with passing tests'
    assert:
      # Claude Agent SDK returns text describing what it did
      # Check the response mentions key indicators of success
      - type: javascript
        value: |
          const text = String(output).toLowerCase();

          // Check agent mentioned making bcrypt changes
          const mentionsBcrypt = text.includes('bcrypt');
          const mentionsRemovingMD5 = text.includes('md5') && (text.includes('removed') || text.includes('replaced'));

          // Check tests were run and passed
          const ranTests = text.includes('pytest') || text.includes('test');
          const testsPassed = text.includes('passed') || text.includes('success');

          const score = [mentionsBcrypt, mentionsRemovingMD5, ranTests, testsPassed]
            .filter(Boolean).length / 4;

          return {
            pass: score >= 0.75,
            score,
            reason: `Bcrypt: ${mentionsBcrypt}, MD5 removed: ${mentionsRemovingMD5}, Tests: ${ranTests && testsPassed}`
          };
        metric: 'Refactor Quality'

      - type: cost
        threshold: 0.50
        metric: 'Cost per refactor'
```

:::note

Claude Agent SDK returns the final text response (or structured output if `output_format` is configured). The agent doesn't expose intermediate file contents or bash output in `output`—you evaluate based on what the agent reports doing. For deeper inspection, enable tracing and check `context.trace` for individual tool calls, or read modified files on disk after the eval.

:::

**Key assertions:**

1. Agent reports making bcrypt changes
2. Agent mentions running tests
3. Agent indicates tests passed
4. Cost stays under threshold

## Scenario 3: Cross-file feature implementation

**Goal**: Implement a feature that requires modifying multiple related files (e.g., add rate limiting to an API).

**Best agents**: Claude Agent SDK (multi-file editing) or IDE agents (Cursor/Copilot)

### Configuration outline

```yaml title="promptfooconfig.yaml"
description: 'Add rate limiting to Flask API'

prompts:
  - |
    Add rate limiting to the Flask API:
    1. Create rate_limiter.py with a Redis-backed rate limiter
    2. Update api.py to use the rate limiter decorator
    3. Add rate limit tests to test_api.py
    4. Update requirements.txt with redis dependency

    Summarize all changes you made.

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./flask-api
      # Enable file writes for multi-file feature implementation
      append_allowed_tools: ['Write', 'Edit', 'MultiEdit']
      permission_mode: acceptEdits

tests:
  - description: 'Multi-file feature implementation'
    assert:
      - type: javascript
        value: |
          const text = String(output).toLowerCase();

          // Check agent mentions creating/modifying each component
          const hasRateLimiter = text.includes('rate_limiter') || text.includes('rate limiter');
          const apiUpdated = text.includes('api.py') && text.includes('decorator');
          const testsAdded = text.includes('test') && text.includes('rate');
          const depsUpdated = text.includes('redis') && text.includes('requirements');

          const score = [hasRateLimiter, apiUpdated, testsAdded, depsUpdated]
            .filter(Boolean).length / 4;

          return {
            pass: score >= 0.75,
            score,
            reason: `Rate limiter: ${hasRateLimiter}, API: ${apiUpdated}, Tests: ${testsAdded}, Deps: ${depsUpdated}`
          };
        metric: 'Cross-file completeness'

      # Use llm-rubric for semantic verification
      - type: llm-rubric
        value: |
          Did the agent complete all four tasks?
          1. Created a rate limiter module
          2. Added decorator to API routes
          3. Added tests for rate limiting
          4. Updated dependencies

          Score 1.0 if all four, 0.5 if 2-3, 0.0 if fewer.
        threshold: 0.75
```

**Key assertions:**

1. Agent mentions creating rate limiter
2. Agent reports updating API with decorator
3. Agent mentions adding tests
4. Agent reports updating dependencies

## Feature deep dives

### Structured output

**What it is**: Guaranteed JSON output matching a schema.

**Why it matters**: Automation requires consistent, parseable output. Without schema enforcement, LLMs occasionally return malformed JSON that breaks pipelines.

**Who has it**:

- **OpenAI Codex SDK**: Native `output_schema` with strict validation
- **OpenAI API**: `response_format` with JSON schema (gpt-4o, gpt-5.1)
- **Claude API and Agent SDK**: JSON schema support via structured outputs (Sonnet 4, Sonnet 4.5, Opus 4.5)

**Two approaches**:

1. **Provider-level structured output** (recommended): Use `output_schema` (Codex) or `output_format.json_schema` (Claude Agent SDK). The provider enforces the schema and returns parsed JSON.

2. **Prompt-based JSON**: Ask the model to return JSON in your prompt. Works but may produce markdown-wrapped output that needs extraction.

**Evaluation tactic for provider-level structured output**:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./src
      output_format:
        type: json_schema
        schema:
          type: object
          required: [vulnerabilities, risk_score, summary]
          properties:
            vulnerabilities: { type: array }
            risk_score: { type: number }
            summary: { type: string }

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: |
          // With output_format.json_schema, output is already parsed JSON
          const result = typeof output === 'string' ? JSON.parse(output) : output;
          return {
            pass: Array.isArray(result.vulnerabilities),
            reason: `Found ${result.vulnerabilities?.length || 0} vulnerabilities`
          };
```

**Evaluation tactic for prompt-based JSON** (when provider may wrap in markdown):

````yaml
tests:
  - assert:
      - type: javascript
        value: |
          const text = String(output);

          // Extract JSON from markdown code blocks or parse directly
          let result;
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                           text.match(/^(\{[\s\S]*\})$/);

          if (jsonMatch) {
            try {
              result = JSON.parse(jsonMatch[1].trim());
            } catch (e) {
              return { pass: false, reason: `JSON parse error: ${e.message}` };
            }
          } else {
            try {
              result = JSON.parse(text);
            } catch (e) {
              return { pass: false, reason: 'No valid JSON found' };
            }
          }

          return { pass: Array.isArray(result.vulnerabilities), score: 1.0 };
        metric: 'Schema compliance'
````

:::tip
Use `type: is-json` when your provider is configured to return raw JSON (Codex with `output_schema`, Claude Agent SDK with `output_format.json_schema`, or Responses API with `response_format`). Use regex extraction only when prompting for JSON without structured output configuration.
:::

### Threads and conversation state

**What it is**: Multi-turn conversations where the agent remembers previous context.

**Why it matters**: Complex tasks require iteration ("now add error handling", "run the tests again").

**Who has it**:

- **OpenAI Codex SDK**: Thread-based with `persist_threads: true`
- **Claude Agent SDK**: State managed in SDK conversation loop
- **Plain LLMs**: Manual context management required

**Evaluation tactic**:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      persist_threads: true
      thread_pool_size: 2

tests:
  - description: 'First turn: generate code'
    vars:
      request: 'Create a User class with email validation'

  - description: 'Second turn: add to existing code'
    vars:
      request: 'Add password hashing with bcrypt'
    assert:
      - type: javascript
        value: |
          // Should reference the User class from turn 1
          const hasBothFeatures =
            output.includes('validate_email') &&
            output.includes('bcrypt');

          return {
            pass: hasBothFeatures,
            score: hasBothFeatures ? 1.0 : 0.0,
            reason: hasBothFeatures ? 'Context preserved' : 'Lost previous context'
          };
        metric: 'Context retention'
```

### Repository safety

**What it is**: Agents that enforce working in a Git repository to prevent data loss.

**Why it matters**: Code changes without version control are dangerous. Agents can silently overwrite files.

**Who has it**:

- **OpenAI Codex SDK**: Requires Git repo by default (bypass with `skip_git_repo_check: true`)
- **Claude Agent SDK**: No built-in Git requirement
- **Plain LLMs**: No file system access

**Evaluation tactic**:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      working_dir: /tmp/non-git-directory # Not a repo
      skip_git_repo_check: false # Enforce Git check

tests:
  - description: 'Reject non-Git directories'
    assert:
      - type: javascript
        value: |
          // Should fail with Git repository error
          const hasGitError = output.error?.includes('Git repository');

          return {
            pass: hasGitError,
            score: hasGitError ? 1.0 : 0.0,
            reason: hasGitError ? 'Correctly enforced Git requirement' : 'Allowed non-Git directory'
          };
        metric: 'Repository safety'
```

Always work in Git repos. Use `skip_git_repo_check: true` only for testing/examples.

### Cost and latency

**What it is**: Dollars per task and seconds to complete.

**Why it matters**: Agent tasks cost more than simple LLM calls due to tool use, file reads, and multiple turns.

Cost and latency vary significantly by task complexity, model, and codebase size. A security audit of a few files might cost $0.10-0.30 and take 30-120 seconds. Complex multi-file features can cost several dollars and run for minutes.

Run your own benchmarks—these numbers depend heavily on your specific use case.

**Evaluation tactic**:

```yaml
tests:
  - description: 'Cost and latency constraints'
    assert:
      # Built-in cost assertion - uses provider response metadata
      - type: cost
        threshold: 0.25 # Max $0.25 per audit
        metric: 'Cost per audit'

      # Built-in latency assertion
      - type: latency
        threshold: 15000 # Max 15 seconds
        metric: 'Latency'

      # For custom cost metrics, use context.providerResponse
      - type: javascript
        value: |
          const result = typeof output === 'string' ? JSON.parse(output) : output;
          const vulnCount = result.vulnerabilities?.length || 0;

          // Cost is in context, not output
          const cost = context.providerResponse?.cost || 0;
          const costPerVuln = vulnCount > 0 ? cost / vulnCount : 999;

          return {
            pass: costPerVuln < 0.10,
            score: Math.max(0, 1 - costPerVuln / 0.10),
            reason: `$${costPerVuln.toFixed(3)} per vulnerability (${vulnCount} found)`
          };
        metric: 'Cost efficiency'
```

**Optimization tips:**

- Use smaller models for simple tasks (gpt-4o-mini vs gpt-4o saves ~70%)
- Limit `working_dir` scope to reduce file reads
- Use `thread_pool_size` to reuse threads (saves ~30% on multi-task runs)

## Advanced evaluation techniques

### Connection to benchmarks

For systematic agent evaluation, consider established benchmarks:

- **[SWE-bench](https://www.swebench.com/)**: Real GitHub issues from popular repos. Agents produce patches, evaluated by running tests. SWE-bench Verified uses human-validated issues.
- **SWE-bench Live**: Issues from the past month, reducing contamination risk.

You can use promptfoo to evaluate against SWE-bench style tasks:

```yaml title="promptfooconfig.yaml"
description: 'SWE-bench style evaluation'

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./swebench-instance # Repo with failing test
      # Agent produces a patch

tests:
  - vars:
      issue: 'Fix the TypeError in parse_date when input is None'
    assert:
      # Check patch applies cleanly
      - type: javascript
        value: |
          const patchApplied = context.providerResponse?.sessionId;
          return { pass: !!patchApplied, reason: patchApplied ? 'Patch created' : 'No patch' };

      # Check tests pass (run separately or via bash tool)
      - type: contains
        value: 'PASSED'
```

Even if you track SWE-bench scores, bespoke evals on your own codebase catch domain-specific issues benchmarks miss.

### Trace-based evaluation

Final outputs don't capture everything. For agents, stepwise behavior matters:

- Did it run tests before claiming success?
- Did it make unnecessary API calls?
- How long did each step take?

When [tracing is enabled](/docs/tracing/), use `context.trace` to access OpenTelemetry spans:

```yaml title="promptfooconfig.yaml"
tests:
  - assert:
      - type: javascript
        value: |
          // Check if trace data is available
          if (!context.trace) {
            // Tracing not enabled - skip trace-based checks
            return { pass: true, reason: 'Tracing not enabled' };
          }

          const { spans } = context.trace;

          // Count tool calls by looking at span names
          const toolCalls = spans.filter(s =>
            s.name.toLowerCase().includes('tool') ||
            s.name.toLowerCase().includes('bash')
          ).length;

          // Check for errors in any span
          const errorSpans = spans.filter(s => s.statusCode >= 400);

          // Calculate total duration
          const duration = spans.length > 0
            ? Math.max(...spans.map(s => s.endTime || 0)) -
              Math.min(...spans.map(s => s.startTime))
            : 0;

          return {
            pass: errorSpans.length === 0 && duration < 30000,
            score: errorSpans.length === 0 ? 1.0 : 0.0,
            reason: `Tool calls: ${toolCalls}, Errors: ${errorSpans.length}, Duration: ${duration}ms`
          };
        metric: 'Agent behavior'
```

For conversation-level analysis, include instructions in your prompt asking the agent to summarize its steps, then evaluate that summary.

See the [tracing documentation](/docs/tracing/) for setup instructions.

### Handling flakiness

Agent runs are noisy. The same prompt can succeed or fail depending on model sampling.

**Strategy 1: Multiple runs via CLI**

```bash
# Run the eval 3 times
npx promptfoo eval -c config.yaml --repeat 3
```

Each run produces separate results. Compare pass rates across runs in the web UI or via `promptfoo view`.

**Strategy 2: Model selection**

Some models are more deterministic than others. Mini models (gpt-5.1-codex-mini) tend to be faster but may have higher variance. Larger models often produce more consistent results.

For plain LLM providers that support it, set `temperature: 0` for reproducibility.

**Strategy 3: Flexible assertions**

Design assertions that tolerate minor variations:

```yaml
- type: javascript
  value: |
    const text = String(output).toLowerCase();
    // Accept multiple valid phrasings
    const foundVuln = text.includes('vulnerability') ||
                      text.includes('security issue') ||
                      text.includes('risk');
    return { pass: foundVuln, reason: foundVuln ? 'Found issue' : 'No issues reported' };
```

**Variance as signal**: High variance on a specific prompt often indicates an ambiguous task. If the same prompt fails 50% of the time, clarify the instructions rather than running more retries.

### Safety and sandboxing

SDK-based coding agents can execute arbitrary code. Before running evals:

:::warning

Never give agents access to production credentials, real customer data, or network access to internal systems.

:::

**Sandboxing strategies:**

1. **Ephemeral containers**: Run each eval in a fresh Docker container with no network access
2. **Read-only mounts**: Mount the repo read-only, write to a separate volume
3. **Credential isolation**: Use dummy API keys and mock services
4. **Command allowlists**: Restrict which bash commands are permitted

```yaml title="promptfooconfig.yaml"
providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./sandbox # Disposable directory
      # Restrict to safe tools only
      disallowed_tools:
        - bash # Disable shell entirely for analysis-only tasks
```

For more on sandboxing, see [Sandboxed code evals](/docs/guides/sandboxed-code-evals).

### LLM-as-judge for code

JavaScript assertions check structure. For semantic quality, use model-graded assertions:

```yaml title="promptfooconfig.yaml"
tests:
  - vars:
      task: 'Replace MD5 with bcrypt for password hashing'
    assert:
      # Structural check
      - type: javascript
        value: |
          const hasNoBcrypt = !output.includes('bcrypt');
          return { pass: !hasNoBcrypt, reason: hasNoBcrypt ? 'Missing bcrypt' : 'Has bcrypt' };

      # Semantic check - is the fix actually secure?
      - type: llm-rubric
        value: |
          Evaluate this code change for security:
          1. Is bcrypt used correctly (proper salt rounds, async hashing)?
          2. Is MD5 completely removed, not just supplemented?
          3. Are there any new vulnerabilities introduced?

          Score 1.0 for secure implementation, 0.5 for partial, 0.0 for insecure.
        threshold: 0.8

      # Check for regression risk
      - type: llm-rubric
        value: |
          How invasive is this change?
          - Minimal (1.0): Only touches hashing code
          - Moderate (0.5): Changes function signatures or adds dependencies
          - High risk (0.0): Restructures authentication flow

          Return the risk level.
        threshold: 0.5
```

LLM-rubric assertions are useful for:

- **Diff plausibility**: Does the patch match the issue description?
- **Security fix quality**: Is the replacement actually secure?
- **Regression risk**: How invasive is the change?

## Copy-paste recipes

### Recipe 1: Security scanner with severity breakdown

````yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Security scanner with severity metrics'

prompts:
  - 'Scan all code for security vulnerabilities. Return JSON with findings grouped by severity.'

providers:
  # Codex SDK: output_schema guarantees raw JSON
  - id: openai:codex-sdk
    label: codex
    config:
      model: gpt-5.1-codex
      working_dir: ./src
      output_schema:
        type: object
        required: [critical, high, medium, low, summary]
        properties:
          critical: { type: array, items: { type: string } }
          high: { type: array, items: { type: string } }
          medium: { type: array, items: { type: string } }
          low: { type: array, items: { type: string } }
          summary: { type: string }

  # Claude Agent SDK: JSON often wrapped in markdown
  - id: anthropic:claude-agent-sdk
    label: claude-agent
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./src

tests:
  - assert:
      - type: javascript
        value: |
          const text = String(output);

          // Extract JSON from markdown (Claude) or parse directly (Codex)
          let result;
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                           text.match(/^(\{[\s\S]*\})$/);

          if (jsonMatch) {
            try {
              result = JSON.parse(jsonMatch[1].trim());
            } catch (e) {
              return { pass: false, score: 0, reason: `JSON parse error: ${e.message}` };
            }
          } else {
            try {
              result = JSON.parse(text);
            } catch (e) {
              return { pass: false, score: 0, reason: 'No JSON found in response' };
            }
          }

          const criticalCount = result.critical?.length || 0;
          const highCount = result.high?.length || 0;
          const totalCount = criticalCount + highCount +
                            (result.medium?.length || 0) +
                            (result.low?.length || 0);

          return {
            pass: totalCount > 0,
            score: Math.min(criticalCount * 0.5 + highCount * 0.3, 1.0),
            reason: `Found ${totalCount} issues (${criticalCount} critical, ${highCount} high)`
          };
        metric: 'Vulnerability detection'

      - type: cost
        threshold: 0.30
````

### Recipe 2: Code quality metrics

````yaml title="promptfooconfig.yaml"
description: 'Code quality analysis with complexity scoring'

prompts:
  - 'Analyze code quality. Return JSON with complexity_score (1-10), coverage_gaps (array), and code_smells (array).'

providers:
  # Works with both Codex SDK and Claude Agent SDK
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./src

tests:
  - assert:
      - type: javascript
        value: |
          const text = String(output);

          // Extract JSON from markdown or parse directly
          let result;
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                           text.match(/^(\{[\s\S]*\})$/);

          if (jsonMatch) {
            try {
              result = JSON.parse(jsonMatch[1].trim());
            } catch (e) {
              return { pass: false, score: 0, reason: `JSON parse error: ${e.message}` };
            }
          } else {
            try {
              result = JSON.parse(text);
            } catch (e) {
              return { pass: false, score: 0, reason: 'No JSON found' };
            }
          }

          const complexity = result.complexity_score || 10;
          return {
            pass: complexity <= 7,  // Acceptable complexity
            score: Math.max(0, (10 - complexity) / 10),
            reason: `Complexity: ${complexity}/10, Coverage gaps: ${result.coverage_gaps?.length || 0}, Smells: ${result.code_smells?.length || 0}`
          };
        metric: 'Code quality'
````

### Recipe 3: Multi-agent comparison

```yaml title="promptfooconfig.yaml"
description: 'Compare multiple agents on same task'

prompts:
  - 'Find all TODO comments and convert them to GitHub issues with priority labels.'

providers:
  # Codex SDK with structured output
  - id: openai:codex-sdk
    label: codex-gpt-5.1
    config:
      model: gpt-5.1-codex
      working_dir: ./src
      output_schema:
        type: object
        properties:
          todos: { type: array, items: { type: object } }

  # Claude for natural language processing
  - id: anthropic:claude-agent-sdk
    label: claude-sonnet-4
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./src

  # Plain LLM baseline
  - id: openai:gpt-5.1
    label: baseline-gpt-5.1

tests:
  - assert:
      - type: javascript
        value: |
          // Works with any output format
          const text = typeof output === 'string' ? output : JSON.stringify(output);
          const todoCount = (text.match(/TODO/gi) || []).length;

          return {
            pass: todoCount >= 3,
            score: Math.min(todoCount / 5, 1.0),
            reason: `Found ${todoCount} TODOs`
          };
        metric: 'TODO detection'

      - type: cost
        threshold: 0.20
        metric: 'Cost'

      - type: latency
        threshold: 10000
        metric: 'Latency'
```

## Evaluation methodology

### What to measure

**1. Task completion** (binary)

Agents either complete the task or they don't:

```yaml
- type: javascript
  value: |
    // Did it complete the task? Binary question.
    const text = String(output).toLowerCase();

    // Check for evidence of task completion
    const analyzedFiles = text.includes('.py') || text.includes('.js') || text.includes('file');
    const foundIssues = text.includes('vulnerability') || text.includes('issue') || text.includes('risk');

    return {
      pass: analyzedFiles && foundIssues,
      reason: `Completed: files analyzed=${analyzedFiles}, issues found=${foundIssues}`
    };
```

**2. Automation readiness**

Can the output go directly into another system?

````yaml
- type: javascript
  value: |
    // Can we pipe this into a dashboard/CI/CD?
    const text = String(output);

    // Extract JSON from markdown or parse directly
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                     text.match(/^(\{[\s\S]*\})$/);

    try {
      const json = jsonMatch ? jsonMatch[1].trim() : text;
      const parsed = JSON.parse(json);
      const hasRequiredFields = 'vulnerabilities' in parsed || 'issues' in parsed;
      return {
        pass: hasRequiredFields,
        reason: hasRequiredFields ? 'Automation-ready' : 'Missing required fields'
      };
    } catch (e) {
      return { pass: false, reason: 'Not machine-readable JSON' };
    }
````

**3. Schema compliance**

With schema enforcement, either every field is correct or it fails:

```yaml
output_schema:
  type: object
  required: [field1, field2, field3]
  additionalProperties: false # Strict enforcement

# If it returns, it's 100% compliant
# If it errors, it's 0% compliant
```

**4. Capability boundaries**

Test whether agents handle tasks outside their tier:

```yaml
# Test: Ask read-only agent to modify files
prompts:
  - 'Fix all security issues in the codebase'
# Codex SDK (read-only) should:
# - Identify issues ✅
# - NOT attempt to write files ✅
# - Possibly explain it can't modify ✅
```

### Choosing metrics

**For automation pipelines**: Use binary completion metrics. Automation breaks on "mostly correct JSON"—either the output is machine-readable or it isn't.

**For engineering teams**: Partial coverage metrics ("found 3 of 5 vulnerabilities") are still valuable for:

- Identifying which categories the agent systematically misses
- Tracking improvement over time
- Comparing precision at different severity thresholds

**Avoid**: BLEU scores and perplexity measure fluency, not task completion. For agents, "did it work?" matters more than "how good is the text?"

### Eval design

- **Require agent capabilities.** "Write a function that reverses a string" tests the model. "Find all functions in this codebase that reverse strings" tests the agent.
- **Measure objectively.** "Is the code high quality?" is subjective. "Did it find the 3 intentional bugs?" is measurable.
- **Include failure modes.** Test what happens when you ask an agent to do something outside its configured permissions.
- **Compare agent types, not just models.** Plain LLM vs Codex SDK vs Claude Agent SDK shows capability gaps. Different models on the same provider tests the model, not the agent architecture.

### Common pitfalls

- **Testing the model instead of the agent.** "Explain what a linked list is" tests the model. "Find all linked list implementations in this codebase" tests the agent.
- **Forgetting the baseline.** Include a plain LLM alongside the agent. It'll fail tasks requiring file access, making the comparison meaningful.
- **Ignoring token distribution.** Normal token patterns (small prompt, large completion) suggest you're not exercising agent capabilities. Agent evals show huge prompts and small completions.

## See also

- [OpenAI Codex SDK provider docs](/docs/providers/openai-codex-sdk)
- [Claude Agent SDK provider docs](/docs/providers/claude-agent-sdk)
- [Agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/agentic-sdk-comparison)
- [Sandboxed code evals](/docs/guides/sandboxed-code-evals)
- [LLM red teaming](/docs/guides/llm-redteaming)
