---
title: Numeric Assertions
description: Check numeric outputs, scores, probabilities, and confidence with exact values or inclusive ranges, using the same assertions across different providers.
---

# Numeric Assertions

The `numeric` assertion checks a finite number against an exact value or inclusive bounds. It works with any provider. Use an assertion `transform` to select a numeric field from structured output.

```yaml
assert:
  - type: numeric
    transform: output.confidence ?? NaN
    value: { min: 0.8, max: 1 }
```

| Value                | Check                                         |
| -------------------- | --------------------------------------------- |
| `0.8`                | Exactly `0.8`                                 |
| `{ min: 0.8 }`       | At least `0.8`                                |
| `{ max: 0.2 }`       | At most `0.2`                                 |
| `{ min: 1, max: 2 }` | Between `1` and `2`, including both endpoints |

Bounds must be finite numbers, with at least one of `min` or `max` supplied and `min <= max`. Use ranges for approximate floating-point comparisons. A numeric assertion grades the comparison as `1` or `0`; it does not use the output number as the grading score. The constraint belongs in `value`, not `threshold`.

Outputs can be numbers or JSON number text such as `0.9` or `9e-1`. Empty strings, Booleans, null, arrays, objects, quoted JSON strings, NaN, and infinity fail without numeric coercion. `not-numeric` negates the comparison only for valid numeric outputs; missing or invalid measurements still fail. Invalid constraints are configuration errors.

## Check values and confidence across providers

Keep the answer and its confidence separate. Use `equals` for a selected category and `numeric` for confidence:

```yaml
assert:
  - type: equals
    transform: output.value
    value: billing
  - type: numeric
    transform: output.confidence ?? NaN
    value: { min: 0.8, max: 1 }
```

A provider output transform can expose the fields as `{ value, confidence }`. The [decision-assertions example](https://github.com/promptfoo/promptfoo/tree/main/examples/decision-assertions) maps [OpenAI Decisions](/docs/providers/openai-decisions/) and [TypeSafe Jev](/docs/providers/typesafe/) responses to a shared shape and runs the same assertions against both.

This standardizes checks, not confidence calibration. Tune cutoffs per model using labeled examples. A predicate/Noul probability is not a confidence value, and a refusal has no numeric value to compare. For custom conditions or exclusive bounds, use a [JavaScript assertion](/docs/configuration/expected-outputs/javascript/). To validate several fields and their types together, use [`is-json` with a JSON schema](/docs/configuration/expected-outputs/deterministic/#is-json).
