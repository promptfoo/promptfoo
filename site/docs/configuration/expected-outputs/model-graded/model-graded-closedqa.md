---
sidebar_position: 10
description: 'Assess closed-domain QA performance using model-based evaluation for accuracy, completeness, and answer correctness'
---

# Model-graded closed QA

The `model-graded-closedqa` assertion provides simple yes/no evaluation of whether the LLM output meets a specific criterion.

## Basic usage

```yaml
assert:
  - type: model-graded-closedqa
    value: 'Does the response contain profanity or offensive language?'
```

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For scored evaluation (0-1) instead of binary
- [`contains`](/docs/configuration/expected-outputs/deterministic#contains) - For simple string matching
