---
sidebar_position: 8
description: 'Identify and block prompt injection attacks using advanced model-based classification for enhanced security protection'
---

# Pi Scorer

`pi` is an alternative approach to model grading that uses a dedicated scoring model instead of the "LLM as a judge" technique. It can evaluate input and output pairs against criteria.

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

## How to use it

To use the `pi` assertion type, add it to your test configuration:

```yaml
assert:
  - type: pi
    # Specify the criteria for grading the LLM output
    value: Is the response not apologetic and provides a clear, concise answer?
```

This assertion will use the Pi scorer to grade the output based on the specified criteria.

## How it works

Under the hood, the `pi` assertion uses the `withpi` SDK to evaluate the output based on the criteria you provide.

Compared to LLM as a judge:

- The inputs of the eval are the same: `llm_input` and `llm_output`
- Pi does not need a system prompt, and is pretrained to score
- Pi always generates the same score, when given the same input
- Pi requires a separate API key (see Prerequisites section)

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

## Example Configuration

```yaml
prompts:
  - 'Explain {{concept}} in simple terms.'
providers:
  - openai:gpt-4.1
tests:
  - vars:
      concept: quantum computing
    assert:
      - type: pi
        value: Is the explanation easy to understand without technical jargon?
        threshold: 0.7
      - type: pi
        value: Does the response correctly explain the fundamental principles?
        threshold: 0.8
```

## See Also

- [LLM Rubric](/docs/configuration/expected-outputs/model-graded/llm-rubric)
- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded)
- [Pi Documentation](https://docs.withpi.ai) for more options, configuration, and calibration details
