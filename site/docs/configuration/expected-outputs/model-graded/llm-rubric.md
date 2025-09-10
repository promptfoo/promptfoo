---
sidebar_label: LLM Rubric
description: 'Create flexible custom rubrics using natural language to evaluate LLM outputs against specific quality and safety criteria'
---

# LLM Rubric

The `llm-rubric` assertion uses an LLM to grade outputs against custom criteria.

## Basic usage

```yaml
assert:
  - type: llm-rubric
    value: 'Is not apologetic and provides a clear, concise answer'
    threshold: 0.8
```

## Related assertions

- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - Chain-of-thought evaluation
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - Fact-checking against ground truth
