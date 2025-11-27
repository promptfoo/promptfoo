---
sidebar_position: 65
title: Evaluate Coding Agents
description: Compare AI coding agents for code generation, security analysis, and refactoring with promptfoo
---

# Evaluate Coding Agents

**TL;DR**: This guide helps you pick the right AI coding agent for your scenario and evaluate it systematically. Use the [taxonomy table](#agent-types-and-when-to-use-them) to choose your agent, then jump to the [scenario](#core-evaluation-scenarios) that matches your use case.

## Understanding agent capabilities

Coding agents have **categorical** capabilities, not gradual ones. You can't prompt-engineer a plain LLM into reading files - the capabilities are architectural.

### Capability tiers

**Tier 0: Text Generation** (Plain LLM like gpt-5.1, claude-sonnet-4)

- **What it receives**: Your prompt text only
- **Can do**: Discuss code, generate snippets, explain concepts
- **Cannot do**: Read files, execute code, guarantee output structure
- **Use for**: Code review (paste code in prompt), explaining patterns

**Tier 1: Code Reading** (OpenAI Codex SDK)

- **What it receives**: Your prompt + full codebase context (1M+ tokens)
- **Can do**: Analyze code, detect vulnerabilities, produce structured JSON
- **Cannot do**: Modify files, run tests, execute bash commands
- **Use for**: Security audits, code analysis, generating reports

**Tier 2: Code Modification** (Claude Agent SDK, Cursor, Aider)

- **What it receives**: Your prompt + codebase + write/execute permissions
- **Can do**: Read, write, execute commands, iterate on failures
- **Cannot do**: Depends on sandbox restrictions
- **Use for**: Refactoring, feature implementation, test generation

The difference between tiers is binary - a plain LLM either has file access or it doesn't. This isn't about one being "better," it's about fundamentally different capabilities.

## Agent types and when to use them

Different coding agents excel at different tasks. Here's when to use each:

| Agent Type                               | Best For                             | Structured Output     | File System Access     | Tradeoffs                      |
| ---------------------------------------- | ------------------------------------ | --------------------- | ---------------------- | ------------------------------ |
| **Plain LLM** (gpt-5.1, claude-sonnet-4) | Code review, simple generation       | Manual parsing needed | No                     | Fast, cheap, limited context   |
| **OpenAI Codex SDK**                     | Security audits, schema-driven tasks | Native JSON schema    | Read-only by default   | High token use, strict output  |
| **Claude Agent SDK**                     | Refactoring, multi-file edits        | Natural language      | Full read/write + bash | Full capabilities, higher cost |
| **Cursor/Copilot/Aider**                 | IDE integration, interactive coding  | IDE-specific          | IDE-controlled         | Interactive, non-automated     |

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

## Core evaluation scenarios

This guide covers three common scenarios where coding agents provide value:

1. **[Security audit](#scenario-1-security-audit)** - Find vulnerabilities in existing code
2. **[Automated refactor](#scenario-2-automated-refactor-with-tests)** - Modify code while preserving behavior
3. **[Cross-file feature](#scenario-3-cross-file-feature-implementation)** - Implement features spanning multiple files

Each scenario shows:

- Real configuration examples
- Metrics from actual runs
- Which agent types work best
- Assertion strategies

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
      # Verify structured output
      - type: javascript
        value: |
          // Check required fields exist
          if (!Array.isArray(output.vulnerabilities) ||
              typeof output.risk_score !== 'number' ||
              typeof output.summary !== 'string') {
            return {
              pass: false,
              score: 0,
              reason: 'Missing required fields'
            };
          }

          // Check for key vulnerabilities in test code
          const vulns = output.vulnerabilities;
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

Without file system access, the plain LLM couldn't read files to analyze. It couldn't execute, so it explained. This is the core difference between conversational and agentic AI - the agent has the capabilities to actually do the work.

### What the token usage reveals

The evaluation shows a dramatic difference in token distribution:

|                       | Plain LLM | Codex SDK | Ratio       |
| --------------------- | --------- | --------- | ----------- |
| **Prompt tokens**     | 41        | 1,060,074 | **25,855x** |
| **Completion tokens** | 726       | 2,309     | 3.2x        |
| **Total**             | 767       | 1,062,383 | 1,385x      |

The 25,000x prompt difference isn't inefficiency - it's the entire codebase being read into context. The plain LLM received just the instruction (41 tokens). Codex SDK received:

- The same instruction (41 tokens)
- Full content of `payment_processor.py` (~500 tokens)
- Full content of `user_service.py` (~400 tokens)
- Codex system prompts and tool definitions (~1.059M tokens)

Context is the feature. Coding agents are context-heavy, reasoning-light. The intelligence is in synthesizing from massive context, not generating more text.

This inverts traditional LLM optimization. Chat LLMs minimize prompt and maximize completion. Coding agents maximize context and minimize completion to structured output.

### Scaling considerations

For the small test codebase (2 files, ~100 LOC), Codex read 1M tokens. This scales roughly linearly with codebase size, suggesting:

- 10 files: ~5M tokens
- 100 files: ~50M tokens
- 1,000 files: ~500M tokens (may hit context limits)

For larger codebases, consider focused scans on specific subdirectories, filtering out tests and generated code, or incremental analysis on changed files only.

Claude Agent SDK has full file system access but returns natural language by default. It's better suited for interactive remediation where you modify code after finding issues. Both SDKs show similar token patterns when analyzing full codebases.

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

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./user-service
      # Claude Agent SDK has full tool access by default
      # Use disallowed_tools to restrict if needed

tests:
  - description: 'Successful refactor with passing tests'
    assert:
      - type: javascript
        value: |
          // Check that bcrypt is imported
          const code = output.files?.['user_service.py'] || '';
          const hasBcrypt = code.includes('import bcrypt');
          const noMD5 = !code.includes('hashlib.md5');

          // Check that tests were run and passed
          const testsRan = output.bash_output?.includes('pytest');
          const testsPassed = output.bash_output?.includes('passed');

          return {
            pass: hasBcrypt && noMD5 && testsRan && testsPassed,
            score: [hasBcrypt, noMD5, testsRan, testsPassed].filter(Boolean).length / 4,
            reason: `Bcrypt: ${hasBcrypt}, No MD5: ${noMD5}, Tests ran: ${testsRan}, Tests passed: ${testsPassed}`
          };
        metric: 'Refactor Quality'

      - type: cost
        threshold: 0.50
        metric: 'Cost per refactor'
```

**Key assertions:**

1. Code changes implemented correctly (bcrypt imported, MD5 removed)
2. Tests executed via bash tool
3. Tests pass after refactoring
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

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-sonnet-4-5-20250929
      working_dir: ./flask-api
      # Claude Agent SDK has full tool access by default

tests:
  - description: 'Multi-file feature implementation'
    assert:
      - type: javascript
        value: |
          const files = output.files || {};

          // Check all required files were created/modified
          const hasRateLimiter = 'rate_limiter.py' in files;
          const apiUpdated = files['api.py']?.includes('@rate_limit');
          const testsAdded = files['test_api.py']?.includes('test_rate_limit');
          const depsUpdated = files['requirements.txt']?.includes('redis');

          return {
            pass: hasRateLimiter && apiUpdated && testsAdded && depsUpdated,
            score: [hasRateLimiter, apiUpdated, testsAdded, depsUpdated].filter(Boolean).length / 4,
            reason: `Files: ${Object.keys(files).length}, Rate limiter: ${hasRateLimiter}, API updated: ${apiUpdated}, Tests: ${testsAdded}, Deps: ${depsUpdated}`
          };
        metric: 'Cross-file completeness'
```

**Key assertions:**

1. All required files created/modified
2. Files reference each other correctly (imports, decorators)
3. Tests cover new functionality
4. Dependencies updated

## Feature deep dives

These features are key differentiators when evaluating coding agents.

### Structured output

**What it is**: Guaranteed JSON output matching a schema.

**Why it matters**: Automation requires consistent, parseable output. Manual JSON parsing fails ~5-15% of the time when LLMs return malformed JSON.

**Who has it**:

- **OpenAI Codex SDK**: Native `output_schema` with strict validation
- **OpenAI API**: `response_format` with JSON schema (gpt-4o+)
- **Claude**: Constrained output (less strict than OpenAI)

**Evaluation tactic**:

```yaml
tests:
  - assert:
      - type: is-json # Basic check
      - type: javascript
        value: |
          // Strict schema validation
          const schema = {
            vulnerabilities: Array,
            risk_score: 'number',
            summary: 'string'
          };

          for (const [key, type] of Object.entries(schema)) {
            if (type === Array && !Array.isArray(output[key])) {
              return { pass: false, reason: `${key} not an array` };
            }
            if (typeof type === 'string' && typeof output[key] !== type) {
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

**Best practice**: Always work in Git repos. Use `skip_git_repo_check: true` only for testing/examples.

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
      - type: cost
        threshold: 0.25 # Max $0.25 per audit
        metric: 'Cost per audit'

      - type: latency
        threshold: 15000 # Max 15 seconds
        metric: 'Latency'

      - type: javascript
        value: |
          // Calculate cost-per-vulnerability
          const cost = output.cost || 0;
          const vulnCount = output.vulnerabilities?.length || 0;
          const costPerVuln = vulnCount > 0 ? cost / vulnCount : 999;

          return {
            pass: costPerVuln < 0.10,
            score: Math.max(0, 1 - costPerVuln / 0.10),
            reason: `$${costPerVuln.toFixed(3)} per vulnerability`
          };
        metric: 'Cost efficiency'
```

**Optimization tips:**

- Use smaller models for simple tasks (gpt-4o-mini vs gpt-4o saves ~70%)
- Limit `working_dir` scope to reduce file reads
- Use `thread_pool_size` to reuse threads (saves ~30% on multi-task runs)

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
      - type: javascript
        value: |
          const criticalCount = output.critical?.length || 0;
          const highCount = output.high?.length || 0;
          const totalCount = criticalCount + highCount +
                            (output.medium?.length || 0) +
                            (output.low?.length || 0);

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
      - type: javascript
        value: |
          const complexity = output.complexity_score || 10;
          const hasGaps = (output.coverage_gaps?.length || 0) > 0;
          const hasSmells = (output.code_smells?.length || 0) > 0;

          return {
            pass: complexity <= 7,  // Acceptable complexity
            score: Math.max(0, (10 - complexity) / 10),
            reason: `Complexity: ${complexity}/10, Coverage gaps: ${output.coverage_gaps?.length || 0}, Smells: ${output.code_smells?.length || 0}`
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

Based on real-world evaluations, here's what makes a good coding agent eval:

### What to measure

**1. Task completion** (binary, not gradual)

Coding agents either complete the task or they don't. There's no partial credit for "trying":

```yaml
- type: javascript
  value: |
    // Did it complete the task? Binary question.
    const didReadFiles = output.files_analyzed > 0;
    const didFindIssues = output.vulnerabilities?.length > 0;
    const didReturnJSON = typeof output === 'object';

    return {
      pass: didReadFiles && didFindIssues && didReturnJSON,
      reason: `Completed: ${didReadFiles && didFindIssues && didReturnJSON}`
    };
```

**2. Automation readiness** (can you pipe the output?)

Can the output go directly into another system without human intervention?

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

**3. Schema compliance** (100% or 0%)

With schema enforcement, either every field is correct or it fails:

```yaml
output_schema:
  type: object
  required: [field1, field2, field3]
  additionalProperties: false # Strict enforcement

# If it returns, it's 100% compliant
# If it errors, it's 0% compliant
```

**4. Capability boundaries** (does it know what it can't do?)

Test whether agents gracefully handle tasks outside their tier:

```yaml
# Test: Ask read-only agent to modify files
prompts:
  - 'Fix all security issues in the codebase'
# Codex SDK (read-only) should:
# - Identify issues ✅
# - NOT attempt to write files ✅
# - Possibly explain it can't modify ✅
```

### Metrics that don't translate well

Traditional chat LLM metrics like BLEU scores or perplexity measure fluency, not task completion. For agents, you want to know "did it work?" not "how good is the text?"

Partial success metrics ("found 3 of 5 issues") are less useful than binary completion. Automation pipelines break on "mostly correct JSON" - either the output is machine-readable or it isn't.

### Eval design tips

**Tasks should require agent capabilities.** "Write a function that reverses a string" tests the model. "Find all functions in this codebase that reverse strings" tests the agent.

**Success should be measurable.** Subjective rubrics like "Is the code high quality?" are hard to act on. Objective checks like "Did it find the 3 intentional bugs?" give clear pass/fail.

**Include failure modes.** Test what happens when an agent is asked to do something outside its tier (e.g., asking a read-only agent to modify files).

**Compare tiers, not just providers.** The most interesting comparisons show the capability gap between Plain LLM vs Codex SDK (Tier 0 vs 1) or Codex vs Claude Agent (Tier 1 vs 2). Comparing different models on the same provider tests the model, not the agent architecture.

### Common pitfalls

**Testing the model instead of the agent.** If your prompt is "Explain what a linked list is," you're testing the underlying model. "Find all linked list implementations in this codebase" tests the agent's file access.

**Forgetting the baseline.** Including a plain LLM alongside the agent shows why the agent matters. The plain LLM will fail tasks requiring file access, making the comparison meaningful.

**Ignoring token distribution.** If your eval shows normal token patterns (small prompt, normal completion), you're probably not exercising agent capabilities. Agent evals typically show huge prompts (from file reads) and small completions (structured output).

## Where to go next

- [OpenAI Codex SDK provider docs](/docs/providers/openai-codex-sdk) - Full configuration reference
- [Claude Agent SDK provider docs](/docs/providers/claude-agent-sdk) - Alternative agent approach
- [Agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/agentic-sdk-comparison) - Working side-by-side comparison
- [Sandboxed code evals](/docs/guides/sandboxed-code-evals) - Isolate untrusted code execution
- [LLM red teaming](/docs/guides/llm-redteaming) - Adversarial testing for security
