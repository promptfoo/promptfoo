# TWZRD Agent Intel MCP Evaluation

This example uses [promptfoo](https://promptfoo.dev) to evaluate the
[TWZRD Agent Intel](https://intel.twzrd.xyz) MCP server, which provides
trust scoring for AI agent wallets.

## Tools Tested

| Tool | Description | Auth |
|------|-------------|------|
| `score_agent(wallet)` | Trust score 0–100 | Free |
| `preflight_check(wallet)` | Pass/fail gate | Free |
| `get_trust_receipt(wallet)` | On-chain receipt | Paid (x402) |

## Setup

```bash
npm install -g promptfoo
```

## Run

```bash
promptfoo eval
```

## View results

```bash
promptfoo view
```

## What is evaluated

1. `score_agent` returns a valid numeric trust score (0–100)
2. `preflight_check` returns a structured pass/fail result
3. Invalid wallet address is handled gracefully (no crash)
4. Empty wallet is rejected with an error or `pass: false`

## MCP server endpoint

```
https://intel.twzrd.xyz/mcp
```

Transport: streamable-HTTP. No authentication required for free tools.

## Related

- [simple-mcp example](../simple-mcp) — general MCP tool evaluation
- [redteam-mcp example](../redteam-mcp) — red teaming MCP servers
- [TWZRD Agent Intel docs](https://intel.twzrd.xyz)
