---
sidebar_label: Retry Failed Tests
title: Retry Strategy
description: Implement regression testing by automatically retrying failed cases to ensure consistent model behavior across deployments
---

# Retry Strategy

The retry strategy adds previously failed test cases to a new red team scan. It runs first, so later strategies can reuse those historical failures for regression testing.

:::note
The retry strategy is target-specific. It retries test cases that previously failed against the same provider or target ID, so historical failures stay tied to the system where they were found.
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
          - harmful:illegal-activities
```

You can configure:

- `numTests`: Maximum number of historical test cases to include per plugin (default: matches each plugin's numTests setting)
- `plugins`: List of specific plugins to apply retry strategy to (default: all plugins)

For example, with the above configuration and two plugins specified, the retry strategy would include up to 10 historical test cases for `harmful:hate` and another 10 for `harmful:illegal-activities`, all specific to your current target system.

For basic usage without configuration:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: retry
```

## How It Works

The retry strategy works by:

1. Identifying previously failed test cases for the target system
2. Selecting the most recent failed test cases by plugin
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
    - id: jailbreak:meta
```

And previously some hate speech tests failed against your target, the retry strategy will:

1. Generate 5 new hate speech test cases
2. Find previously failed hate speech test cases for this target
3. Combine and deduplicate them
4. Select up to 5 recent failed test cases
5. Pass these to subsequent strategies such as `jailbreak:meta`

## Best Practices

1. Review and grade your most recent red team scan before generating new test cases
2. Use it in combination with other strategies for maximum coverage

:::info
When Promptfoo Cloud is configured, retry checks Cloud results and your local database, then deduplicates the combined history. Without Cloud, it uses the local database only.
:::

## Related Concepts

- [Strategies Overview](/docs/red-team/strategies) - See how retry fits with other strategies
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) - Understand what vulnerabilities to test for
- [Best-of-N Strategy](best-of-n.md) - Another approach to improving attack success rate
