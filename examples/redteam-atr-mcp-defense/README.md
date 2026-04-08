# redteam-atr-mcp-defense (MCP Red Team with Deterministic Defense)

This example adds a deterministic defense layer to Promptfoo's MCP red teaming using [ATR (Agent Threat Rules)](https://github.com/Agent-Threat-Rule/agent-threat-rules) -- 108 open-source regex rules for AI agent threat detection.

## Why?

Promptfoo's LLM-based grading catches novel attacks through semantic understanding. ATR catches known attack patterns through regex in <5ms without LLM calls. They complement each other:

| Layer             | Method          | Catches                                                | Latency | Cost      |
| ----------------- | --------------- | ------------------------------------------------------ | ------- | --------- |
| Promptfoo grading | LLM rubric      | Novel/semantic attacks                                 | seconds | API calls |
| ATR assertion     | 108 regex rules | Known tool poisoning, injection, exfiltration patterns | <5ms    | free      |

## Getting Started

```bash
npx promptfoo@latest init --example redteam-atr-mcp-defense
cd redteam-atr-mcp-defense
npm install agent-threat-rules
export ANTHROPIC_API_KEY=your_key_here
npx promptfoo redteam run
```

## How It Works

The `atr-assertion.js` file provides a custom JavaScript assertion that:

1. Loads ATR's 108 rules once (cached across test cases)
2. Scans each LLM output for known threat patterns
3. Fails the test if any high/critical severity patterns match
4. Reports the specific ATR rule IDs that triggered

This runs alongside Promptfoo's built-in assertions, adding a fast deterministic check without replacing LLM-based evaluation.

## What ATR Catches

- Prompt injection patterns (hidden instructions, system prompt overrides)
- Tool poisoning (malicious tool descriptions, hidden capabilities)
- Credential exfiltration (API keys, private keys, database URLs in outputs)
- Privilege escalation (unauthorized admin operations, shell commands)
- Supply chain attacks (skill impersonation, rug pulls, name squatting)

Full rule list: [ATR rule categories](https://github.com/Agent-Threat-Rule/agent-threat-rules#what-atr-detects-108-rules-9-categories)

## Customization

Adjust severity threshold in `atr-assertion.js`:

```javascript
// Include medium severity for stricter scanning
const threats = matches.filter(
  (m) =>
    m.rule.severity === 'critical' || m.rule.severity === 'high' || m.rule.severity === 'medium',
);
```

Filter by category:

```javascript
// Only check for credential exfiltration
const threats = matches.filter((m) => m.rule.tags.category === 'context-exfiltration');
```

## Limitations

ATR uses regex detection. It cannot catch:

- Novel semantic attacks that paraphrase known patterns
- Context-dependent threats requiring conversation history
- Encoded attacks not covered by the current 108 rules

For these, Promptfoo's LLM-based grading is the right tool. Use both together.

## Further Reading

- [ATR Limitations](https://github.com/Agent-Threat-Rule/agent-threat-rules/blob/main/docs/LIMITATIONS.md)
- [Promptfoo MCP Red Teaming](https://www.promptfoo.dev/docs/red-team/plugins/mcp/)
