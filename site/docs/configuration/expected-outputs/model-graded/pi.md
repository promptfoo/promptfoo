---
sidebar_position: 8
description: 'Identify and block prompt injection attacks using advanced model-based classification for enhanced security protection'
---

# Pi scorer

The `pi` assertion uses a specialized scoring model for consistent, deterministic evaluation of your LLM outputs.

**What it measures**: Given evaluation criteria, Pi uses a purpose-built scoring model (not an LLM acting as judge) to evaluate outputs. It provides numeric scores without explanations, focusing on consistency - the same input always gets the same score.

**Example**:

- Criteria: "Response is clear and concise"
- Output: Gets a consistent numeric score (e.g., 0.85)
- Same output tested again: Gets exactly 0.85 (deterministic)

This metric is ideal for **consistent benchmarking** when you need reproducible scores.

:::note
**Important**: Unlike `llm-rubric` which works with your existing providers, Pi requires a separate external API key from Pi Labs.
:::

## Alternative Approach

Pi offers a different approach to evaluation with some distinct characteristics:

- Uses a dedicated scoring model rather than prompting an LLM to act as a judge
- Focuses on highly accurate numeric scoring without providing detailed reasoning
- Aims for consistency in scoring the same inputs
- Requires a separate API key and integration

Each approach has different strengths, and you may want to experiment with both to determine which best suits your specific evaluation needs.

## Prerequisites

To use Pi, you **must** first:

1. Create a Pi API key from [Pi Labs](https://build.withpi.ai/account/keys)
2. Set the `WITHPI_API_KEY` environment variable

```bash
export WITHPI_API_KEY=your_api_key_here
```

or set

```yaml
env:
  WITHPI_API_KEY: your_api_key_here
```

in your promptfoo config

## Required fields

The pi assertion requires:

- `value` - The evaluation criteria
- `threshold` (optional) - Minimum score from 0 to 1 (defaults to 0.5)
- `WITHPI_API_KEY` - Environment variable with your Pi Labs API key
- Output - The LLM's response to evaluate

## Configuration

### Basic usage

```yaml
assert:
  - type: pi
    value: 'Is the response clear and concise without being apologetic?'
    threshold: 0.5 # Default threshold
```

:::info
The default threshold is 0.5. Set higher thresholds for stricter evaluation.
:::

## How it works

Pi scorer differs from LLM-as-judge approaches:

1. **Dedicated scoring model**: Purpose-built for evaluation, not a general LLM
2. **Deterministic scoring**: Same input → same score, every time
3. **No reasoning provided**: Returns only numeric scores (0-1)
4. **Consistent benchmarking**: Ideal for tracking improvements over time

### Pi vs. LLM-as-judge comparison

| Aspect           | Pi Scorer             | LLM-as-Judge (llm-rubric)      |
| ---------------- | --------------------- | ------------------------------ |
| Consistency      | 100% deterministic    | May vary between runs          |
| Explanation      | No reasoning provided | Can provide detailed reasoning |
| API Requirements | Separate Pi Labs key  | Uses your existing providers   |
| Best for         | Benchmarking, CI/CD   | Understanding failures         |

## Threshold Support

The `pi` assertion type supports an optional `threshold` property that sets a minimum score requirement. When specified, the output must achieve a score greater than or equal to the threshold to pass.

```yaml
assert:
  - type: pi
    value: Is not apologetic and provides a clear, concise answer
    threshold: 0.8 # Requires a score of 0.8 or higher to pass
```

:::info
The default threshold is `0.5` if not specified.
:::

## Metrics Brainstorming

You can use the [Pi Labs Copilot](https://build.withpi.ai) to interactively brainstorm representative metrics for your application. It helps you:

1. Generate effective evaluation criteria
2. Test metrics on example outputs before integration
3. Find the optimal threshold values for your use case

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Use Pi scorer for consistent, deterministic evaluation'

# Set your Pi API key
env:
  WITHPI_API_KEY: ${WITHPI_API_KEY} # Or hardcode for testing

prompts:
  - 'Explain {{concept}} in simple terms for a {{audience}}.'

providers:
  - id: openai:gpt-4o-mini

tests:
  - description: 'Evaluate beginner explanation'
    vars:
      concept: 'quantum computing'
      audience: 'high school student'
    assert:
      # Pi provides consistent numeric scores
      - type: pi
        value: 'Is the explanation easy to understand without technical jargon?'
        threshold: 0.7

      - type: pi
        value: 'Does the response use appropriate analogies or examples?'
        threshold: 0.75

  - description: 'Evaluate technical explanation'
    vars:
      concept: 'quantum computing'
      audience: 'computer science graduate'
    assert:
      - type: pi
        value: 'Does the response correctly explain the fundamental principles?'
        threshold: 0.8

      - type: pi
        value: 'Is the technical terminology used accurately?'
        threshold: 0.85
```

## When to use Pi vs. alternatives

- **Use `pi`** for consistent benchmarking and CI/CD pipelines
- **Use [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric)** when you need reasoning for failures
- **Use [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval)** for complex evaluation with chain-of-thought

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - LLM-as-judge with explanations
- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - Chain-of-thought evaluation
- [`model-graded-closedqa`](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa) - Binary yes/no evaluation

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) overview
- [Pi Documentation](https://docs.withpi.ai) for calibration and advanced configuration
- [Pi Labs Copilot](https://build.withpi.ai) for brainstorming metrics
