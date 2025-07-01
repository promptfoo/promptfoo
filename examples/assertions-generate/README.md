# assertion-generate (Assertion Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example assertion-scoring-override
```

This example demonstrates valid configs for assertion generation in promptfoo.

1. A promptfoo config with prompts + assertions
2. A promptfoo config with just 1 prompt, and no assertions or test cases

## Getting Started

Try the following options:

Generate initial set of assertions (for a config that has none)

```bash
promptfoo generate assertions --config examples/assertions-generate/promptfooconfig-minimal.yaml -o test.yaml --type llm-rubric
```

Generate missing llm-rubric assertions (for a config that already has some)

```bash
promptfoo generate assertions --config examples/assertions-generate/promptfooconfig.yaml -o test.yaml --type llm-rubric
```

# Assertions Generate Example with External defaultTest

This example demonstrates how to use the `file://` syntax to load `defaultTest` configuration from an external file.

## Structure

- `promptfooconfig.yaml` - Main configuration file
- `shared/defaultTest.yaml` - Shared default test configuration

## Key Features

### External defaultTest Loading

Instead of defining `defaultTest` inline:

```yaml
defaultTest:
  assert:
    - type: llm-rubric
      value: Rate the accuracy...
```

You can reference an external file:

```yaml
defaultTest: file://shared/defaultTest.yaml
```

This allows you to:

- Share common test configurations across multiple projects
- Keep your main config file cleaner
- Maintain test configurations separately

## Running the Example

```bash
npx promptfoo@latest eval
```

The external defaultTest configuration will be loaded automatically and applied to all test cases.
