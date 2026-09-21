---
sidebar_label: Sequence
description: 'Send several independent prompts to the provider under test, combine the responses, and run assertions on the combined output.'
---

# Sequence Provider

The Sequence Provider sends several prompts to the provider under test and combines the responses. Each prompt is sent independently; later prompts do not receive earlier responses or conversation history.

## Configuration

Set `sequence` on `tests[].provider` or `defaultTest.provider`. Keep the model you want to test in the top-level `providers` array:

```yaml
defaultTest:
  provider:
    id: sequence
    config:
      inputs:
        - 'First question: {{prompt}}'
        - 'Give an example of {{prompt}}.'
        - 'Summarize {{prompt}} in one sentence.'
      separator: "\n---\n" # Optional, defaults to "\n---\n"
```

## How It Works

The Sequence Provider:

1. Takes each input string from the `inputs` array
2. Renders it using Nunjucks templating (with access to the original prompt and test variables)
3. Sends it to the provider under test
4. Collects all responses
5. Joins them together using the specified separator

## Usage Example

This example sends three related prompts and runs assertions on their combined output:

```yaml
providers:
  - openai:chat:gpt-5.6-luna

prompts:
  - '{{prompt}}'

defaultTest:
  provider:
    id: sequence
    config:
      inputs:
        - 'What is {{prompt}}?'
        - 'What are the potential drawbacks of {{prompt}}?'
        - 'Can you summarize the pros and cons of {{prompt}}?'
      separator: "\n\n=== Next Response ===\n\n"

tests:
  - vars:
      prompt: artificial intelligence
    assert:
      - type: contains
        value: drawbacks
      - type: contains
        value: pros and cons
```

## Variables and Templating

Each input string supports Nunjucks templating and has access to:

- The original `prompt`
- Any variables defined in the test context
- Any custom filters you've defined

For example:

```yaml
tests:
  - vars:
      topic: AI
      industry: healthcare
      prompt: What are the main applications?
    provider:
      id: sequence
      config:
        inputs:
          - 'Question about {{topic}}: {{prompt}}'
          - 'Follow up: How does {{topic}} relate to {{industry}}?'
```

## Configuration Options

| Option    | Type     | Required | Default   | Description                                    |
| --------- | -------- | -------- | --------- | ---------------------------------------------- |
| inputs    | string[] | Yes      | -         | Array of prompt templates to send sequentially |
| separator | string   | No       | "\n---\n" | String used to join the responses              |
