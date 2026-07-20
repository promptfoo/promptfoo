---
sidebar_label: Overview
title: Red Team Strategies
description: Catalog of red team strategies for finding vulnerabilities in LLM applications
---

import StrategyTable from '@site/docs/\_shared/StrategyTable';

# Red Team Strategies

Strategies change how adversarial inputs reach an LLM application. [Plugins](/docs/red-team/plugins/) generate the inputs; strategies transform, adapt, or sequence them to probe for vulnerabilities.

![Red team flow from a plugin objective through generated payloads and strategy variants to a target](/img/docs/strategy-flow.svg)

## Recommended Strategies

Start with a single-turn and a multi-turn strategy, then add specialized strategies for the attack surfaces your application exposes.

### Meta Agent: Single-Turn Coverage

The [Meta Agent](/docs/red-team/strategies/meta/) builds an attack taxonomy, tracks earlier attempts, and adapts single-turn attacks to your target.

### Hydra Multi-Turn: Adaptive Conversations

[Hydra](/docs/red-team/strategies/hydra/) adapts across conversation turns and shares attacker learnings across a scan. It can replay the full transcript to a stateless target or use a target-managed session when the application stores prior turns.

### Goblin Multi-Turn: IICL-Inspired Exploration

[Goblin](/docs/red-team/strategies/goblin/) uses Hydra's multi-turn mechanics with an attacker prompt inspired by IICL-style pattern completion and encoding shifts. Add it when you want to probe abstract or encoded attack paths alongside Hydra.

### Quick Start

For most applications, start with:

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

Static strategies transform inputs using predefined patterns and do not require an attacker LLM. They use fewer resources, but familiar patterns may be easy for a target to detect. For example, `base64` encodes an input, while `jailbreak-templates` wraps it in a known template such as DAN or Skeleton Key.

### Dynamic Strategies

Dynamic strategies generate or refine attack variants with hosted models or attacker agents. They can cover more attack paths than static transformations, but may require additional model calls.

For example, `jailbreak:meta` tries different single-turn approaches until an attack succeeds, the attacker stops, or it reaches the configured iteration limit. `jailbreak:composite` generates compound attack variants during test generation.

### Multi-turn Strategies

Multi-turn strategies use an attacker agent to probe the target across a conversation. They can reveal failures that appear only after context builds up, at the cost of more model calls than single-turn strategies.

### Indirect Prompt Injection Strategies

Indirect prompt injection strategies test whether agents follow malicious instructions hidden in external content. [`indirect-web-pwn`](/docs/red-team/strategies/indirect-web-pwn/) generates pages with injected payloads and tests browsing agents for data leaks and behavior changes.

### Regression Strategies

Regression strategies help maintain security over time by learning from past failures. For example, the `retry` strategy automatically incorporates previously failed test cases into your test suite, creating a form of regression testing for LLM behaviors.

:::note
All single-turn strategies can be applied to multi-turn applications. Multi-turn strategies need access to conversation context, either by replaying the transcript or by using a target-managed session.
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

Strategies apply to all plugins by default. To limit a strategy to specific plugins, set its `plugins` option:

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
