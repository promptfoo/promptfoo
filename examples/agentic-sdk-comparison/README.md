# agentic-sdk-comparison (Agentic SDK Security Audit)

Comprehensive comparison of OpenAI Codex SDK and Claude Agent SDK capabilities through a realistic security audit scenario.

## Overview

This example compares how different agentic coding assistants detect security vulnerabilities:

**OpenAI Codex SDK** - Uses native JSON schema support (`output_schema`) to return structured vulnerability data

**Claude Agent SDK** - Uses file system tools (Read, Grep, Glob) to analyze code and return natural language findings

## Test Scenario

The example includes an intentionally vulnerable Python codebase with common security issues:

### Vulnerabilities Planted

**`user_service.py`:**

- MD5 password hashing (cryptographic weakness)
- Timing attack vulnerability in authentication
- Predictable session tokens
- Password hash exposure in API responses
- Missing session invalidation on user deletion

**`payment_processor.py`:**

- Float for currency calculations (precision loss)
- PCI-DSS violations (storing CVV and full card numbers)
- Sensitive data logging without sanitization
- Missing input validation
- SQL injection patterns (in comments)

## Providers Compared

1. **OpenAI Codex SDK (gpt-5.1-codex)** - Latest Codex model
2. **OpenAI Codex SDK (gpt-4o)** - GPT-4o for comparison
3. **Claude Agent SDK (sonnet)** - Anthropic Claude with tools

## How It Works

The eval uses a single prompt: "Analyze all Python files in the current directory for security vulnerabilities."

**Codex SDK configuration** includes `output_schema` to enforce structured JSON output:

```yaml
output_schema:
  type: object
  required: [vulnerabilities, risk_score, summary]
  properties:
    vulnerabilities:
      type: array
      items:
        properties:
          file: { type: string }
          severity: { type: string, enum: [critical, high, medium, low] }
          category: { type: string }
          issue: { type: string }
          recommendation: { type: string }
```

**Claude Agent SDK configuration** uses file system tools to analyze code and returns natural language findings.

The test assertion intelligently handles both output formats - validating structured JSON from Codex SDK and checking for security issue mentions in Claude Agent SDK's natural language output.

## Running the Comparison

```bash
# Install dependencies first
npm install @openai/codex-sdk  # Required for Codex
npm install @anthropic-ai/claude-agent-sdk  # Required for Claude Agent

# Run the evaluation
npx promptfoo@latest eval -c examples/agentic-sdk-comparison/promptfooconfig.yaml

# View results
npx promptfoo@latest view
```

## Key Differences

| Feature           | Codex SDK                              | Claude Agent SDK                      |
| ----------------- | -------------------------------------- | ------------------------------------- |
| **Output Format** | Native JSON schema via `output_schema` | Natural language                      |
| **File System**   | Implicit (SDK handles file reading)    | Explicit tools (Read, Grep, Glob, LS) |
| **Speed**         | Faster (no tool call overhead)         | Slower (multiple tool executions)     |
| **Validation**    | Schema-enforced structure              | Flexible natural language             |

## What This Example Shows

**Codex SDK strengths:**

- Returns structured JSON matching exact schema
- Fast execution with no tool overhead
- Predictable output format for automation

**Claude Agent SDK strengths:**

- Uses file system tools for exploration
- Returns detailed natural language analysis
- More flexible output format

Both should identify the same security issues - the difference is in how they structure and return the findings.

## Learn More

- [OpenAI Codex SDK Documentation](https://www.promptfoo.dev/docs/providers/openai-codex-sdk/)
- [Claude Agent SDK Documentation](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/)
- [Detailed Provider Comparison](../../AGENTIC_SDK_COMPARISON.md)
