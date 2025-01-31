---
sidebar_label: Retry Failed Tests
---

# Retry Strategy

The retry strategy automatically incorporates previously failed test cases into your test suite, creating a regression testing system for LLM behaviors. Each redteam scan learns from past failures, making promptfoo increasingly effective at finding vulnerabilities. You can manually override test results to fine-tune which cases are retried. The retry strategy runs first in your pipeline, allowing other strategies to build upon these historical test cases.

## Purpose

The retry strategy helps to:

1. Maintain a memory of past failures
2. Automatically test against known vulnerabilities
3. Prevent regression in LLM behavior
4. Build an evolving test suite that learns from experience

## Configuration

To include the retry strategy in your LLM red teaming setup:

```yaml
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

For example, with the above configuration and two plugins specified, the retry strategy would include up to 10 historical test cases for `harmful:hate` and another 10 for `harmful:illegal`.

For basic usage without configuration:

```yaml
redteam:
  strategies:
    - id: 'retry'
```

## Example

If you have a test suite with:

```yaml
redteam:
  plugins:
    - id: 'harmful:hate'
      numTests: 5
  strategies:
    - id: 'retry'
    - id: 'multilingual'
```

And previously some hate speech tests failed, the retry strategy will:

1. Generate 5 new hate speech test cases
2. Find previously failed hate speech test cases
3. Combine and deduplicate them
4. Select the top 5 most relevant test cases
5. Pass these to subsequent strategies (like multilingual)

## Best Practices

1. Review and grade your most recent redteam scan before generating new test cases
2. Use it in combination with other strategies for maximum coverage

:::info
The retry strategy currently uses only your local database. Cloud sharing of retry test cases across teams is coming soon.
:::

## Related Concepts

- [Best-of-N Strategy](best-of-n.md)
- [Basic Strategy](basic.md)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)

For a comprehensive overview of all available strategies, visit our [Strategies Overview](/docs/red-team/strategies) page.
