---
sidebar_label: Echo
description: Use the Echo provider to test prompt rendering or run assertions on previously generated output.
---

# Echo Provider

The Echo Provider returns the input prompt as its output. Use it to test configurations or validate existing outputs without an external API call.

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
- `raw`: The original input string
- `cost`: Always 0
- `cached`: Always false
- `tokenUsage`: Set to `{ total: 0, prompt: 0, completion: 0, numRequests: 1 }`
- `isRefusal`: Always false
- `metadata`: Any additional metadata provided in the context

## Usage

The Echo Provider requires no configuration. Promptfoo renders prompt variables before calling it.

Set `delay` on the provider (in milliseconds) to test how your eval handles slow responses:

```yaml
providers:
  - id: echo
    delay: 500
```

### Example

```yaml
providers:
  - echo
  - openai:chat:gpt-5-mini

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

### Evaluating Logged Production Outputs

Use Echo to run assertions against outputs already generated in production. Echo makes no API calls; model-graded assertions such as `llm-rubric` and `similar` can still call their grading or embedding provider.

Use your logged output directly as the prompt:

```yaml
prompts:
  - '{{logged_output}}'

providers:
  - echo

tests:
  - vars:
      logged_output: 'Paris is the capital of France.'
    assert:
      - type: llm-rubric
        value: 'Answer is factually correct'
      - type: contains
        value: 'Paris'
```

The echo provider returns the prompt as-is, so the assertions receive the logged output directly.

For JSON-formatted production logs, use a default transform to extract specific fields:

```yaml
prompts:
  - '{{logged_output}}'

providers:
  - echo

defaultTest:
  options:
    # Extract just the response field from all logged outputs
    transform: 'JSON.parse(output).response'

tests:
  - vars:
      # Production logs often contain JSON strings
      logged_output: '{"response": "Paris is the capital of France.", "confidence": 0.95, "model": "gpt-5"}'
    assert:
      - type: llm-rubric
        value: 'Answer is factually correct'
  - vars:
      logged_output: '{"response": "London is in England.", "confidence": 0.98, "model": "gpt-5"}'
    assert:
      - type: contains
        value: 'London'
```

This pattern is particularly useful for:

- Post-deployment evaluation of production prompts
- Regression testing against known outputs
- A/B testing assertion strategies on historical data
- Validating system behavior without calling the original model again

For loading large volumes of logged outputs, test cases can be generated dynamically from [CSV files, Python scripts, JavaScript functions, or JSON](/docs/configuration/test-cases).
