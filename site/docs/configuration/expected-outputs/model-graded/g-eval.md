---
sidebar_position: 8
description: "Apply Google's G-Eval framework for multi-criteria LLM evaluation using chain-of-thought reasoning"
---

# G-Eval

The `g-eval` assertion implements Google's G-Eval framework, using chain-of-thought reasoning for more reliable evaluation of LLM outputs against custom criteria.

## Basic usage

```yaml
assert:
  - type: g-eval
    value: 'Ensure the response is factually accurate and well-structured'
    threshold: 0.7
```

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - Custom evaluation without chain-of-thought
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - Fact-checking against ground truth
