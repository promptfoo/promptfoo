# combinators (Logical Combinator Assertions)

This example demonstrates the `and` and `or` logical combinator assertions in promptfoo.

## Overview

Combinators allow you to create complex validation logic by combining multiple assertions:

| Type  | Pass Condition           | Score            | Short-Circuit                   |
| ----- | ------------------------ | ---------------- | ------------------------------- |
| `or`  | ANY sub-assertion passes | Maximum score    | On first pass (if no threshold) |
| `and` | ALL sub-assertions pass  | Weighted average | On first fail (if no threshold) |

**Note:** When `threshold` is set, short-circuit is automatically disabled to ensure accurate score computation.

## Use Cases

### Cost Optimization

Run cheap checks first, expensive LLM checks only if needed:

```yaml
assert:
  - type: or
    assert:
      - type: contains # Fast, free
        value: 'Paris'
      - type: llm-rubric # Expensive, only runs if contains fails
        value: 'Mentions Paris correctly'
```

### All-or-Nothing Validation

Ensure multiple criteria are met:

```yaml
assert:
  - type: and
    assert:
      - type: is-json
      - type: contains-json
        value:
          required: [id, name]
```

### Complex Business Logic

Combine AND/OR for sophisticated rules:

```yaml
assert:
  - type: and
    assert:
      - type: or
        assert:
          - type: contains
            value: 'success'
          - type: contains
            value: 'completed'
      - type: is-json
```

### Threshold-Based Scoring

Use threshold for partial success (disables short-circuit for accurate scoring):

```yaml
assert:
  - type: and
    threshold: 0.7 # Pass if average score >= 70%
    assert:
      - type: llm-rubric
        value: 'Response is helpful'
      - type: llm-rubric
        value: 'Response is accurate'
```

## Configuration Options

| Property       | Type      | Default | Description                                                        |
| -------------- | --------- | ------- | ------------------------------------------------------------------ |
| `type`         | `string`  | -       | `'and'` or `'or'`                                                  |
| `assert`       | `array`   | -       | Sub-assertions to combine                                          |
| `shortCircuit` | `boolean` | `true`  | Stop on first conclusive result (auto-disabled when threshold set) |
| `threshold`    | `number`  | -       | Score threshold for pass (0-1)                                     |
| `weight`       | `number`  | `1`     | Weight in parent scoring                                           |
| `metric`       | `string`  | -       | Named metric tag                                                   |
| `config`       | `object`  | -       | Config passed to all sub-assertions (child config wins)            |

## Config Inheritance

Combinator-level `config` is merged into each sub-assertion's `config` (child wins), including nested combinators. This is useful for setting default grading parameters:

```yaml
assert:
  - type: and
    config:
      temperature: 0.5 # Default for all nested assertions
    assert:
      - type: llm-rubric
        value: 'Response is helpful'
      - type: llm-rubric
        value: 'Response is accurate'
        config:
          temperature: 0.1 # Overrides parent config
```

**Note:** Config inheritance only affects the `config` property of sub-assertions. To set a different provider for assertions, use the assertion-level `provider` property directly.

## Metric Namespacing

Named metrics from nested assertions are automatically prefixed with their position in the combinator tree to avoid collisions:

```yaml
assert:
  - type: and
    metric: overall_quality
    assert:
      - type: llm-rubric
        value: 'Response is helpful'
        metric: helpfulness
      - type: llm-rubric
        value: 'Response is accurate'
        metric: accuracy
```

This produces named scores:

- `overall_quality` - the combinator's own score
- `and[0].helpfulness` - first sub-assertion's metric
- `and[1].accuracy` - second sub-assertion's metric

Metric names support Nunjucks templates (e.g., `{{category}}_score`) which are rendered using test variables.

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```
