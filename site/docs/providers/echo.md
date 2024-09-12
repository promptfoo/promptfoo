---
sidebar_position: 20
---

# Echo Provider

The Echo Provider is a simple utility provider that returns the input prompt as the output. This can be particularly useful for testing, debugging, and working with pre-generated outputs.

## Configuration

To use the Echo Provider, set the provider id to `echo` in your configuration file:

```yaml
providers:
  - echo
```

## Usage

The Echo Provider doesn't require any additional configuration. It will simply return whatever input it receives.

### Example

```yaml
providers:
  - echo
  - openai:chat:gpt-4o-mini

prompts:
  - 'Summarize this in one sentence: {{text}}'

tests:
  - vars:
      text: 'The quick brown fox jumps over the lazy dog.'
    assert:
      - type: contains
        value: 'quick brown fox'
      - type: similar
        value: 'the quick brown fox jumps over the lazy dog.'
        threshold: 0.75
```

In this example, the Echo Provider will return the exact prompt after variable substitution, while the OpenAI provider will generate a summary.

## Use Cases

1. **Debugging Prompts**: Verify that your prompts and variable substitutions are working correctly before using more complex providers.

2. **Baseline Comparisons**: Use the Echo Provider alongside other providers to compare how much the model output differs from the input.

3. **Testing Prompt Templates**: Ensure that your prompt templates are being rendered correctly with different variables.

4. **Assertion Verification**: Use the Echo Provider to test assertion logic on known inputs before applying them to model outputs.

5. **Evaluating Pre-generated Outputs**: Use the Echo Provider to apply promptfoo validation logic to answers you've already obtained, without making new API calls.

6. **Consistency Checks**: For scenarios where you expect the output to be identical or very similar to the input, use the Echo Provider as a control.

7. **Cost Saving in Development**: Use the Echo Provider during development to avoid unnecessary API calls and associated costs.

## Working with Pre-generated Outputs

One key use case for the Echo Provider is evaluating pre-generated outputs. This is particularly useful when:

- You have outputs from production systems that you want to validate.
- You're working with deterministic model outputs (e.g., temperature = 0) and want to avoid redundant API calls.
- You're developing and testing assertion logic and don't need fresh LLM outputs for every run.
