# agentic-sdk-comparison (Agentic SDK Security Audit)

Comprehensive comparison of OpenAI Codex SDK and Claude Agent SDK capabilities through a realistic security audit scenario.

## Overview

This example demonstrates how different agentic coding assistants approach:

1. **Structured output generation** - Testing JSON schema support
2. **Multi-file codebase analysis** - Testing file system tool integration
3. **Security vulnerability detection** - Testing domain knowledge
4. **Code generation with constraints** - Testing code quality

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

## Test Cases

### 1. Structured Security Audit (JSON Schema)

**What it tests:**
- Native JSON schema support (Codex advantage)
- Structured output generation
- Vulnerability enumeration
- Risk scoring

**Expected output schema:**
```json
{
  "vulnerabilities": [
    {
      "file": "user_service.py",
      "line_range": "18-19",
      "severity": "critical",
      "category": "cryptography",
      "issue": "Using MD5 for password hashing",
      "recommendation": "Use bcrypt or argon2"
    }
  ],
  "risk_score": 85,
  "summary": "Critical security issues found"
}
```

### 2. Multi-File Codebase Analysis

**What it tests:**
- File system tool usage (Claude Agent advantage)
- Cross-file understanding
- Comprehensive vulnerability detection
- Prioritization abilities

**Expected capabilities:**
- Read multiple Python files
- Map data flow across modules
- Identify architectural security issues
- Provide prioritized remediation plan

### 3. Secure Code Generation

**What it tests:**
- Code generation quality
- Security best practices knowledge
- Constraint satisfaction
- Type safety awareness

**Requirements:**
- bcrypt/argon2 for password hashing
- Cryptographically secure session tokens
- No password hash exposure
- Proper type hints and docstrings
- Session invalidation logic

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

## Key Differences Demonstrated

| Capability | Codex SDK | Claude Agent SDK |
|-----------|-----------|------------------|
| **Structured Output** | Native JSON schema | Prompt-based |
| **File System Access** | Implicit | Explicit tools (Read/Grep/Glob) |
| **Response Format** | Predictable structure | Natural language + structured sections |
| **Speed** | Faster (no tool overhead) | Slower (tool execution) |
| **Accuracy** | High on structured tasks | High on exploratory tasks |

## Expected Results

**Codex SDK advantages:**
- Cleaner JSON output conforming to schema
- Faster response times
- Better structured data for test case 1

**Claude Agent SDK advantages:**
- More thorough multi-file analysis
- Better file discovery and exploration
- Deeper contextual understanding for test case 2

**Both should excel at:**
- Generating secure refactored code
- Identifying critical vulnerabilities
- Providing actionable recommendations

## Learn More

- [OpenAI Codex SDK Documentation](https://www.promptfoo.dev/docs/providers/openai-codex-sdk/)
- [Claude Agent SDK Documentation](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/)
- [Detailed Provider Comparison](../../AGENTIC_SDK_COMPARISON.md)
