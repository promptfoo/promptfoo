# combinators (Logical Combinator Assertions)

This example demonstrates the `and` and `or` logical combinator assertions in promptfoo.

## Overview

Combinators allow you to create complex validation logic by combining multiple assertions:

| Type  | Pass Condition           | Score            | Short-Circuit |
| ----- | ------------------------ | ---------------- | ------------- |
| `or`  | ANY sub-assertion passes | Maximum score    | On first pass |
| `and` | ALL sub-assertions pass  | Weighted average | On first fail |

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

## Configuration Options

| Property       | Type      | Default | Description                     |
| -------------- | --------- | ------- | ------------------------------- |
| `type`         | `string`  | -       | `'and'` or `'or'`               |
| `assert`       | `array`   | -       | Sub-assertions to combine       |
| `shortCircuit` | `boolean` | `true`  | Stop on first conclusive result |
| `threshold`    | `number`  | -       | Score threshold for pass (0-1)  |
| `weight`       | `number`  | `1`     | Weight in parent scoring        |
| `metric`       | `string`  | -       | Named metric tag                |

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```
