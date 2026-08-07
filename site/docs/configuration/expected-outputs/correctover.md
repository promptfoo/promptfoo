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

Add the assertion under `tests[].assert` in your promptfoo config:

```yaml
tests:
  - assert:
      # Basic usage - scan with default rules
      - type: correctover

      # With custom rules file
      - type: correctover
        value: /path/to/ccs-rules.yaml

      # Inverse mode - assert that CCS DOES find issues (for negative testing)
      - type: not-correctover
```

:::important
Assertions must be placed under `tests[].assert` or `defaultTest.assert`. A top-level `assertions` key in config files is not supported.
:::

## How It Works

The assertion handler:

1. Extracts data from the provider response, including the output text and any recorded tool-call metadata.
2. If a `transform` function is configured on the assertion, the post-transform output is also scanned separately.
3. Sends each payload to the CCS CLI via stdin (using `spawn`, not shell interpolation).
4. Parses the JSON output and determines pass/fail based on whether violations were found.

### Scan Coverage

| Data Source | Description |
|-------------|-------------|
| `providerResponse.output` | The final text output from the agent |
| Transformed output | Post-transform output if the assertion defines a `transform` function |
| `metadata.toolCalls` | Recorded tool calls from agent providers (OpenAI format: `function.arguments`) |
| `metadata.tool_calls` | Recorded tool calls (n8n/snake_case format: `arguments`) |
| `metadata.actions` | Action records from some providers |
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
- **Scanner crash/timeout**: Assertion fails with sanitized error details (never silently passes).
- **Non-JSON output**: Treated as an error (not a false "all clear" or fabricated finding).
- **Empty output**: Treated as a scanner failure, not a clean scan.
- **No output to scan**: Normal assertion passes; inverse assertion fails.

### Security

All finding details in assertion reasons are automatically redacted to prevent credential leakage in logs and reports. The following patterns are detected and replaced with `<REDACTED>`:

- GitHub PATs (`ghp_`, `gho_`, etc.)
- OpenAI/Anthropic keys (`sk-`, `sk_`)
- AWS access key IDs (`AKIA...`)
- Password patterns (`password=...`)
- Bearer tokens
- Long base64 and hex strings

:::important
Redaction is applied to all assertion reason strings and error messages before they are stored in logs or results.
:::

## Performance

The CCS verification engine operates at sub-10us P50 latency. Since the assertion spawns the CCS CLI as a subprocess for each payload, end-to-end latency includes process startup overhead. For large eval suites, consider batching or running with sufficient timeout (default: 30 seconds per scan).

No LLM calls are required -- detection is purely rule-based and deterministic.

## Related

- [Correctover Documentation](https://correctover.com/docs)
- [CCS Standard](https://github.com/Correctover/standards)
