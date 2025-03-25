# Basic Strategy

The basic strategy controls whether the original plugin-generated test cases (without any strategies applied) are included in the final output.

## Configuration

The basic strategy accepts the following configuration options:

| Option  | Type    | Default | Description                         |
| ------- | ------- | ------- | ----------------------------------- |
| enabled | boolean | true    | Whether to include basic test cases |

> **Note:** All strategies now support the `enabled` option with the same functionality. Setting `enabled: false` for any strategy will prevent it from generating test cases.

## Example

```yaml
redteam:
  strategies:
    - id: basic
      config:
        enabled: false # Only run tests with strategies applied
    - id: jailbreak
    - id: multilingual
      config:
        languages: ['es', 'fr']
    - id: rot13
      config:
        enabled: false # Keep this strategy in config but don't run it
```

## How it works

By default, promptfoo will:

1. Generate test cases from enabled plugins
2. Apply each strategy to generate additional test cases
3. Include both the original plugin test cases and strategy-generated test cases

When the basic strategy is disabled (`enabled: false`), only the strategy-generated test cases will be included in the final output. This can be useful when you want to focus solely on testing specific attack vectors through strategies.

Similarly, if you disable a specific strategy with `enabled: false`, no test cases will be generated for that strategy, even though it remains in your configuration.

## Use cases

- **Testing strategy effectiveness**: Disable basic tests to isolate and evaluate how well your strategies are working
- **Reducing test volume**: If you have many plugins and strategies, disabling specific strategies can reduce the total number of tests
- **Focused testing**: When you specifically want to test how your system handles specific modified/strategic inputs rather than all strategies
- **Configuration management**: Keep all strategies in your configuration but selectively enable/disable them as needed

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
