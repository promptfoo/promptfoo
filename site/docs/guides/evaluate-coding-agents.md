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
- **Can do**: Discuss code, generate snippets, explain concepts
- **Cannot do**: Read files, execute code, guarantee output structure
- **Use for**: Code review (paste code in prompt), explaining patterns

:::note

"Plain LLM" means using models like gpt-5.1 or claude-sonnet-4 through promptfoo's standard chat/completions providers without an agent harness. The same models can be full coding agents when wrapped by Codex SDK or Claude Agent SDK.

:::

**Tier 1: Code Reading** (OpenAI Codex SDK provider)

- **What it receives**: Your prompt + full codebase context (1M+ tokens)
- **Can do**: Analyze code, detect vulnerabilities, produce structured JSON
- **Cannot do**: Modify files, run tests, execute bash commands
- **Use for**: Security audits, code analysis, generating reports

:::note

Codex itself supports full file modification and code execution. The promptfoo `openai:codex-sdk` provider is configured read-only for safety. This is an intentional design choice for eval scenarios where you want analysis without side effects.

:::

**Tier 2: Code Modification** (Claude Agent SDK, Cursor, Aider)

- **What it receives**: Your prompt + codebase + write/execute permissions
- **Can do**: Read, write, execute commands, iterate on failures
- **Cannot do**: Depends on sandbox restrictions
- **Use for**: Refactoring, feature implementation, test generation

The tiers have sharp boundaries (file access or not), but within each tier there are meaningful gradations: how much code can be seen, what commands are allowed, what MCP servers are connected, etc.

## When to use each agent

| Agent Type                               | Best For                             | Structured Output  | File System Access       | Tradeoffs                      |
| ---------------------------------------- | ------------------------------------ | ------------------ | ------------------------ | ------------------------------ |
| **Plain LLM** (gpt-5.1, claude-sonnet-4) | Code review, simple generation       | JSON schema or raw | No                       | Fast, cheap, limited context   |
| **OpenAI Codex SDK**                     | Security audits, schema-driven tasks | Native JSON schema | Read-only (in promptfoo) | High token use, strict output  |
| **Claude Agent SDK**                     | Refactoring, multi-file edits        | JSON schema        | Configurable per-tool    | Full capabilities, higher cost |
| **Cursor/Copilot/Aider**                 | IDE integration, interactive coding  | IDE-specific       | IDE-controlled           | Interactive, non-automated     |

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
| Duration                     | 2m 24s                                | &lt;5s                                  |
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

The 1M token count has two components:

- **Fixed overhead** (~1M tokens): Codex system prompts, tool definitions, and internal scaffolding. This cost is roughly constant regardless of codebase size.
- **Variable overhead** (~1K tokens): Actual file contents. Scales with the number and size of files the agent reads.

For this toy codebase (2 files, ~100 LOC), the fixed overhead dominates. For larger codebases:

- The variable portion scales roughly linearly with files touched
- Modern context windows are ~1M tokens, not 500M—agents use streaming, caching, and compaction rather than loading everything at once
- Real-world scaling depends on which files the agent decides to read, not total repo size

**For larger codebases**: Focus scans on specific subdirectories, filter out tests and generated code, or analyze only changed files. Use `additional_directories` to limit scope.

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
      # Tools are enabled by configuration. By default the agent can
      # read/write files and run bash commands in working_dir.
      # Use disallowed_tools to restrict specific capabilities.

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

Claude Agent SDK returns the final text response (or structured output if `output_format` is configured). The agent doesn't expose intermediate file contents or bash output in the response—you evaluate based on what the agent reports doing. For verification, you can check files on disk after the eval or use structured output.

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
      # Can read, write, and execute bash in working_dir

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

**Why it matters**: Automation requires consistent, parseable output. Manual JSON parsing fails ~5-15% of the time when LLMs return malformed JSON.

**Who has it**:

- **OpenAI Codex SDK**: Native `output_schema` with strict validation
- **OpenAI API**: `response_format` with JSON schema (gpt-4o, gpt-5.1)
- **Claude API and Agent SDK**: JSON schema support via structured outputs (Sonnet 4, Sonnet 4.5, Opus 4.1)

Both OpenAI and Anthropic now provide strong JSON schema guarantees. The main difference is ergonomics: Codex SDK's `output_schema` is inline YAML, while Claude uses the API's structured output feature.

