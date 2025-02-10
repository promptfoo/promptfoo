---
sidebar_label: Overview
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

Transform inputs using predefined patterns to bypass security controls. These are deterministic transformations that don't require another LLM to act as an attacker. Static strategies are low-resource usage, but they are also easy to detect and often patched in the foundation models. For example, the `base64` strategy encodes inputs as base64 to bypass guardrails and other content filters. `prompt-injection` wraps the payload in a prompt injection such as `ignore previous instructions and {{original_adversarial_input}}`.

### Dynamic Strategies

Dynamic strategies use an attacker agent to mutate the original adversarial input through iterative refinement. These strategies make multiple calls to both an attacker model and your target model to determine the most effective attack vector. They have higher success rates than static strategies, but they are also more resource intensive. By default, promptfoo recommends two dynamic strategies: [`jailbreak`](/docs/red-team/strategies/iterative/) and [`jailbreak:composite`](/docs/red-team/strategies/composite-jailbreaks/) to run on your red-teams.

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

```yaml
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

```yaml
redteam:
  strategies:
    - goat
    - crescendo
```

## Implementation Guide

### Basic Configuration

```yaml
redteam:
  strategies:
    - jailbreak # string syntax
    - id: jailbreak:composite # object syntax
```

### Advanced Configuration

Some strategies allow you to specify options in the configuration object. For example, the `multilingual` strategy allows you to specify the languages to use.

```yaml
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

```yaml
redteam:
  strategies:
    - id: jailbreak:tree
      config:
        plugins:
          - harmful:hate
```

### Custom Strategies

For advanced use cases, you can create custom strategies. See [Custom Strategy Development](/docs/red-team/strategies/custom) for details.

## Next Steps

1. Review [LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types/)
2. Set up your first test suite
