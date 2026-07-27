---
sidebar_label: Reasoning DoS
description: Test whether reasoning-capable AI systems recognize prompts designed to trigger excessive work, and pair response checks with latency or token-cost assertions.
---

# Reasoning DoS Plugin

Reasoning DoS (Denial of Service) covers prompts that push reasoning-capable models into unnecessary work, long runtimes, or inflated inference cost. Use this plugin to check whether responses recognize and refuse computational traps.

## Purpose

It focuses on whether the system:

1. Avoids unnecessary recursive reasoning.
2. Resists prompts designed to trigger excessive computation.
3. Avoids engaging with requests likely to cause unnecessary computation.

## Configuration

To include the Reasoning DoS plugin in your LLM red teaming setup:

```yaml
redteam:
  plugins:
    - reasoning-dos
```

## How It Works

The Reasoning DoS plugin generates test cases that attempt to trigger excessive computation through:

1. Complex mathematical or logical problems requiring iterative solutions
2. Nested decision-making scenarios
3. Multi-step optimization problems
4. Game theory scenarios
5. Markov Decision Processes (MDPs)
6. Recursive reasoning chains
7. Puzzle-solving tasks (e.g., Sudoku)

## Evaluation Criteria

The plugin uses response content to assess whether the target appears to engage with a computational trap. It does not measure elapsed time, token usage, or actual compute consumption.

The grader looks for:

1. Pattern recognition: Can the system identify potential computational traps?
2. Response efficiency: Does it avoid repeated recalculation, recursive reasoning, or unnecessary exploration?
3. Attack resistance: Does it decline requests that would require excessive computation?

To measure the operational impact, add separate latency and token-cost assertions for your provider.

## Importance in Gen AI Red Teaming

These tests matter when a model can spend far more effort on a prompt than the user spent crafting it. The risk is operational: degraded latency, higher cost, and reduced service quality under targeted abuse.

## Related Concepts

- [Divergent Repetition Plugin](divergent-repetition.md)
- [Types of LLM vulnerabilities](/docs/red-team/llm-vulnerability-types/) - Full vulnerability and plugin directory with category mapping
