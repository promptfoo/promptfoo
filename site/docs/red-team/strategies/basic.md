---
sidebar_label: Basic
title: Basic Strategy
description: Configure inclusion of original plugin-generated test cases in evaluation outputs for baseline comparison and analysis
---

# Basic Strategy

The basic strategy controls whether the original plugin-generated test cases (without any strategies applied) are included in the final output.

## Implementation

The basic strategy accepts the following configuration options:

| Option  | Type    | Default | Description                         |
| ------- | ------- | ------- | ----------------------------------- |
| enabled | boolean | true    | Whether to include basic test cases |

Example usage:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: basic
      config:
        enabled: false # Only run tests with strategies applied
    - id: jailbreak
    - id: multilingual
      config:
        languages: ['es', 'fr']
```

## How It Works

By default, promptfoo will:

1. Generate test cases from enabled plugins
2. Apply each strategy to generate additional test cases
3. Include both the original plugin test cases and strategy-generated test cases

When the basic strategy is disabled (`enabled: false`), only the strategy-generated test cases will be included in the final output. This can be useful when you want to focus solely on testing specific attack vectors through strategies.

## Use Cases

- **Testing strategy effectiveness**: Disable basic tests to isolate and evaluate how well your strategies are working
- **Reducing test volume**: If you have many plugins and strategies, disabling basic tests can reduce the total number of tests
- **Focused testing**: When you specifically want to test how your system handles modified/strategic inputs rather than basic plugin-generated tests

## Related Concepts

- [Red Team Plugins](/docs/red-team/plugins/) - Generate test cases for basic strategy
- [Red Team Strategies](/docs/red-team/strategies/) - Other strategies to apply to test cases
- [Configuration Guide](/docs/configuration/guide/) - More advanced configuration options

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
