# tests-per-prompt (Filter Tests by Prompt)

This example demonstrates how to run specific tests only with specific prompts using the test-level `prompts` field.

## Overview

By default, promptfoo runs each test against all prompts (a cartesian product). The `prompts` field on test cases lets you break this pattern and associate specific tests with specific prompts.

## Use Cases

- Different assertion criteria for different prompt styles
- Testing prompt-specific behaviors
- Organizing large test suites with mixed prompt types

## Quick Start

```bash
npx promptfoo@latest init --example tests-per-prompt
npx promptfoo@latest eval
```

## Key Features

- **Exact matching**: Reference prompts by label or ID
- **Wildcard patterns**: `Math:*` matches `Math:Basic`, `Math:Advanced`
- **Strict validation**: Invalid references error at config load time
- **defaultTest inheritance**: Set a default prompt filter for all tests

## Configuration

The example uses the echo provider for demonstration. In production, replace with your preferred LLM provider.

```yaml
prompts:
  - id: factual
    label: Factual Assistant
    raw: 'You are factual. Answer: {{question}}'
  - id: creative
    label: Creative Writer
    raw: 'Be creative. Answer: {{question}}'

tests:
  - vars:
      question: 'What is 2+2?'
    prompts:
      - Factual Assistant # Only runs with this prompt
    assert:
      - type: contains
        value: '4'
```

## Learn More

See the [Filtering Tests by Prompt documentation](https://www.promptfoo.dev/docs/configuration/test-cases#filtering-tests-by-prompt) for more details.
