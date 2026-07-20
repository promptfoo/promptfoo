---
sidebar_label: Meta-Agent Jailbreaks
title: Meta-Agent Jailbreaks Strategy
description: Adapt single-turn jailbreak attacks based on how the target responds
---

# Meta-Agent Jailbreaks Strategy

The Meta-Agent Jailbreaks strategy (`jailbreak:meta`) adapts single-turn attacks based on how your target responds.

Instead of repeatedly refining one prompt, the meta-agent builds an attack taxonomy and tries different approaches.

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

The meta-agent remembers earlier attempts. When one approach fails, it can switch to a different technique instead of repeating the same pattern. The broader search requires additional API calls.

## Deprecated Jailbreak Alias

The top-level `jailbreak` strategy is deprecated and now runs `jailbreak:meta`. Replace `jailbreak` with `jailbreak:meta` in existing configurations to avoid the deprecation warning.

The meta-agent stops when an attack succeeds, the attacker stops, or it reaches the iteration limit.

## When to Use

Use `jailbreak:meta` when:

- Testing production systems across different attack types
- Your guardrails might block obvious approaches but miss alternative attack angles
- You need broader single-turn coverage than static transformations provide

## Related Concepts

- [Hydra Multi-turn](hydra.md) - Multi-turn branching agent with scan-wide memory
- [Goblin Multi-turn](goblin.md) - Complementary multi-turn strategy for abstract and encoded attacks
- [Tree-based Jailbreaks](tree.md) - Branching exploration strategy
- [Jailbreak Templates](jailbreak-templates.md) - Static jailbreak templates
- [Multi-turn Jailbreaks](multi-turn.md) - Conversation-based attacks
- [Red Team Strategies](/docs/red-team/strategies/) - Full strategy catalog
