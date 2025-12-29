# tests-per-provider (Isolated Test Suites)

This example demonstrates how to run different tests against different providers in a single evaluation using the `providers` filter on test cases.

## What You'll Learn

- How to filter which providers run specific tests
- How to run separate test suites without cross-pollination
- Using wildcards and labels for provider matching
- Using `defaultTest` to set provider filters globally

## Setup

```bash
npx promptfoo@latest init --example tests-per-provider
npx promptfoo@latest eval
```

## The Problem

Without filtering, promptfoo creates a cross-product of all tests × providers. If you have 2 tests and 2 providers, you get 4 test cases. This example shows how to run specific tests only against specific providers.

## Features Demonstrated

### Provider Filtering

Each test case can specify which providers it should run against:

```yaml
tests:
  - vars:
      question: 'Quick math question'
    providers:
      - fast-model # Only runs on fast-model
    assert:
      - type: latency
        threshold: 2000

  - vars:
      question: 'Complex reasoning'
    providers:
      - smart-model # Only runs on smart-model
```

### Matching Patterns

The `providers` filter supports multiple matching patterns:

| Pattern  | Example        | Matches                               |
| -------- | -------------- | ------------------------------------- |
| Label    | `fast-model`   | Provider with `label: fast-model`     |
| Exact ID | `openai:gpt-4` | Provider with that exact ID           |
| Wildcard | `openai:*`     | All providers starting with `openai:` |
| Prefix   | `openai`       | All providers starting with `openai:` |

### Default Filters

Use `defaultTest.providers` to apply filters to all tests:

```yaml
defaultTest:
  providers:
    - openai:* # All tests default to OpenAI only

tests:
  - vars:
      question: 'Question 1'
  - vars:
      question: 'Question 2'
    providers:
      - anthropic:* # Override for this test only
```

## Result

Instead of 6 test cases (3 tests × 2 providers), this example runs exactly 3 test cases:

- Quick facts test → fast-model only
- Complex reasoning test → smart-model only
- Basic test → both providers

## Learn More

- [Test Case Configuration](/docs/configuration/test-cases#filtering-tests-by-provider)
- [Provider Configuration](/docs/configuration/providers)
