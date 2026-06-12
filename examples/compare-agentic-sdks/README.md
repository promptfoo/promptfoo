# compare-agentic-sdks (Agentic SDK Comparison)

Compare OpenAI Codex SDK, Claude Agent SDK, OpenCode SDK, and the Pi coding agent on a security audit task.

## Quick Start

```bash
npx promptfoo@latest init --example compare-agentic-sdks
npx promptfoo eval
npx promptfoo view
```

## What This Compares

Five providers analyze an intentionally vulnerable Python codebase:

| Provider             | How It Works                                  | Output                |
| -------------------- | --------------------------------------------- | --------------------- |
| **Codex SDK**        | Reads files implicitly, uses `output_schema`  | Structured JSON       |
| **Claude Agent SDK** | Uses Read/Grep/Glob tools explicitly          | Natural language      |
| **OpenCode SDK**     | Uses read/grep/glob tools, provider-agnostic  | Natural language      |
| **Pi**               | Uses read/grep/find/ls tools via the `pi` CLI | Natural language      |
| **Plain LLM**        | No file access (baseline)                     | Explains how to audit |

## Vulnerabilities Planted

The vulnerable code lives in the [test-codebase](./test-codebase/) directory.

**`user_service.py`:**

- MD5 password hashing
- Timing attack in authentication
- Predictable session tokens

**`payment_processor.py`:**

- Float for currency (precision loss)
- PCI-DSS violations (storing CVV)
- Sensitive data in logs

## Key Differences

**Codex SDK** returns structured JSON matching the schema. Fast, predictable, good for automation. OpenAI only.

**Claude Agent SDK** uses file system tools to explore, returns natural language. More flexible, shows reasoning. Anthropic only.

**OpenCode SDK** uses file system tools similar to Claude Agent SDK, but supports 75+ LLM providers including Anthropic, OpenAI, Google, Ollama (local), and more.

**Pi** spawns the [pi](https://pi.dev/) CLI per call with read-only tools, and is also provider-agnostic — the same `pi:anthropic/claude-sonnet-4-6` entry can be swapped to any provider/model pi supports. Requires the pi CLI (`npm install -g @earendil-works/pi-coding-agent`).

**Plain LLM** can't read files, so it explains how to do a security audit instead of doing one.

## Learn More

- [Evaluate Coding Agents Guide](/docs/guides/evaluate-coding-agents)
- [OpenAI Codex SDK](/docs/providers/openai-codex-sdk)
- [Claude Agent SDK](/docs/providers/claude-agent-sdk)
- [OpenCode SDK](/docs/providers/opencode-sdk)
- [Pi Coding Agent](/docs/providers/pi)
