---
sidebar_label: Overview
title: Red Team Strategies
description: Attack techniques that systematically probe LLM applications for vulnerabilities and maximize success rates
---

import StrategyTable from '@site/docs/\_shared/StrategyTable';

# Red Team Strategies

## Overview

Strategies are attack techniques that systematically probe LLM applications for vulnerabilities.

While [plugins](/docs/red-team/plugins/) generate adversarial inputs, strategies determine how these inputs are delivered to maximize attack success rates.

For example, a plugin might generate a harmful input, and a strategy like `jailbreak` would then attempt multiple variations of that input to bypass guardrails and content filters.

![Strategy Flow](/img/docs/strategy-flow.svg)

Strategies are applied during redteam generation and can significantly increase the Attack Success Rate (ASR) of adversarial inputs.

## Available Strategies

<StrategyTable />

## Strategy Categories

### Utility Strategies

Meta-strategies that provide control and testing enhancement capabilities. These strategies help manage the testing process itself rather than directly attacking the model. For example, `basic` controls whether original test cases are included, `multilingual` expands tests across languages, and `retry` implements regression testing.

### Encoding Strategies

Transform inputs using various encoding techniques to bypass text-based security controls. These are deterministic transformations that don't require an LLM attacker. Examples include `base64`, `hex`, `rot13`, `homoglyph`, and `leetspeak`. While low-cost, they're often easily detected by modern models.

### Multi-Modal Strategies

Test handling of non-text content by converting adversarial inputs into different media formats. These strategies (`audio`, `image`, `video`) encode text into base64-encoded media files to potentially bypass text-only content filters.

### Single-Turn Agentic Strategies

AI-powered strategies that use an attacker LLM to dynamically adapt attack patterns within a single interaction. These include various jailbreak techniques (`jailbreak`, `jailbreak:composite`, `jailbreak:tree`), academic framing attacks (`citation`, `jailbreak:likert`), and optimization-based methods (`gcg`, `best-of-n`). They offer high success rates but require more computational resources.

### Multi-Turn Agentic Strategies

Advanced AI-powered strategies that evolve attacks across multiple conversation turns. Strategies like `crescendo` gradually escalate harm, while `goat` uses a Generative Offensive Agent Tester. These are most effective against stateful applications and have the highest success rates but also the highest resource requirements.

### Injection Strategies

Direct manipulation techniques that attempt to override system instructions or inject malicious prompts. The `prompt-injection` strategy tests common injection patterns like "ignore previous instructions" to evaluate prompt injection vulnerabilities.

:::note
All single-turn strategies can be applied to multi-turn applications, but multi-turn strategies require a stateful application.
:::

## Strategy Selection

Choose strategies based on your application architecture and security requirements:

### Single-turn Applications

Single-turn applications process each request independently, creating distinct security boundaries:

**Security Properties:**

- ✅ Clean context for each request
- ✅ No state manipulation vectors
- ✅ Predictable attack surface
- ❌ Limited threat pattern detection
- ❌ No persistent security context

**Recommended Strategies:**

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - jailbreak
    - jailbreak:composite
```

### Multi-turn Applications

Multi-turn applications maintain conversation state, introducing additional attack surfaces:

**Security Properties:**

- ✅ Context-aware security checks
- ✅ Pattern detection capability
- ✅ Sophisticated auth flows
- ❌ State manipulation risks
- ❌ Context pollution vectors
- ❌ Increased attack surface

**Recommended Strategies:**

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - goat
    - crescendo
```

## Implementation Guide

### Basic Configuration

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - jailbreak # string syntax
    - id: jailbreak:composite # object syntax
```

### Advanced Configuration

Some strategies allow you to specify options in the configuration object. For example, the `multilingual` strategy allows you to specify the languages to use.

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: multilingual
      config:
        languages:
          - french
          - zh-CN # Chinese (IETF)
          - de # German (ISO 639-1)
```

Strategies can be applied to specific plugins or the entire test suite. By default, strategies are applied to all plugins. You can override this by specifying the `plugins` option in the strategy which will only apply the strategy to the specified plugins.

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: jailbreak:tree
      config:
        plugins:
          - harmful:hate
```

### Custom Strategies

For advanced use cases, you can create custom strategies. See [Custom Strategy Development](/docs/red-team/strategies/custom) for details.

## Related Concepts

- [LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types/) - Understand the types of vulnerabilities strategies can test
- [Red Team Plugins](/docs/red-team/plugins/) - Learn about the plugins that generate the base test cases
- [Custom Strategies](/docs/red-team/strategies/custom) - Create your own strategies

## Next Steps

1. Review [LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types/)
2. Set up your first test suite
