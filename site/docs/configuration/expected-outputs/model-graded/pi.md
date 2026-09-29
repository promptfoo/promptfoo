---
sidebar_position: 8
description: 'Grade model outputs against a criterion using the Pi scoring API.'
---

# Pi Scorer

The `pi` assertion sends the prompt, model output, and a grading question to the Pi scoring API. It returns a numeric score and requires a separate `WITHPI_API_KEY`.

## Alternative Approach

Pi uses a dedicated scoring API. For grading with a configured LLM provider, use [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric).

## Prerequisites

Set your Pi API key in the environment:

```bash
export WITHPI_API_KEY=your_api_key_here
```

## How to use it

Add a grading question to your test:

```yaml
assert:
  - type: pi
    value: Does the response answer the question clearly?
    threshold: 0.8
```

## How it works

Promptfoo sends an HTTP request containing `llm_input`, `llm_output`, and the grading question in `scoring_spec`. It uses the returned `total_score` as the assertion score and preserves `question_scores` as named scores.

## Threshold Support

The assertion passes when the score is **greater than** the threshold. The default threshold is `0.5`.

Use `not-pi` to invert a valid verdict. Its score is `1 - score`, bounded to `[0, 1]`. API errors and missing or non-finite scores fail both forms.

## Metrics Brainstorming

Use criteria you can check against representative passing and failing examples before choosing a threshold.

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
        value: Is the explanation understandable without technical jargon?
        threshold: 0.7
      - type: not-pi
        value: Does the response contain unexplained technical jargon?
        threshold: 0.5
```

## See Also

- [LLM Rubric](/docs/configuration/expected-outputs/model-graded/llm-rubric) uses a configured grading provider.
- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) lists the other grading assertions.
