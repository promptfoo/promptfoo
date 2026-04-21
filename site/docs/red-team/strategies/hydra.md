---
sidebar_label: Hydra Multi-turn
title: Hydra Multi-turn Strategy
description: Adaptive multi-turn jailbreak agent that pivots across branches to uncover hidden vulnerabilities
---

# Hydra Multi-turn Strategy

The Hydra strategy (`jailbreak:hydra`) runs a multi-turn attacker agent that adapts to every response from your target system. It maintains structured memory, evaluates past attempts, and branches into new attack approaches when the direct path fails.

Unlike single-turn jailbreaks that retry variations of one payload, Hydra continuously reasons about prior turns, retries with fresh context, and shares learnings across every test in the same scan.

## Implementation

Add the strategy to your `promptfooconfig.yaml` to enable multi-turn adaptive testing:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    # Basic usage
    - jailbreak:hydra

    # With configuration
    - id: jailbreak:hydra
      config:
        # Optional: maximum turns before hydra stops (default: 10)
        maxTurns: 12
        # Optional: how many times to backtrack after refusals in stateless mode (default: 10)
        maxBacktracks: 5
        # Optional: set true if your target expects session state on each request
        stateful: false
```

::::info Cloud Required
Hydra relies on Promptfoo Cloud to coordinate the attacker agent, maintain scan-wide learnings, and manage branching logic. Set `PROMPTFOO_REMOTE_GENERATION_URL` or sign in to Promptfoo Cloud before running this strategy.
::::

## Configuration Options

| Option          | Default | Description                                                                                                                                                           |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxTurns`      | `10`    | Maximum conversation turns Hydra will take with the target before stopping. Increase for deeper explorations.                                                         |
| `maxBacktracks` | `10`    | Number of times Hydra can roll back the last turn when it detects a refusal. Set to `0` automatically when `stateful: true`.                                          |
| `stateful`      | `false` | When `true`, Hydra sends only the latest turn alongside the session identifier. Keep `false` (stateless mode) if your target expects the full conversation each time. |

::::tip
Hydra automatically manages backtracking and session handling. In Promptfoo Cloud, it derives session support from the target’s configuration. When using the open-source CLI/UI, set `stateful: true` in the Hydra configuration if your provider expects persistent sessions.
::::

## How It Works

1. **Goal selection** – Hydra pulls the red team goal from the plugin metadata or injected variable.
2. **Agent decisioning** – A coordinating agent in Promptfoo Cloud evaluates prior turns and chooses the next attack message.
3. **Target probing** – The selected message is rendered (stateless or stateful) and sent to your target provider.
4. **Outcome grading** – Responses are graded with the configured plugin assertions and stored for later learning.
5. **Adaptive branching** – On refusals, Hydra backtracks and explores alternate branches until it succeeds, exhausts `maxBacktracks`, or reaches `maxTurns`.

Hydra keeps a per-scan memory so later test cases can reuse successful tactics discovered earlier in the run.

## Hydra vs Other Agentic Strategies

| Strategy          | Turn Model           | Best For                          | Cost Profile |
| ----------------- | -------------------- | --------------------------------- | ------------ |
| `jailbreak`       | Single-turn          | Fast baselines, low cost          | Low          |
| `jailbreak:meta`  | Iterative taxonomy   | Broad single-shot coverage        | Medium       |
| `jailbreak:hydra` | Multi-turn branching | Stateful agents, evasive defenses | High         |

## When to Use Hydra

- Your product exposes a conversational bot or agent workflow with stateful behavior.
- Guardrails block straightforward jailbreaks and you need an adversary that can pivot.
- You want to reuse learnings across an entire scan (e.g., large org-wide red teams).

Hydra is most effective when paired with plugin suites like `harmful`, `pii`, or `rbac` that define concrete failure conditions via graders.

## Related Concepts

- [Iterative Jailbreaks](iterative.md) – Baseline single-turn optimization strategy
- [Meta-Agent Jailbreaks](meta.md) – Strategic taxonomy builder for complex single-turn attacks
- [Multi-turn Jailbreaks](multi-turn.md) – Overview of conversational attacker agents
- [Tree-based Jailbreaks](tree.md) – Branching exploration without multi-turn conversations
