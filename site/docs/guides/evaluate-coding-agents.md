---
sidebar_position: 65
title: Evaluate Coding Agents
description: Test AI coding agents for code generation, security analysis, and multi-file reasoning with promptfoo
---

# Evaluate Coding Agents

AI coding agents automate software development tasks like code generation, security analysis, and refactoring. This guide shows how to evaluate coding agents systematically using promptfoo.

## Why Evaluate Coding Agents

Coding agents have unique failure modes:

- **Security blind spots** - Missing vulnerabilities or flagging false positives
- **Context loss** - Failing to understand multi-file dependencies
- **Syntax errors** - Generating invalid code that won't compile
- **Schema violations** - Producing malformed structured output
- **Incomplete refactoring** - Missing edge cases when modifying code

Systematic evaluation catches these issues before they impact users.

## Evaluation Dimensions

Test coding agents across these dimensions:

### 1. Code Generation Quality

Measure whether generated code is syntactically correct, follows language idioms, and handles edge cases.

### 2. Security Analysis

Test ability to detect real vulnerabilities without excessive false positives.

### 3. Multi-File Reasoning

Verify the agent understands dependencies and relationships across multiple files.

### 4. Structured Output

Ensure responses match required JSON schemas for downstream automation.

### 5. Tool Use Accuracy

Validate correct use of file operations, shell commands, and function calls.

## Choosing a Coding Agent SDK

Promptfoo supports multiple coding agent SDKs:

### OpenAI Codex SDK

Use for code generation and analysis tasks:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      output_schema:
        type: object
        properties:
          vulnerabilities:
            type: array
```

**Strengths:**
- Native JSON schema support for structured output
- Thread-based conversation management
- gpt-5.1-codex model optimized for code

**Use when:** You need structured output, code analysis, or multi-turn conversations.

### Claude Agent SDK

Use for file manipulation and system operations:

```yaml
providers:
  - id: anthropic:agent-sdk
    config:
      model: claude-sonnet-4-5
      tools:
        - read_file
        - write_file
        - bash
```

**Strengths:**
- Extensive file system tools
- MCP server integration
- CLAUDE.md project context

**Use when:** You need file operations, bash commands, or MCP integration.

See the [agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/agentic-sdk-comparison) for detailed comparison.

## Security Audit Evaluation

Test an agent's ability to find security vulnerabilities in code.

### Setup

Create intentionally vulnerable test files:

```python title="test-code/user_service.py"
import hashlib

class UserService:
    def create_user(self, username: str, password: str):
        # Vulnerability: MD5 for password hashing
        password_hash = hashlib.md5(password.encode()).hexdigest()
        return {"user": username, "hash": password_hash}
```

### Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      working_dir: ./test-code
      output_schema:
        type: object
        properties:
          vulnerabilities:
            type: array
            items:
              type: object
              properties:
                severity:
                  type: string
                  enum: [critical, high, medium, low]
                file:
                  type: string
                line:
                  type: number
                description:
                  type: string
              required:
                - severity
                - file
                - description

prompts:
  - 'Analyze all Python files for security vulnerabilities. Return findings in JSON.'

tests:
  - assert:
      - type: is-json
        value: 'Verify structured output'
      - type: javascript
        value: 'output.vulnerabilities.length >= 1'
        metric: 'Detected vulnerabilities'
      - type: javascript
        value: 'output.vulnerabilities.some(v => v.description.toLowerCase().includes("md5"))'
        metric: 'Found MD5 vulnerability'
      - type: javascript
        value: 'output.vulnerabilities.every(v => v.file && v.severity)'
        metric: 'Complete vulnerability data'
```

### Key Assertions

1. **Schema validation** - Verify JSON structure matches schema
2. **Vulnerability detection** - Check specific vulnerabilities are found
3. **False positive rate** - Track non-issues flagged as problems
4. **Severity accuracy** - Validate criticality ratings

## Code Generation Evaluation

Test an agent's ability to generate working code from specifications.

### Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      working_dir: ./generated-code

prompts:
  - 'Write a Python function that validates email addresses using regex. Include tests.'

tests:
  - description: 'Valid email accepted'
    assert:
      - type: python
        value: file://check_email_validator.py
      - type: contains
        value: 'def validate_email'
        metric: 'Function exists'

  - description: 'Invalid email rejected'
    assert:
      - type: python
        value: file://check_invalid_email.py
      - type: not-contains
        value: 'AssertionError'
        metric: 'Tests pass'
```

### Validation Script

```python title="check_email_validator.py"
import os
import sys

# Load generated code
with open('email_validator.py') as f:
    exec(f.read())

# Test valid email
assert validate_email('user@example.com') == True
assert validate_email('invalid@') == False
```

## Multi-File Reasoning Evaluation

Test whether an agent understands dependencies across files.

### Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      working_dir: ./multi-file-project
      output_schema:
        type: object
        properties:
          analysis:
            type: string
          dependencies:
            type: array
            items:
              type: object
              properties:
                file:
                  type: string
                imports:
                  type: array
                  items:
                    type: string

prompts:
  - 'Analyze this codebase and identify all file dependencies. Return as JSON.'

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: 'output.dependencies.length > 0'
        metric: 'Found dependencies'
      - type: javascript
        value: |
          const userServiceDep = output.dependencies.find(d => d.file.includes('user_service'));
          userServiceDep && userServiceDep.imports.includes('hashlib')
        metric: 'Correct import detection'
```

## Comparing Agent SDKs

Evaluate multiple agents side-by-side:

