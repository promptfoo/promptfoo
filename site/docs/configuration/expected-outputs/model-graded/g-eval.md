---
sidebar_position: 8
description: 'Evaluate LLM outputs against custom criteria with the G-Eval framework using chain-of-thought prompting'
---

# G-Eval

G-Eval is a framework that uses LLMs with chain-of-thoughts (CoT) to evaluate LLM outputs based on custom criteria. It's based on the paper ["G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment"](https://arxiv.org/abs/2303.16634) (Liu et al., Microsoft).

## How to use it

To use G-Eval in your test configuration:

```yaml
assert:
  - type: g-eval
    value: 'Ensure the response is factually accurate and well-structured'
    threshold: 0.7 # Optional, defaults to 0.7
```

For non-English evaluation output, see the [multilingual evaluation guide](/docs/configuration/expected-outputs/model-graded#non-english-evaluation).

You can also provide multiple evaluation criteria as an array:

```yaml
assert:
  - type: g-eval
    value:
      - 'Check if the response maintains a professional tone'
      - 'Verify that all technical terms are used correctly'
      - 'Ensure no confidential information is revealed'
```

## How it works

G-Eval uses `gpt-4.1-2025-04-14` by default to evaluate outputs based on your specified criteria. The evaluation process:

1. Takes your evaluation criteria
2. Uses chain-of-thought prompting to analyze the output
3. Returns a normalized score between 0 and 1

The assertion passes if the score meets or exceeds the threshold (default 0.7). When `value` is an array, each criterion is graded independently and the scores are averaged; the averaged score is compared against the threshold. An empty array is a configuration error and fails with a clear reason.

## Negation with `not-g-eval`

Prepend `not-` to invert the assertion — useful for "must not" criteria:

```yaml
assert:
  - type: not-g-eval
    value: 'The response leaks personally identifiable information'
    threshold: 0.7
```

`not-g-eval` passes when the grader score is **below** the threshold. Transport or parse failures from the grader are reported as failures in both directions — a grader error is not treated as evidence that the criterion was or was not met, so inversion never silently turns a failed grader call into a pass.

## Customizing the evaluator

Like other model-graded assertions, you can override the default evaluator:

```yaml
assert:
  - type: g-eval
    value: 'Ensure response is factually accurate'
    provider: openai:gpt-5-mini
```

Or globally via test options:

```yaml
defaultTest:
  options:
    provider: openai:gpt-5-mini
```

## Example

Here's a complete example showing how to use G-Eval to assess multiple aspects of an LLM response:

```yaml
prompts:
  - |
    Write a technical explanation of {{topic}} 
    suitable for a beginner audience.
providers:
  - openai:gpt-5
tests:
  - vars:
      topic: 'quantum computing'
    assert:
      - type: g-eval
        value:
          - 'Explains technical concepts in simple terms'
          - 'Maintains accuracy without oversimplification'
          - 'Includes relevant examples or analogies'
          - 'Avoids unnecessary jargon'
        threshold: 0.8
```

## Further reading

- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [G-Eval paper](https://arxiv.org/abs/2303.16634)
