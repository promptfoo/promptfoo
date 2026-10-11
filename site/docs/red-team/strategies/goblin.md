---
sidebar_label: Goblin Multi-turn
title: Goblin Multi-turn Strategy
description: Adaptive multi-turn jailbreak agent focused on encoding, math, and logic techniques
---

# Goblin Multi-turn Strategy

The Goblin strategy (`jailbreak:goblin`) uses the same multi-turn execution, backtracking, and scan-wide learning mechanics as [Hydra](hydra.md). Its attacker prompt is biased toward adversarial techniques such as exotic encodings, interleaving questions, logic problems, and other approaches that might bypass semantic guardrails and basic safety training.

Goblin is designed to complement Hydra. Whereas Hydra is more likely to expose weaknesses via natural language, Goblin is intended to help test edge cases and techniques that may be used against more advanced attackers.

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

Use Goblin when straightforward multi-turn attacks are being recognized and you want an attacker that can explore abstract pattern-completion framing without committing to one fixed template. Prefer Hydra for general-purpose adaptive multi-turn coverage across multiple modalities; use Goblin as a complementary, advanced strategy for testing applications that may be exposed to more adversarial users.

## Related Concepts

- [Hydra Multi-turn](hydra.md) – General-purpose adaptive multi-turn strategy
- [Multi-turn Jailbreaks](multi-turn.md) – Overview of conversational attacker agents
- [Layer Strategy](layer.md) – Apply delivery transformations to each Goblin turn
