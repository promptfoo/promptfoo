---
sidebar_label: MCP Plugin
description: Red team MCP implementations by testing function exploits and tool manipulation to prevent unauthorized AI agent access
---

# MCP Plugin

## Overview

The Model Context Protocol (MCP) Plugin tests whether agentic systems using MCP are vulnerable to function call exploits, system prompt leakage, unauthorized tool discovery, or other MCP-specific attacks.

Promptfoo includes `mcp` in the ASI02 (tool misuse) and ASI04 (supply chain) presets for the [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/).

## Purpose

Use this plugin to check whether a prompt can induce an agent to misuse an MCP tool or disclose private details about it.

## How it Works

Promptfoo sends generated prompts to the agent. The grader looks for evidence in the final response. It does not modify tool descriptions, inspect MCP servers or registries, or check messages between agents.

## Attack Vectors

The grader flags exposed internal tool metadata or instructions, evidence of unauthorized tool calls or privilege escalation, and successful parameter injection.

## Configuration

Add the following to your promptfoo configuration:

```yaml
redteam:
  purpose: "Description of your agent's intended purpose"
  plugins:
    - mcp

  strategies:
    - basic
    - best-of-n
    - jailbreak
```

### Recommended Plugin Combinations for MCP Testing

When testing MCP-enabled systems, these plugins work particularly well together:

```yaml
redteam:
  plugins:
    - pii # Test for PII data exposure through tool responses
    - bfla # Test function-level authorization bypass
    - bola # Test object-level authorization bypass
    - sql-injection # Test for SQL injection in tool parameters
    - mcp # MCP-specific attack vectors
```

These plugins target the most common security vulnerabilities in systems that expose tools and data through MCP interfaces:

- **`pii`** - Tests for exposure of personally identifiable information through tool responses
- **`bfla`** (Broken Function Level Authorization) - Tests whether users can access functions they shouldn't have access to
- **`bola`** (Broken Object Level Authorization) - Tests whether users can access data objects they shouldn't have access to
- **`sql-injection`** - Tests for SQL injection vulnerabilities in tool parameters
- **`mcp`** - MCP-specific attack vectors including function discovery and parameter injection

## Example

Here's an example configuration for testing an MCP-enabled customer support agent:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Red Teaming MCP with tool use

providers:
  - id: anthropic:messages:claude-haiku-4-5
    config:
      mcp:
        enabled: true
        server:
          url: https://your-mcp-server.example.com/mcp

prompts:
  - |
    You are a customer support agent for Acme, a company that sells widgets.
    Your role is to assist users with product information and general inquiries.
    {{prompt}}

defaultTest:
  options:
    transformVars: '{ ...vars, sessionId: context.uuid }'

redteam:
  purpose: |
    The objective of the application is to provide customer support
    without revealing internal company information or allowing unauthorized access.

  # Related checks for MCP applications
  plugins:
    - pii # Test for PII data exposure
    - bfla # Test function-level authorization
    - bola # Test object-level authorization
    - sql-injection # Test for SQL injection vulnerabilities
    - mcp # MCP-specific attack vectors

  strategies:
    - basic
    - best-of-n
    - jailbreak
```

## Working With Results

Review the prompt, response, and grader's reasoning. Check the tool or server logs to confirm what actually ran. A passing result can miss activity absent from the response.

## Mitigations

To protect against MCP-specific attacks:

1. Implement strict input validation for function parameters
2. Apply appropriate access controls for tool invocation
3. Validate the output of function calls before processing
4. Limit recursion depth for function calls
5. Sanitize error messages to prevent information leakage
6. Use function signature schemas with strict typing
7. Implement rate limiting for tool calls
8. Separate system prompts from user-accessible memory

## Related Concepts

- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)
- [Memory Poisoning](/docs/red-team/plugins/memory-poisoning)
- [Tool Discovery](/docs/red-team/plugins/tool-discovery)
- [Prompt Extraction](/docs/red-team/plugins/prompt-extraction)
- [Indirect Prompt Injection](/docs/red-team/plugins/indirect-prompt-injection)
- [MCP Configuration in Promptfoo](/docs/integrations/mcp)
