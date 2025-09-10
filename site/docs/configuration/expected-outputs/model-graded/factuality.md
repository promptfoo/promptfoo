---
sidebar_label: Factuality
description: 'Validate factual accuracy of LLM responses against reference answers'
---

# Factuality

The `factuality` assertion checks if the LLM output is factually consistent with a ground truth reference.

## Basic usage

```yaml
assert:
  - type: factuality
    value: 'The Earth orbits around the Sun'
```

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For custom evaluation criteria
- [`similar`](/docs/configuration/expected-outputs/similar) - For semantic similarity checks
