---
sidebar_label: Goblin Multi-turn
title: Goblin Multi-turn Strategy
description: Adaptive multi-turn jailbreak agent focused on encoding, math, and logic techniques
---

# Goblin Multi-turn Strategy

The Goblin strategy (`jailbreak:goblin`) uses the same multi-turn execution, backtracking, and scan-wide learning as [Hydra](hydra.md). Its attacker prompt favors techniques such as unusual encodings, interleaved questions, and logic problems that may bypass semantic guardrails.

Goblin complements Hydra by testing edge cases inspired by [Involuntary In-Context Learning (IICL)](https://arxiv.org/abs/2604.19461), including abstract few-shot pattern completion and encoding shifts.

## Implementation

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: jailbreak:goblin
      config:
        maxTurns: 10
        maxBacktracks: 10
        stateful: false
```

::::info Cloud Required
Goblin relies on Promptfoo Cloud for its attacker agent and scan-wide learnings. Set `PROMPTFOO_REMOTE_GENERATION_URL` or sign in to Promptfoo Cloud before running this strategy.
::::

## Configuration Options

| Option          | Default | Description                                                                                           |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `maxTurns`      | `10`    | Maximum conversation turns before stopping.                                                           |
| `maxBacktracks` | `10`    | Number of stateless refusal backtracks. Backtracking is disabled automatically when `stateful: true`. |
| `stateful`      | `false` | When `true`, send only the newest turn and rely on the target provider to preserve the session.       |

## When to Use Goblin

![Goblin flow showing complementary attack approaches, adaptive turns, and replay-mode backtracking](/img/docs/goblin-strategy.svg)

Use Goblin to test abstract pattern-completion and encoding paths without relying on one fixed template. Start with Hydra for general-purpose multi-turn coverage, then add Goblin for complementary attack paths.

## Related Concepts

- [Hydra Multi-turn](hydra.md) – General-purpose adaptive multi-turn strategy
- [Multi-turn Jailbreaks](multi-turn.md) – Overview of conversational attacker agents
- [Layer Strategy](layer.md) – Apply delivery transformations to each Goblin turn
