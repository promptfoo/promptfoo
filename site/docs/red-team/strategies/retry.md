---
sidebar_label: Retry Failed Tests
title: Retry Strategy
description: Implement regression testing by automatically retrying failed cases to ensure consistent model behavior across deployments
---

# Retry Strategy

The retry strategy automatically incorporates previously failed test cases into your test suite, creating a regression testing system for target LLM systems. Each red team scan learns from past failures, making promptfoo increasingly effective at finding vulnerabilities in your target. The retry strategy runs first in your pipeline, allowing other strategies to build upon these historical test cases.

:::note
The retry strategy is target-specific - it only retries test cases that previously failed against the same target system (identified by target label). This ensures that the retried test cases are relevant to the specific target's known vulnerabilities.
:::

## Implementation

To include the retry strategy in your red teaming setup:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: 'retry'
      config:
        numTests: 10 # Number of historical test cases to include per plugin
        plugins:
          - harmful:hate # Only retry failed tests from these plugins
          - harmful:illegal
```

You can configure:

- `numTests`: Maximum number of historical test cases to include per plugin (default: matches each plugin's numTests setting)
- `plugins`: List of specific plugins to apply retry strategy to (default: all plugins)

For example, with the above configuration and two plugins specified, the retry strategy would include up to 10 historical test cases for `harmful:hate` and another 10 for `harmful:illegal`, all specific to your current target system.

For basic usage without configuration:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: retry
```

## How It Works

The retry strategy works by:

1. Identifying previously failed test cases for the target system
2. Selecting the most relevant failed test cases by plugin
3. Incorporating these cases into the current test suite
4. Allowing subsequent strategies to build upon this historical knowledge

## Example Scenarios

If you have a test suite with:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - id: harmful:hate
      numTests: 5
  strategies:
    - id: retry
    - id: multilingual
```

And previously some hate speech tests failed against your target, the retry strategy will:

1. Generate 5 new hate speech test cases
2. Find previously failed hate speech test cases for this target
3. Combine and deduplicate them
4. Select the top 5 most relevant test cases
5. Pass these to subsequent strategies (like multilingual)

## Best Practices

1. Review and grade your most recent red team scan before generating new test cases
2. Use it in combination with other strategies for maximum coverage

:::info
Currently, the retry strategy uses only your local database. Cloud sharing of retry test cases across teams is coming soon.
:::

## Related Concepts

- [Strategies Overview](/docs/red-team/strategies) - See how retry fits with other strategies
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) - Understand what vulnerabilities to test for
- [Best-of-N Strategy](best-of-n.md) - Another approach to improving attack success rate
