---
sidebar_label: Retry Failed Tests
---

# Retry Strategy

The retry strategy automatically incorporates previously failed test cases into your test suite. This creates a form of regression testing for LLM behaviors, ensuring that previously identified vulnerabilities are continuously monitored.

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

## How It Works

The retry strategy:

1. Runs before other strategies
2. Groups test cases by plugin type
3. For each plugin:
   - Retrieves previously failed test cases from the database
   - Combines them with newly generated test cases
   - Deduplicates to avoid redundancy
   - Maintains the original test count limits

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

## Benefits

1. **Continuous Learning**: Your test suite evolves based on actual failures
2. **Regression Prevention**: Previously discovered vulnerabilities are automatically retested
3. **Efficiency**: No manual tracking of failed cases needed
4. **Coverage**: Combines historical knowledge with new test cases

## Best Practices

1. Place the retry strategy first in your strategy list
2. Use it in combination with other strategies for maximum coverage
3. Regularly clean up old test cases if they're no longer relevant
4. Monitor the ratio of new vs. historical test cases

:::info
Currently, the retry strategy only checks your local database for failed test cases. Coming soon: promptfoo cloud users will be able to share retry test cases across different targets and teams.
:::

## Related Concepts

- [Best-of-N Strategy](best-of-n.md)
- [Basic Strategy](basic.md)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)

For a comprehensive overview of all available strategies, visit our [Strategies Overview](/docs/red-team/strategies) page.