```yaml title="promptfooconfig.yaml"
providers:
  - id: codex-gpt-5.1
    label: 'OpenAI Codex SDK (gpt-5.1-codex)'
    config:
      id: openai:codex-sdk
      model: gpt-5.1-codex
      working_dir: ./test-codebase

  - id: codex-gpt-4o
    label: 'OpenAI Codex SDK (gpt-4o)'
    config:
      id: openai:codex-sdk
      model: gpt-4o
      working_dir: ./test-codebase

  - id: claude-agent
    label: 'Claude Agent SDK'
    config:
      id: anthropic:agent-sdk
      model: claude-sonnet-4-5
      workingDirectory: ./test-codebase

prompts:
  - 'Analyze all Python files for security vulnerabilities and return findings in JSON format.'

tests:
  - description: 'Security audit scenario'
    assert:
      - type: is-json
      - type: cost
        threshold: 0.50
        metric: 'Cost per audit'
      - type: javascript
        value: 'output.vulnerabilities?.length >= 3'
        metric: 'Vulnerabilities detected'
```

This configuration tests:
- **Quality** - Vulnerability detection accuracy
- **Cost** - Price per security audit
- **Consistency** - JSON schema adherence

## Best Practices

### Use Real Code Samples

Test with actual code from your domain:

```yaml
prompts:
  - file://prompts/analyze-payment-service.txt

tests:
  - vars:
      codebase: file://real-projects/payment-service/
```

### Test Edge Cases

Include code with subtle bugs:

```python
# Edge case: Off-by-one error
def get_last_element(arr):
    return arr[len(arr)]  # Bug: should be len(arr) - 1
```

### Measure Consistency

Run the same test multiple times:

```yaml
tests:
  - description: 'Repeated security audit'
    repeat: 5
    assert:
      - type: similar
        threshold: 0.8
        metric: 'Consistency across runs'
```

### Track Cost and Latency

Monitor performance metrics:

```yaml
tests:
  - assert:
      - type: cost
        threshold: 0.25
      - type: latency
        threshold: 30000  # 30 seconds
```

### Validate Structured Output

Always verify JSON schema compliance:

```yaml
tests:
  - assert:
      - type: is-json
      - type: is-valid-openai-tools-call
      - type: javascript
        value: 'typeof output === "object" && Array.isArray(output.findings)'
```

## Common Pitfalls

### Ambiguous Prompts

**Bad:**
```yaml
prompts:
  - 'Review this code'
```

**Good:**
```yaml
prompts:
  - 'Analyze all Python files in this directory for:\n1. Security vulnerabilities (SQL injection, XSS, weak crypto)\n2. Performance issues\n3. Code style violations\nReturn findings in JSON format with severity levels.'
```

### Missing Context

Provide working directory and relevant files:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./full-project  # Not just ./single-file
      model: gpt-5.1-codex
```

### Weak Assertions

Test specific outcomes, not general success:

**Bad:**
```yaml
assert:
  - type: contains
    value: 'vulnerability'
```

**Good:**
```yaml
assert:
  - type: javascript
    value: |
      const vulns = output.vulnerabilities || [];
      const hasWeakCrypto = vulns.some(v =>
        v.description.toLowerCase().includes('md5') ||
        v.description.toLowerCase().includes('weak')
      );
      return hasWeakCrypto;
    metric: 'Detected weak cryptography'
```

## Example Scenarios

### Bug Fix Verification

```yaml
prompts:
  - 'Fix the off-by-one error in get_last_element() function'

tests:
  - assert:
      - type: python
        value: file://test_fixed_function.py
      - type: contains
        value: 'len(arr) - 1'
        metric: 'Correct fix applied'
```

### Code Review

```yaml
prompts:
  - 'Review this pull request and suggest improvements:\n{{ pull_request_diff }}'

tests:
  - vars:
      pull_request_diff: file://diffs/pr-123.diff
    assert:
      - type: llm-rubric
        value: 'Identifies actual code issues without nitpicking style'
      - type: javascript
        value: 'output.suggestions?.length > 0 && output.suggestions?.length < 10'
        metric: 'Reasonable number of suggestions'
```

### Refactoring Task

```yaml
prompts:
  - 'Refactor UserService to use bcrypt instead of MD5 for password hashing'

tests:
  - assert:
      - type: python
        value: file://test_refactored_service.py
      - type: not-contains
        value: 'hashlib.md5'
        metric: 'Removed MD5'
      - type: contains
        value: 'bcrypt'
        metric: 'Added bcrypt'
```

## Advanced Techniques

### Thread-Based Conversations

Test multi-turn interactions:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      persist_threads: true
      thread_pool_size: 1

tests:
  - description: 'Initial code generation'
    vars:
      request: 'Create a User class with email validation'

  - description: 'Iterative improvement'
    vars:
      request: 'Add password hashing with bcrypt'

  - description: 'Final verification'
    vars:
      request: 'Review the complete implementation'
```

### Custom Metrics

Track domain-specific metrics:

```yaml
tests:
  - assert:
      - type: javascript
        value: |
          const metrics = {
            vulnerabilitiesFound: output.vulnerabilities?.length || 0,
            criticalCount: output.vulnerabilities?.filter(v => v.severity === 'critical').length || 0,
            falsePositives: output.vulnerabilities?.filter(v => v.file.includes('test_')).length || 0,
            avgSeverityScore: calculateAvgSeverity(output.vulnerabilities)
          };

          return metrics.criticalCount >= 1 && metrics.falsePositives === 0;
        metric: 'Security audit quality'
```

## Next Steps

- See [OpenAI Codex SDK provider](/docs/providers/openai-codex-sdk) for configuration details
- See [Claude Agent SDK provider](/docs/providers/claude-agent-sdk) for alternative approach
- Try the [agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/agentic-sdk-comparison)
- Read [sandboxed code evals](/docs/guides/sandboxed-code-evals) for security isolation
- Explore [LLM red teaming](/docs/guides/llm-redteaming) for adversarial testing
