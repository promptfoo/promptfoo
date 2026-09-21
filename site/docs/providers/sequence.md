---
sidebar_label: Sequence
description: 'Chain multiple AI providers sequentially to create sophisticated evaluation workflows with data transformation and routing'
---

# Sequence Provider

The Sequence Provider allows you to send a series of prompts to another provider in sequence, collecting and combining all responses. This is useful for multi-step interactions, conversation flows, or breaking down complex prompts into smaller pieces.

## Configuration

The Sequence Provider wraps whichever provider is under test — it replays your inputs against
that provider rather than calling a model itself. Set it as a **test-level** provider (on
`tests[].provider` or `defaultTest.provider`), not in the top-level `providers:` array:

```yaml
defaultTest:
  provider:
    id: sequence
    config:
      inputs:
        - 'First question: {{prompt}}'
        - 'Follow up: Can you elaborate on that?'
        - 'Finally: Can you summarize your thoughts?'
      separator: "\n---\n" # Optional, defaults to "\n---\n"
```

:::caution
Listing `sequence` in the top-level `providers:` array does not work. The provider replays its
inputs against `originalProvider`, which for a top-level entry is the sequence provider itself —
the eval fails with `RangeError: Maximum call stack size exceeded`. Put it on `tests[].provider`
or `defaultTest.provider` so the provider under test is the one being replayed against.
:::

## How It Works

The Sequence Provider:

1. Takes each input string from the `inputs` array
2. Renders it using Nunjucks templating (with access to the original prompt and test variables)
3. Sends it to the provider under test (`originalProvider`)
4. Collects all responses
5. Joins them together using the specified separator

## Usage Example

Here's a complete example showing how to use the Sequence Provider to create a multi-turn conversation:

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

Each of the three inputs is sent to `openai:chat:gpt-5.6-luna`, and the three responses are
joined with the separator into a single output that the assertions run against.

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
