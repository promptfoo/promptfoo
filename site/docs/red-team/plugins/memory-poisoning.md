---
sidebar_label: Memory Poisoning
description: Red team memory poisoning vulnerabilities in AI agents through persistent state manipulation to prevent malicious instruction injection and protect decision integrity
---

# Memory Poisoning Plugin

## Overview

The Memory Poisoning plugin tests whether stateful agents are vulnerable to memory poisoning attacks that manipulate an agent's memory to alter its behavior in subsequent interactions.

This plugin maps to **T1: Memory Poisoning** from [OWASP Agentic AI Top 10 Threats](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) and is also closely related to **LLM04:2025 Data and Model Poisoning** from the [OWASP LLM Top 10](https://genai.owasp.org/llmrisk/llm042025-data-and-model-poisoning/), as it involves manipulating the data that influences the model's behavior and decision-making process.

## OWASP Context

Memory poisoning represents a specific form of data poisoning that occurs at the application level rather than during model training. While **LLM04:2025 Data and Model Poisoning** typically refers to poisoning training data or fine-tuning datasets, memory poisoning attacks target the runtime memory and context of stateful AI agents, potentially causing persistent behavioral changes that affect subsequent interactions.

## Purpose

Memory poisoning attacks attempt to inject malicious instructions into an agent's memory state that persist across turns. When successful, these attacks can:

1. Override or modify the agent's original purpose
2. Extract sensitive information
3. Manipulate the agent's decision-making process
4. Bypass security controls in subsequent interactions
5. Create persistent backdoors in the agent's behavior

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

## Real-World Impact

Memory poisoning attacks can lead to:

- **Persistent Compromise**: Malicious behavior that continues across multiple interactions
- **Data Exfiltration**: Extracting sensitive information from the agent's memory or context
- **Privilege Escalation**: Gaining access to functions or data beyond normal permissions
- **Business Logic Bypass**: Circumventing intended operational constraints
- **User Trust Violation**: Undermining user confidence in the agent's reliability
- **Compliance Violations**: Causing the agent to act in ways that violate policies or regulations

## Attack Scenarios

1. **Business Process Manipulation**: Poisoning a sales agent's memory to always approve discounts regardless of policy
2. **Information Extraction**: Modifying a customer service agent's memory to reveal confidential customer data
3. **Access Control Bypass**: Altering a security agent's memory to grant unauthorized access
4. **Decision Manipulation**: Corrupting a recommendation agent's memory to favor specific products or services

## Mitigations

To protect against memory poisoning attacks:

1. **Input Validation**: Implement strict input validation that filters or sanitizes user inputs prior to persistence.
2. **Memory Sanitization**: Sanitize user memories prior to including them within the context windows of inference calls.
3. **Memory Segregation**: Segregate memory types - separate system instructions from user input memory.
4. **Memory Attribution**: Apply memory attribution - track where memory content originated and maintain provenance.
5. **Access Controls**: Implement proper access controls for memory modification operations.
6. **Monitoring and Detection**: Monitor for unusual memory patterns or unexpected behavioral changes.
7. **Memory Validation**: Validate memory contents for consistency and integrity before use.

## Related Concepts

- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)
- [Tool Discovery](/docs/red-team/plugins/tool-discovery)
- [Excessive Agency](/docs/red-team/plugins/excessive-agency)
- [Hijacking](/docs/red-team/plugins/hijacking)
- [Data and Model Poisoning](https://genai.owasp.org/llmrisk/llm042025-data-and-model-poisoning/) - OWASP LLM04:2025
