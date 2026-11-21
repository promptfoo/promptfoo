# MCP Server Contract Drift Gate Example

This example demonstrates how to prevent silent evaluation invalidation caused by upstream Model Context Protocol (MCP) tool contract changes (addressing issue [#11906](https://github.com/promptfoo/promptfoo/issues/11906)).

## Background

AI agents rely on JSON Schemas exposed by MCP servers via `tools/list`. When upstream MCP servers change their schemas—such as adding mandatory properties, altering argument types, or restricting enums—evaluations can fail or silently evaluate different tool behaviors.

## How It Works

1. **Baseline Pinning:** Pin the MCP server's tools into a deterministic, canonical JSON contract (`sample-server-contract.json`).
2. **Deterministic Fingerprinting:** Computes SHA-256 digests over normalized schemas.
3. **CI Regression Gate:** Compares current runtime tools against the baseline and exits with code `1` if breaking mutations are discovered.

## Running the Example

```bash
# Verify the runtime tools against the committed baseline
node verify-drift.js
```

## Configuration

In `promptfooconfig.yaml`, evaluations reference the pinned MCP server:

```yaml
description: MCP Tool Evaluation with Contract Drift Guard
providers:
  - id: openai:chat:gpt-4o-mini
    config:
      mcp:
        enabled: true
        server:
          command: node
          args: ['./sample-mcp-server.js']
```
