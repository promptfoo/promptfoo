---
sidebar_label: Meta-Agent Jailbreaks
title: Meta-Agent Jailbreaks Strategy
description: Strategic jailbreak testing with adaptive decision-making to test system resilience
---

# Meta-Agent Jailbreaks Strategy

The Meta-Agent Jailbreaks strategy (`jailbreak:meta`) uses strategic decision-making to test your system's resilience against adaptive attacks.

Unlike standard iterative approaches that refine a single prompt, the meta-agent builds a custom taxonomy of approaches and adapts its strategy based on your target's responses.

## Implementation

Add it to your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - jailbreak:meta
```

To configure the number of attempts:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: jailbreak:meta
      config:
        # Optional: Number of iterations to attempt (default: 10)
        numIterations: 50
```

You can also override the number of iterations via an environment variable:

```bash
export PROMPTFOO_NUM_JAILBREAK_ITERATIONS=5
```

:::info Cloud Required
This strategy requires Promptfoo Cloud to maintain persistent memory and strategic reasoning across iterations. Set `PROMPTFOO_REMOTE_GENERATION_URL` or log into Promptfoo Cloud.
:::

## How It Works

The meta-agent maintains memory across iterations to systematically explore different attack approaches. When one type of approach fails, it pivots to fundamentally different techniques rather than continuing to refine the same pattern.

This explores multiple distinct approaches to find weaknesses, at the cost of additional API calls.

## Meta-Agent vs Standard Jailbreak

The top-level `jailbreak` strategy is deprecated and now runs `jailbreak:meta`. Replace `jailbreak` with `jailbreak:meta` in existing configurations to avoid the deprecation warning.

The meta-agent stops when it finds a vulnerability, determines the target is secure, or reaches max iterations.

## When to Use

Use `jailbreak:meta` when:

- Testing production systems where you need comprehensive coverage of attack types
- Your guardrails might block obvious approaches but miss alternative attack angles
- You need broader single-turn coverage than static transformations provide

## Related Concepts

- [Hydra Multi-turn](hydra.md) - Multi-turn branching agent with scan-wide memory
- [Goblin Multi-turn](goblin.md) - Complementary multi-turn strategy for abstract and encoded attacks
- [Tree-based Jailbreaks](tree.md) - Branching exploration strategy
- [Jailbreak Templates](jailbreak-templates.md) - Static jailbreak templates
- [Multi-turn Jailbreaks](multi-turn.md) - Conversation-based attacks
- [Red Team Strategies](/docs/red-team/strategies/) - Full strategy catalog
