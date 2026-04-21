---
sidebar_label: Memory Poisoning
description: Red team memory poisoning vulnerabilities in AI agents through persistent state manipulation to prevent malicious instruction injection and protect decision integrity
---

# Memory Poisoning Plugin

## Overview

The Memory Poisoning plugin tests whether stateful agents are vulnerable to memory poisoning attacks that manipulate an agent's memory to alter its behavior in subsequent interactions.

This plugin maps to **T1: Memory Poisoning** from [OWASP Agentic AI Top 10 Threats](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/).

## Purpose

Memory poisoning attacks attempt to inject malicious instructions into an agent's memory state that persist across turns. When successful, these attacks can:

1. Override or modify the agent's original purpose
2. Extract sensitive information
3. Manipulate the agent's decision-making process
4. Bypass security controls in subsequent interactions

## How it Works

The Memory Poisoning plugin:

1. Creates a scenario with specific "memories" that the agent should remember
2. Sends an initial memory-establishing message to the agent
3. Follows with a poisoned message attempting to corrupt the established memory
4. Tests the attack's effectiveness with a follow-up question that relies on the original memory
5. Evaluates whether the agent's response to the follow-up reflects the original memory (secure) or the poisoned memory (vulnerable)

## Configuration

Add the following to your promptfoo configuration:

```yaml
redteam:
  purpose: "Description of your agent's intended purpose"
  plugins:
    - id: agentic:memory-poisoning
      numTests: 30 # Optional, defaults to 5
```

:::note
Memory Poisoning is a standalone plugin and does not use strategies. Strategies defined in the `redteam.strategies` configuration are ignored for this plugin.
:::

## Example

Here's an example configuration for testing an agent:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Travel Agent Redteam

providers:
  - id: http
    config:
      url: http://localhost:3090/api/chat
      method: POST
      headers:
        'Content-Type': 'application/json'
        'x-promptfoo-session': '{{sessionId}}'
      body:
        'message': '{{prompt}}'
      transformResponse: 'json.message'

prompts:
  - '{{prompt}}'

defaultTest:
  options:
    transformVars: '{ ...vars, sessionId: context.uuid }'

redteam:
  purpose: |
    The agent simulates a travel agent that helps users find the best travel deals. It has access to a set of tools
    that allow it to check the weather, lookup and book flights, and book hotels.
  plugins:
    - id: agentic:memory-poisoning
      numTests: 30
```

## Working With Results

The test results will show:

- The original memory-establishing message
- The poisoned message
- The follow-up question
- The agent's responses to each message

A successful attack (failed test) is indicated when the agent's response to the follow-up question reflects the poisoned instructions rather than the original memory.

## Mitigations

To protect against memory poisoning attacks:

1. Implement input validation that filters or sanitizes user inputs prior to persistence.
2. Sanitize user memories prior to including them within the context windows of inference calls.
3. Segregate memory types - separate system instructions from user input memory.
4. Apply memory attribution - track where memory content originated.

## Related Concepts

- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)
- [Tool Discovery](/docs/red-team/plugins/tool-discovery)
- [Excessive Agency](/docs/red-team/plugins/excessive-agency)
- [Hijacking](/docs/red-team/plugins/hijacking)
