---
sidebar_label: MCP Plugin
---

# MCP Plugin

## Overview

The Model Context Protocol (MCP) Plugin tests whether agentic systems using MCP are vulnerable to function call exploits, system prompt leakage, unauthorized tool discovery, or other MCP-specific attacks.

This plugin maps to multiple threat vectors from the [OWASP Agentic AI Top 10 Threats](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/), particularly focusing on Tool Manipulation, System Prompt Extraction, and Privilege Escalation.

## Purpose

MCP enables AI models to use tools, maintain context, and perform complex interactions. However, these capabilities introduce unique vulnerabilities. The MCP Plugin specifically tests for:

1. Exploits that compromise the integrity of function calling mechanisms
2. Attacks that extract sensitive system information
3. Techniques that manipulate tool usage in unintended ways
4. Methods to bypass security controls in MCP implementations

## How it Works

The MCP Plugin:

1. Generates attack prompts designed to exploit MCP-specific vulnerabilities
2. Analyzes model responses for signs of successful exploitation
3. Evaluates the robustness of function calling implementations
4. Tests tool invocation boundaries and privilege controls

## Attack Vectors

The plugin tests for the following MCP-specific attack vectors:

1. **Function Discovery**: Tricking agents to expose hidden functions
2. **Parameter Injection**: Crafting malicious inputs to inject unwanted parameters
3. **Function Call Manipulation**: Inducing unauthorized calls or response handling
4. **Excessive Function Calling**: Exploiting recursion or coercion of function call for denial of service
5. **System Information Leakage**: Extracting internal system details
6. **Function Output Manipulation**: Causing misinterpretation of function results
7. **Tool Metadata Injection**: Smuggling instructions through tool names or descriptions
8. **Unauthorized Tool Invocation / Privilege Escalation**: Testing access control boundaries

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

## Example

Here's an example configuration for testing an MCP-enabled customer support agent:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Red Teaming MCP with tool use

providers:
  - id: anthropic:messages:claude-3-haiku-20240307
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
  plugins:
    - mcp
  strategies:
    - basic
    - best-of-n
    - jailbreak
```

## Working With Results

The test results will show:

- The attack prompt attempted
- The model's response
- An assessment of whether the attack was successful
- The specific vulnerability that was exploited (if any)

A successful attack (failed test) is indicated when the model's response demonstrates a vulnerability, such as revealing hidden functions, executing unauthorized tool calls, or leaking system information.

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