**Evaluation tactic**:

```yaml
tests:
  - assert:
      - type: is-json # Basic check
      - type: javascript
        value: |
          // In JS assertions, output is a string - parse it first
          const result = typeof output === 'string' ? JSON.parse(output) : output;

          // Strict schema validation
          const schema = {
            vulnerabilities: Array,
            risk_score: 'number',
            summary: 'string'
          };

          for (const [key, type] of Object.entries(schema)) {
            if (type === Array && !Array.isArray(result[key])) {
              return { pass: false, reason: `${key} not an array` };
            }
            if (typeof type === 'string' && typeof result[key] !== type) {
              return { pass: false, reason: `${key} not a ${type}` };
            }
          }

          return { pass: true, score: 1.0 };
        metric: 'Schema compliance'
```

**Typical results:**

- With `output_schema`: 98-100% compliance
- Without: 85-92% compliance (manual retry logic needed)

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

**Why it matters**: Agent tasks are 5-20x more expensive than simple LLM calls due to tool use, file reads, and multiple turns.

**Typical costs** (as of 2025):

- Security audit (5 files): $0.10-0.30
- Simple refactor (1 file): $0.05-0.15
- Complex feature (10+ files): $0.50-2.00

**Typical latency**:

- Security audit: 8-15s
- Simple refactor: 6-12s
- Complex feature: 20-60s

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

**Strategy 3: Robust assertions**

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

Tier 2 agents can execute arbitrary code. Before running evals:

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

For comprehensive sandboxing, see [Sandboxed code evals](/docs/guides/sandboxed-code-evals).

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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Security scanner with severity metrics'

prompts:
  - 'Scan all code for security vulnerabilities. Return JSON with findings grouped by severity.'

providers:
  - id: openai:codex-sdk
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

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: |
          const result = typeof output === 'string' ? JSON.parse(output) : output;
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
```

### Recipe 2: Code quality metrics

```yaml title="promptfooconfig.yaml"
description: 'Code quality analysis with complexity scoring'

prompts:
  - 'Analyze code quality. Return cyclomatic complexity, test coverage gaps, and code smells.'

providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      working_dir: ./src
      output_schema:
        type: object
        required: [complexity_score, coverage_gaps, code_smells]
        properties:
          complexity_score: { type: number } # 1-10 scale
          coverage_gaps: { type: array, items: { type: string } }
          code_smells: { type: array, items: { type: string } }

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: |
          const result = typeof output === 'string' ? JSON.parse(output) : output;
          const complexity = result.complexity_score || 10;
          const hasGaps = (result.coverage_gaps?.length || 0) > 0;
          const hasSmells = (result.code_smells?.length || 0) > 0;

          return {
            pass: complexity <= 7,  // Acceptable complexity
            score: Math.max(0, (10 - complexity) / 10),
            reason: `Complexity: ${complexity}/10, Coverage gaps: ${result.coverage_gaps?.length || 0}, Smells: ${result.code_smells?.length || 0}`
          };
        metric: 'Code quality'
```

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
- type: is-json
- type: javascript
  value: |
    // Did it complete the task? Binary question.
    const result = typeof output === 'string' ? JSON.parse(output) : output;
    const didReadFiles = result.files_analyzed > 0;
    const didFindIssues = result.vulnerabilities?.length > 0;

    return {
      pass: didReadFiles && didFindIssues,
      reason: `Completed: files=${didReadFiles}, issues=${didFindIssues}`
    };
```

**2. Automation readiness**

Can the output go directly into another system?

```yaml
- type: javascript
  value: |
    // Can we pipe this into a dashboard/CI/CD?
    try {
      const parsed = typeof output === 'string' ? JSON.parse(output) : output;
      const hasRequiredFields = 'vulnerabilities' in parsed && 'risk_score' in parsed;
      return {
        pass: hasRequiredFields,
        reason: hasRequiredFields ? 'Automation-ready' : 'Requires manual parsing'
      };
    } catch (e) {
      return { pass: false, reason: 'Not machine-readable' };
    }
```

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
- **Include failure modes.** Test what happens when you ask a read-only agent to modify files.
- **Compare tiers, not just providers.** Plain LLM vs Codex SDK (Tier 0 vs 1) or Codex vs Claude Agent (Tier 1 vs 2) shows capability gaps. Different models on the same provider tests the model, not the agent.

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
