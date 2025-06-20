---
sidebar_label: Simulated User
title: Simulated User Strategy
description: Multi-turn red teaming strategy that simulates a user conversation
---

# Simulated User Strategy

The **Simulated User** strategy uses the simulated user provider to create a multi-turn conversation with your application. It is inspired by the [Tau-bench](https://github.com/sierra-research/tau-bench) approach.

## Implementation

Enable it in your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
strategies:
  - id: simulated-user
    config:
      maxTurns: 5
```

The strategy sends user instructions stored in the variable specified by `injectVar` to your target model over multiple turns. The conversation stops when the maximum number of turns is reached or the agent responds with `###STOP###`.

## Related Concepts

- [Multi-turn Jailbreaks](multi-turn.md)
- [GOAT Strategy](goat.md)
- [Crescendo Strategy](multi-turn.md)

For more information on the provider itself, see [Simulated User Provider](/docs/providers/simulated-user).
