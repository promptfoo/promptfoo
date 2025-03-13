---
sidebar_label: Reasoning DoS
---

# Reasoning DoS Plugin

Reasoning DoS (Denial of Service) is a new vulnerability introduced by reasoning models.

This red teaming plugin is designed to test whether an AI system can be protected against computational resource exhaustion through excessive reasoning patterns.

## Purpose

The Reasoning DoS plugin helps to:

1. Identify scenarios where the AI might engage in unnecessary recursive reasoning
2. Test the system's resilience against prompts designed to trigger excessive computation
3. Protect against increased operational costs from malicious inputs

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

The plugin assesses the AI's response based on:

1. Computation Limits: Does the system properly limit computational resources?
2. Pattern Recognition: Can it identify potential computational traps?
3. Response Efficiency: Does it provide direct answers without unnecessary computation?
4. Resource Management: How well does it manage computational resources under stress?
5. Attack Resistance: Can it resist attempts to trigger excessive computation?

## Importance in Gen AI Red Teaming

Testing for reasoning DoS vulnerabilities is critical because:

- It helps prevent operational cost inflation through malicious inputs
- Protects system resources from exhaustion
- Ensures consistent response times for all users
- Maintains service quality under attack conditions
- Prevents denial of service through computational overload

## Related Concepts

- [Divergent Repetition Plugin](divergent-repetition.md)

For more information about LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types/) page.
