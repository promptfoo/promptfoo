---
sidebar_position: 8
---

# G-Eval

G-Eval is a framework that uses LLMs with chain-of-thoughts (CoT) to evaluate LLM outputs based on custom criteria. It's based on the paper ["G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment"](https://arxiv.org/abs/2303.16634).

## How to use it

To use G-Eval in your test configuration:

```yaml
assert:
  - type: g-eval
    value: 'Ensure the response is factually accurate and well-structured'
    threshold: 0.7 # Optional, defaults to 0.7
```

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

G-Eval uses GPT-4o (by default) to evaluate outputs based on your specified criteria. The evaluation process:

1. Takes your evaluation criteria
2. Uses chain-of-thought prompting to analyze the output
3. Returns a normalized score between 0 and 1

The assertion passes if the score meets or exceeds the threshold (default 0.7).

## Customizing the evaluator

Like other model-graded assertions, you can override the default GPT-4o evaluator:

```yaml
assert:
  - type: g-eval
    value: 'Ensure response is factually accurate'
    provider: openai:gpt-4o-mini
```

Or globally via test options:

```yaml
defaultTest:
  options:
    provider: openai:gpt-4o-mini
```

## Example

Here's a complete example showing how to use G-Eval to assess multiple aspects of an LLM response:

```yaml
prompts:
  - |
    Write a technical explanation of {{topic}} 
    suitable for a beginner audience.
providers:
  - openai:gpt-4
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
