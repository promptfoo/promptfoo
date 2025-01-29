---
sidebar_label: Sequence
---

# Sequence Provider

The Sequence Provider allows you to send a series of prompts to another provider in sequence, collecting and combining all responses. This is useful for multi-step interactions, conversation flows, or breaking down complex prompts into smaller pieces.

## Configuration

To use the Sequence Provider, set the provider `id` to `sequence` and provide a configuration object with an array of inputs:

```yaml
providers:
  - id: sequence
    config:
      inputs:
        - 'First question: {{prompt}}'
        - 'Follow up: Can you elaborate on that?'
        - 'Finally: Can you summarize your thoughts?'
      separator: "\n---\n" # Optional, defaults to "\n---\n"
```

## How It Works

The Sequence Provider:

1. Takes each input string from the `inputs` array
2. Renders it using Nunjucks templating (with access to the original prompt and test variables)
3. Sends it to the original provider
4. Collects all responses
5. Joins them together using the specified separator

## Usage Example

Here's a complete example showing how to use the Sequence Provider to create a multi-turn conversation:

```yaml
providers:
  - openai:chat:gpt-4
  - id: sequence
    config:
      inputs:
        - 'What is {{prompt}}?'
        - 'What are the potential drawbacks of {{prompt}}?'
        - 'Can you summarize the pros and cons of {{prompt}}?'
      separator: "\n\n=== Next Response ===\n\n"

prompts:
  - 'artificial intelligence'

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
providers:
  - id: sequence
    config:
      inputs:
        - 'Question about {{topic}}: {{prompt}}'
        - 'Follow up: How does {{topic}} relate to {{industry}}?'
tests:
  - vars:
      topic: AI
      industry: healthcare
      prompt: What are the main applications?
```

## Configuration Options

| Option    | Type     | Required | Default   | Description                                    |
| --------- | -------- | -------- | --------- | ---------------------------------------------- |
| inputs    | string[] | Yes      | -         | Array of prompt templates to send sequentially |
| separator | string   | No       | "\n---\n" | String used to join the responses              |
