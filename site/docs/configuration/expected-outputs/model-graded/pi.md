---
sidebar_position: 8
description: 'Use specialized scoring models for consistent, deterministic evaluation of LLM outputs'
---

# Pi Scorer

The `pi` assertion uses a specialized scoring model for consistent, deterministic evaluation of LLM outputs.

## Basic usage

```yaml
assert:
  - type: pi
    value: 'Is the technical terminology used accurately?'
    threshold: 0.8
```

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - LLM-as-judge with explanations
- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - Chain-of-thought evaluation
