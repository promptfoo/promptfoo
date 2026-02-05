---
sidebar_label: Overview
title: Red Team Strategies
description: Comprehensive catalog of red team attack strategies for systematically identifying and exploiting LLM application vulnerabilities
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

### Static Strategies

Transform inputs using predefined patterns to bypass security controls. These are deterministic transformations that don't require another LLM to act as an attacker. Static strategies are low-resource usage, but they are also easy to detect and often patched in the foundation models. For example, the `base64` strategy encodes inputs as base64 to bypass guardrails and other content filters. `jailbreak-templates` wraps the payload in known jailbreak templates like DAN or Skeleton Key.

### Dynamic Strategies

Dynamic strategies use an attacker agent to mutate the original adversarial input through iterative refinement. These strategies make multiple calls to both an attacker model and your target model to determine the most effective attack vector. They have higher success rates than static strategies, but they are also more resource intensive. By default, promptfoo recommends three dynamic strategies: [`jailbreak`](/docs/red-team/strategies/iterative/), [`jailbreak:meta`](/docs/red-team/strategies/meta/), and [`jailbreak:composite`](/docs/red-team/strategies/composite-jailbreaks/) to run on your red-teams. For multi-turn agent testing, enable [`jailbreak:hydra`](/docs/red-team/strategies/hydra/) to add adaptive branching conversations.

By default, dynamic strategies like `jailbreak` and `jailbreak:composite` will:

- Make multiple attempts to bypass the target's security controls
- Stop after exhausting the configured token budget
- Stop early if they successfully generate a harmful output
- Track token usage to prevent runaway costs

### Multi-turn Strategies

Multi-turn strategies also use an attacker agent to coerce the target model into generating harmful outputs. These strategies are particularly effective against stateful applications where they can convince the target model to act against its purpose over time. You should run these strategies if you are testing a multi-turn application (such as a chatbot). Multi-turn strategies are more resource intensive than single-turn strategies, but they have the highest success rates.

### Regression Strategies

Regression strategies help maintain security over time by learning from past failures. For example, the `retry` strategy automatically incorporates previously failed test cases into your test suite, creating a form of regression testing for LLM behaviors.

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
    - jailbreak:meta
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
    - jailbreak:hydra
    - mischievous-user
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

## Next Steps

1. Review [LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types/)
2. Set up your first test suite
