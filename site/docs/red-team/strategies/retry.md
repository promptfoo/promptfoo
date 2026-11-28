---
sidebar_label: Retry Failed Tests
title: Retry Strategy
description: Implement regression testing by automatically retrying failed cases to ensure consistent model behavior across deployments
---

# Retry Strategy

The retry strategy adds previously failed cases to your test suite for regression testing. Promptfoo adds retries first. Later strategies skip those cases.

:::note

Promptfoo looks up failures by provider ID. Two providers with the same ID can share history even if their labels differ.

:::

## Implementation

To include the retry strategy in your red teaming setup:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: 'retry'
      config:
        numTests: 10 # Maximum number of retries
        plugins:
          - harmful:hate # Only retry failed tests from these plugins
          - harmful:illegal
```

The optional `plugins` list limits which plugins contribute failures. With `numTests` set, generation considers up to that many new cases and adds at most that many retries overall. By default, each lookup uses the number of new cases for that plugin, per provider ID and history source.

To use the defaults, add `retry` to your strategies.

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: retry
```

## How It Works

Promptfoo combines failed cases from local SQLite and, when connected, Promptfoo Cloud. Either source can supply cases if the other is empty or unavailable. Duplicate inputs with the same strategy appear once.

Cloud retries use a plain-text prompt with the current plugin’s local settings and assertions. Promptfoo skips ambiguous or incompatible cases, including multi-turn, multimodal and structured inputs, template expressions and file or package references. Grading markers and companion variables must match the local test. Goal-based tests such as `intent` require a historical goal matching a current local goal. Single-turn agentic strategies and Best-of-N need a recorded final prompt. Layered and authoritative markup attacks use local history only. Local retries retain their saved configuration.

## Example Scenarios

This configuration combines `retry` with `jailbreak`.

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - id: harmful:hate
      numTests: 5
  strategies:
    - id: retry
    - id: jailbreak
```

Promptfoo generates five new cases, then looks up up to five failures per source and provider ID for `harmful:hate`. The `jailbreak` strategy applies only to the new cases.

## Best Practices

1. Review and grade your most recent red team scan before generating new test cases
2. Use it in combination with other strategies for maximum coverage

## Related Concepts

- [Strategies Overview](/docs/red-team/strategies) - See how retry fits with other strategies
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) - Understand what vulnerabilities to test for
- [Best-of-N Strategy](best-of-n.md) - Another approach to improving attack success rate
