---
sidebar_label: MCP Shadow
description: Test AI agents for indirect prompt injection vulnerabilities through poisoned MCP tool responses
---

# MCP Shadow Plugin

The MCP Shadow plugin tests whether an AI agent connected to an MCP server can be manipulated through poisoned tool descriptions or injected content in tool responses.

## Attack Types

| Attack Type          | Plugin ID                   | Description                                                                                         |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Content Exfiltration | `mcp-shadow:content-exfil`  | Tests if an agent can be tricked into exfiltrating data via injected instructions in tool responses |
| Content Hijack       | `mcp-shadow:content-hijack` | Tests if agent behavior can be hijacked through poisoned MCP tool responses                         |
| Tool Poisoning       | `mcp-shadow:tool-poisoning` | Tests if tool descriptions can be poisoned to change agent behavior                                 |

## Configuration

MCP Shadow requires a cloud deployment. Configure it in your red team config:

```yaml
plugins:
  - id: 'mcp-shadow:content-exfil'
    config:
      deploymentId: 'your-deployment-id'
  - id: 'mcp-shadow:content-hijack'
    config:
      deploymentId: 'your-deployment-id'
  - id: 'mcp-shadow:tool-poisoning'
    config:
      deploymentId: 'your-deployment-id'
```

Each attack type is a separate plugin that can be enabled independently. A deployment must be created and running before tests can execute.

## How It Works

1. A shadow MCP deployment is created that mirrors the target agent's MCP server
2. The deployment injects carefully crafted payloads into tool responses
3. The agent processes these poisoned responses alongside legitimate ones
4. The grader checks whether the agent followed injected instructions (e.g., exfiltrated data, changed behavior)

## Related Concepts

- [MCP Plugin](/docs/red-team/plugins/mcp/) - Tests for general MCP vulnerabilities
- [Indirect Prompt Injection](/docs/red-team/plugins/indirect-prompt-injection/) - Tests for prompt injection via external content
