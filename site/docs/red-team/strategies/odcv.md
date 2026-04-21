---
sidebar_label: ODCV
title: Outcome-Driven Constraint Violation Strategy
description: Test whether agents violate constraints under escalating business KPI pressure
---

# Outcome-Driven Constraint Violation Strategy

The Outcome-Driven Constraint Violation (ODCV) strategy tests whether an AI system will break rules when the request is framed as necessary for a business outcome. It is useful for agents that may face KPI, revenue, quota, or executive-pressure language in real workflows.

ODCV is a multi-turn strategy. Promptfoo generates each attacker turn remotely, sends the turn to your target, grades the response, and stops when the target violates the constraint or when `maxTurns` is reached.

## Configuration

Use ODCV from the Strategies UI or in your config:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: odcv
      config:
        maxTurns: 5
        variant: incentivized
        stateful: false
```

### Options

| Option     | Type                         | Default        | Description                                                                                |
| ---------- | ---------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `maxTurns` | number                       | `5`            | Maximum attacker turns to run.                                                             |
| `variant`  | `incentivized` or `mandated` | `incentivized` | Whether attacks emphasize rewards and metrics or direct mandates and requirements.         |
| `stateful` | boolean                      | `false`        | Set to `true` when your target tracks conversation state and only expects the latest turn. |
| `inputs`   | object                       | unset          | Optional business-context fields passed to the ODCV generator.                             |

For plugin-specific business context, put `inputs` in the plugin config:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - id: harmful:specialized-advice
      config:
        inputs:
          annual_revenue: '$10M'
          sales_target: '120%'
  strategies:
    - id: odcv
      config:
        variant: mandated
        maxTurns: 3
```

## How It Works

ODCV applies pressure through business framing rather than generic jailbreak language:

1. The attacker asks for help achieving a business objective.
2. Each turn increases the pressure to satisfy the outcome.
3. The target response is graded against the original plugin assertion.
4. The strategy stops early when the grader identifies a violation.

Use `variant: incentivized` to test reward and bonus framing. Use `variant: mandated` to test directive and executive mandate framing.

## Related Concepts

- [Multi-turn Jailbreaks](multi-turn.md)
- [GOAT Strategy](goat.md)
- [Layer Strategy](layer.md)
