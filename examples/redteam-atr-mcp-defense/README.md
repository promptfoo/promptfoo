# redteam-atr-mcp-defense (MCP Red Team with Deterministic Output Scanning)

This example shows how to add a deterministic output-scanning layer to Promptfoo's MCP red teaming with [ATR (Agent Threat Rules)](https://github.com/Agent-Threat-Rule/agent-threat-rules).

## Why?

Promptfoo's LLM-based grading catches novel attacks through semantic understanding. ATR catches known text patterns with regex and can run without additional LLM calls. They complement each other:

| Layer             | Method     | Catches                                     | Cost      |
| ----------------- | ---------- | ------------------------------------------- | --------- |
| Promptfoo grading | LLM rubric | Novel/semantic attacks                      | API calls |
| ATR assertion     | Regex      | Known text patterns in model output strings | None      |

## Getting Started

Requires Node.js `^20.20.0` or `>=22.22.0`, as supported by Promptfoo
(`agent-threat-rules` is published as pure ESM).

```bash
npx promptfoo@latest init --example redteam-atr-mcp-defense
cd redteam-atr-mcp-defense
npm install agent-threat-rules
export ANTHROPIC_API_KEY=your_key_here
npx promptfoo redteam run
```

## How the ATR Layer Works

The `atr-assertion.mjs` file:

1. Loads ATR once and caches the engine across test cases
2. Scans each final model output for known threat patterns
3. Fails the test if any high/critical severity patterns match
4. Reports the specific ATR rule IDs that triggered

This runs alongside Promptfoo's built-in assertions, adding a fast deterministic check without replacing LLM-based evaluation.

This example scans final assistant outputs only. It does not inspect raw MCP tool descriptions or raw MCP tool responses, so it should not be treated as a standalone detector for tool poisoning in the MCP layer itself.

## What ATR Catches

When those patterns surface in final outputs, ATR can flag examples such as:

- Prompt injection patterns (hidden instructions, system prompt overrides)
- Credential exfiltration (API keys, private keys, database URLs in outputs)
- Privilege escalation (unauthorized admin operations, shell commands)

ATR also has broader rule categories for surfaces such as tool poisoning and skill compromise. This example does not inspect those raw artifacts directly; it only sees them if their text reaches the final model output.

Full rule list: [ATR rule categories](https://github.com/Agent-Threat-Rule/agent-threat-rules#what-atr-detects)

## Customization

Adjust the severity threshold by editing the `FAIL_SEVERITIES` constant at the top of `atr-assertion.mjs`:

```javascript
// Default: critical + high
const FAIL_SEVERITIES = ['critical', 'high'];

// Stricter: also fail on medium
const FAIL_SEVERITIES = ['critical', 'high', 'medium'];
```

To filter by category instead, replace the `threats` filter:

```javascript
// Only fail on context-exfiltration matches (credentials, secrets, system prompts leaking out)
const threats = matches.filter((m) => m.rule.tags.category === 'context-exfiltration');
```

## Limitations

ATR uses regex detection. It cannot catch:

- Novel semantic attacks that paraphrase known patterns
- Context-dependent threats requiring conversation history
- Encoded attacks not covered by its current rules

For these, Promptfoo's LLM-based grading is the right tool. Use both together.

## Further Reading

- [ATR Limitations](https://github.com/Agent-Threat-Rule/agent-threat-rules/blob/main/LIMITATIONS.md)
- [Promptfoo MCP Red Teaming](https://www.promptfoo.dev/docs/red-team/plugins/mcp/)
