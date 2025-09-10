---
sidebar_position: 20
description: 'Automatically select the best LLM output from multiple options using model-based evaluation and comparison'
---

# Select best

The `select-best` assertion automatically picks the best output from multiple options using LLM judgment.

## Basic usage

```yaml
assert:
  - type: select-best
    value: 'Most helpful and accurate response'
```

## Related assertions

- [`max-score`](/docs/configuration/expected-outputs/model-graded/max-score) - Objective selection based on assertion scores
- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - Individual output scoring
