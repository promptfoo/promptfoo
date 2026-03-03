---
sidebar_label: Overview
title: Red Team Strategies
description: Comprehensive catalog of red team attack strategies for systematically identifying and exploiting LLM application vulnerabilities
---

import StrategyTable from '@site/docs/\_shared/StrategyTable';

# Red Team Strategies

Strategies are attack techniques that systematically probe LLM applications for vulnerabilities. While [plugins](/docs/red-team/plugins/) generate adversarial inputs, strategies determine how these inputs are delivered to maximize attack success rates.

![Strategy Flow](/img/docs/strategy-flow.svg)

## Recommended Strategies

Most users only need two strategies for comprehensive coverage. These agentic methods provide the highest attack success rates across use cases.

### Meta Agent: Best for Single-Turn

The [Meta Agent](/docs/red-team/strategies/meta/) dynamically builds an attack taxonomy and learns from attack history to optimize bypass attempts. It learns which attack types work best against your specific target.

### Hydra Multi-Turn: Best for Multi-Turn

[Hydra](/docs/red-team/strategies/hydra/) runs adaptive multi-turn conversations with persistent scan-wide memory. It pivots across conversation branches to uncover hidden vulnerabilities, especially in stateful applications like chatbots and agents.

### Quick Start

For most applications, this configuration provides comprehensive red team coverage:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - jailbreak:meta # Single-turn agentic attacks
    - jailbreak:hydra # Multi-turn adaptive conversations
```

## All Strategies

<StrategyTable showRemoteStatus />

_🌐 indicates that strategy uses remote inference in Promptfoo Community edition_

## Strategy Categories

### Static Strategies

Transform inputs using predefined patterns to bypass security controls. These are deterministic transformations that don't require another LLM to act as an attacker. Static strategies are low-resource usage, but they are also easy to detect and often patched in the foundation models. For example, the `base64` strategy encodes inputs as base64 to bypass guardrails and other content filters. `jailbreak-templates` wraps the payload in known jailbreak templates like DAN or Skeleton Key.

### Dynamic Strategies

Dynamic strategies use an attacker agent to mutate the original adversarial input through iterative refinement. These strategies make multiple calls to both an attacker model and your target model to determine the most effective attack vector. They have higher success rates than static strategies, but they are also more resource intensive.

By default, dynamic strategies like `jailbreak` and `jailbreak:composite` will:

- Make multiple attempts to bypass the target's security controls
- Stop after exhausting the configured token budget
- Stop early if they successfully generate a harmful output
- Track token usage to prevent runaway costs

### Multi-turn Strategies

Multi-turn strategies use an attacker agent to coerce the target over multiple conversation turns. They are particularly effective against stateful applications where they can convince the target to act against its purpose over time. Multi-turn strategies are more resource intensive than single-turn strategies, but they have the highest success rates.

### Indirect Prompt Injection Strategies

Indirect prompt injection strategies test whether AI agents can be manipulated through malicious instructions embedded in external content they consume. These strategies generate realistic attack surfaces containing hidden payloads to test both data exfiltration and behavior manipulation. Currently available: [`indirect-web-pwn`](/docs/red-team/strategies/indirect-web-pwn/) for web browsing agents.

### Regression Strategies

Regression strategies help maintain security over time by learning from past failures. For example, the `retry` strategy automatically incorporates previously failed test cases into your test suite, creating a form of regression testing for LLM behaviors.

:::note
All single-turn strategies can be applied to multi-turn applications, but multi-turn strategies require a stateful application.
:::

## Configuration

### Basic Configuration

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - jailbreak:meta # string syntax
    - id: jailbreak:composite # object syntax
```

### Plugin Targeting

Strategies can be applied to specific plugins or the entire test suite. By default, strategies are applied to all plugins. You can override this by specifying the `plugins` option in the strategy which will only apply the strategy to the specified plugins.

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: jailbreak:tree
      config:
        plugins:
          - harmful:hate
```

### Layered Strategies

Chain strategies in order with the `layer` strategy. This is useful when you want to apply a transformation first, then another technique:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - base64 # First encode as base64
          - rot13 # Then apply ROT13
```

Notes:

- Each step respects plugin targeting and exclusions.
- Only the final step's outputs are kept.
- Transformations are applied in the order specified.

### Custom Strategies

For advanced use cases, you can create custom strategies. See [Custom Strategy Development](/docs/red-team/strategies/custom) for details.

## Related Concepts

- [LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types/) - Understand the types of vulnerabilities strategies can test
- [Red Team Plugins](/docs/red-team/plugins/) - Learn about the plugins that generate the base test cases
- [Custom Strategies](/docs/red-team/strategies/custom) - Create your own strategies
