---
sidebar_label: Echo
---

# Echo Provider

The Echo Provider is a simple utility provider that returns the input prompt as the output. It's particularly useful for testing, debugging, and validating pre-generated outputs without making any external API calls.

## Configuration

To use the Echo Provider, set the provider ID to `echo` in your configuration file:

```yaml
providers:
  - echo
  # or
  - id: echo
    label: pass through provider
```

## Response Format

The Echo Provider returns a complete `ProviderResponse` object with the following fields:

- `output`: The original input string
- `cost`: Always 0
- `cached`: Always false
- `tokenUsage`: Set to `{ total: 0, prompt: 0, completion: 0 }`
- `isRefusal`: Always false
- `metadata`: Any additional metadata provided in the context

## Usage

The Echo Provider requires no additional configuration and returns the input after performing any variable substitutions.

### Example

```yaml
providers:
  - echo
  - openai:chat:gpt-4o-mini

prompts:
  - 'Summarize this: {{text}}'

tests:
  - vars:
      text: 'The quick brown fox jumps over the lazy dog.'
    assert:
      - type: contains
        value: 'quick brown fox'
      - type: similar
        value: '{{text}}'
        threshold: 0.75
```

In this example, the Echo Provider returns the exact input after variable substitution, while the OpenAI provider generates a summary.

## Use Cases and Working with Pre-generated Outputs

The Echo Provider is useful for:

- **Debugging and Testing Prompts**: Ensure prompts and variable substitutions work correctly before using complex providers.

- **Assertion and Pre-generated Output Evaluation**: Test assertion logic on known inputs and validate pre-generated outputs without new API calls.

- **Testing Transformations**: Test how transformations affect the output without the variability of an LLM response.

- **Mocking in Test Environments**: Use as a drop-in replacement for other providers in test environments when you don't want to make actual API calls.
