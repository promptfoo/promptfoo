---
sidebar_position: 8
description: 'Grade a response against a question using the Pi Labs scoring model.'
---

# Pi Scorer

The `pi` assertion sends the prompt, provider output, and a grading question to Pi Labs. Its scoring model returns a numeric score for the question.

## Alternative Approach

Use `pi` for a numeric score from a dedicated grading model. Use `llm-rubric` to grade with a rubric and a model of your choice.

## Prerequisites

Create a [Pi Labs API key](https://build.withpi.ai/account/keys) and set `WITHPI_API_KEY` in the environment that runs your eval.

## How to use it

Write the criterion as a question. For example, these assertions require a clear explanation and reject insults:

```yaml
assert:
  - type: pi
    value: Can a reader understand the explanation without technical jargon?
    threshold: 0.8
  - type: not-pi
    value: Does the response insult the reader?
```

## How it works

Promptfoo sends the prompt, the provider output, and the grading question to Pi. It uses the overall score for the assertion and records the per-question scores as named metrics.

## Threshold Support

A score at or above the threshold passes `pi`. The default threshold is `0.5`.

## Negation with `not-pi`

`not-pi` reverses the verdict and reports the complementary score (`1 - score` for scores between 0 and 1). An unavailable scorer or invalid response is a grading error for either assertion.

## Metrics Brainstorming

[Pi Labs Copilot](https://build.withpi.ai) lets you try grading questions against sample outputs before adding them to your eval.

## Example Configuration

```yaml
prompts:
  - 'Explain {{concept}} in simple terms.'
providers:
  - openai:gpt-5
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
