---
title: Correctover CCS Expected Output
description: "Validate AI agent tool calls against Correctover CCS runtime security rules."
---

# Correctover CCS

The `correctover` assertion type validates AI agent tool calls using [Correctover CCS (Call Shield)](https://correctover.com) runtime verification. It intercepts tool call payloads and checks them against 24 detection rules covering RCE, SSRF, path traversal, credential leaks, and more.

## Setup

Install the CCS CLI:

```bash
pip install correctover-ccs
```

Verify installation:

```bash
ccs --version
```

## Configuration

```yaml
assertions:
  # Basic usage - scan with default rules
  - type: correctover

  # With custom rules file
  - type: correctover
    value: /path/to/ccs-rules.yaml

  # Inverse mode - assert that CCS DOES find issues (for negative testing)
  - type: not-correctover
```

## How It Works

The assertion handler:

1. Extracts data from the provider response, including the output text and any recorded tool-call metadata.
2. If a `transform` function is configured on the assertion, the post-transform output is also scanned separately.
3. Sends each payload to the CCS CLI for scanning.
4. Parses the JSON output and determines pass/fail based on whether violations were found.

### Scan Coverage

| Data Source | Description |
|-------------|-------------|
| `providerResponse.output` | The final text output from the agent |
| Transformed output | Post-transform output if the assertion defines a `transform` function |
| `metadata.toolCalls` | Recorded tool calls from agent providers (Claude Agent SDK, n8n, ElevenLabs, etc.) |
| `metadata.toolArgs` | Direct tool arguments from MCP provider |
| `metadata.originalPayload` | Original payload from MCP provider |

## Behavior

### Pass/Fail Logic

| Mode | CCS finds issues | CCS finds no issues | CCS error |
|------|-----------------|--------------------|-----------|
| `correctover` | FAIL | PASS | FAIL |
| `not-correctover` | PASS | FAIL | FAIL |

### Error Handling

- **CLI not found**: Assertion fails with installation instructions.
- **Scanner crash/timeout**: Assertion fails with error details (never silently passes).
- **No output to scan**: Normal assertion passes; inverse assertion fails.

### Security

All finding details in assertion reasons are automatically redacted to prevent credential leakage in logs and reports. Patterns matching API keys, tokens, and private keys are replaced with `<REDACTED>`.

## Performance

- P50 latency: ~22µs per check (local CCS binary)
- P99 latency: ~99µs per check
- No LLM calls required (deterministic rule matching)

## Related

- [Correctover Documentation](https://correctover.com/docs)
- [CCS Standard](https://github.com/Correctover/standards)
