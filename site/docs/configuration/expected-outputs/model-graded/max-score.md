---
title: Max-score assertion
description: Configure the `max-score` assertion to deterministically pick the highest-scoring output based on other assertions' scores.
sidebar_label: Max Score
---

# Max Score

The `max-score` assertion selects the output with the highest aggregate score from other assertions. Unlike `select-best` which uses LLM judgment, `max-score` provides objective, deterministic selection based on quantitative scores from other assertions.

## When to use max-score

Use `max-score` when you want to:

- Select the best output based on objective, measurable criteria
- Combine multiple metrics with different importance (weights)
- Have transparent, reproducible selection without LLM API calls
- Select outputs based on a combination of correctness, quality, and other metrics

## How it works

1. All regular assertions run first on each output
2. `max-score` collects the scores from these assertions
3. Calculates an aggregate score for each output (average by default)
4. Selects the output with the highest aggregate score
5. Returns pass=true for the highest scoring output, pass=false for others

## Basic usage

```yaml
prompts:
  - 'Write a function to {{task}}'
  - 'Write an efficient function to {{task}}'
  - 'Write a well-documented function to {{task}}'

providers:
  - openai:gpt-4

tests:
  - vars:
      task: 'calculate fibonacci numbers'
    assert:
      # Regular assertions that score each output
      - type: python
        value: 'assert fibonacci(10) == 55'
      - type: llm-rubric
        value: 'Code is efficient'
      - type: contains
        value: 'def fibonacci'
      # Max-score selects the output with highest average score
      - type: max-score
```

## Configuration options

### Aggregation method

Choose how scores are combined:

```yaml
assert:
  - type: max-score
    value:
      method: average # Default: average | sum
```

### Weighted scoring

Give different importance to different assertions by specifying weights per assertion type:

```yaml
assert:
  - type: python # Test correctness
  - type: llm-rubric # Test quality
    value: 'Well documented'
  - type: max-score
    value:
      weights:
        python: 3 # Correctness is 3x more important
        llm-rubric: 1 # Documentation is 1x weight
```

#### How weights work

- Each assertion type can have a custom weight (default: 1.0)
- For `method: average`, the final score is: `sum(score × weight) / sum(weights)`
- For `method: sum`, the final score is: `sum(score × weight)`
- Weights apply to all assertions of that type

Example calculation with `method: average`:

```
Output A: python=1.0, llm-rubric=0.5, contains=1.0
Weights:  python=3,   llm-rubric=1,   contains=1 (default)

Score = (1.0×3 + 0.5×1 + 1.0×1) / (3 + 1 + 1)
      = (3.0 + 0.5 + 1.0) / 5
      = 0.9
```

### Minimum threshold

Require a minimum score for selection:

```yaml
assert:
  - type: max-score
    value:
      threshold: 0.7 # Only select if average score >= 0.7
```

## Scoring details

- **Binary assertions** (pass/fail): Score as 1.0 or 0.0
- **Scored assertions**: Use the numeric score (typically 0-1 range)
- **Default weights**: 1.0 for all assertions
- **Tie breaking**: First output wins (deterministic)

## Examples

### Example 1: Multi-criteria code selection

```yaml
prompts:
  - 'Write a Python function to {{task}}'
  - 'Write an optimized Python function to {{task}}'
  - 'Write a documented Python function to {{task}}'

providers:
  - openai:gpt-4o-mini

tests:
  - vars:
      task: 'merge two sorted lists'
    assert:
      - type: python
        value: |
          list1 = [1, 3, 5]
          list2 = [2, 4, 6]
          result = merge_lists(list1, list2)
          assert result == [1, 2, 3, 4, 5, 6]

      - type: llm-rubric
        value: 'Code has O(n+m) time complexity'

      - type: llm-rubric
        value: 'Code is well documented with docstring'

      - type: max-score
        value:
          weights:
            python: 3 # Correctness most important
            llm-rubric: 1 # Each quality metric has weight 1
```

### Example 2: Content generation selection

```yaml
prompts:
  - 'Explain {{concept}} simply'
  - 'Explain {{concept}} in detail'
  - 'Explain {{concept}} with examples'

providers:
  - anthropic:claude-3-haiku-20240307

tests:
  - vars:
      concept: 'machine learning'
    assert:
      - type: llm-rubric
        value: 'Explanation is accurate'

      - type: llm-rubric
        value: 'Explanation is clear and easy to understand'

      - type: contains
        value: 'example'

      - type: max-score
        value:
          method: average # All criteria equally important
```

### Example 3: API response selection

```yaml
tests:
  - vars:
      query: 'weather in Paris'
    assert:
      - type: is-json

      - type: contains-json
        value:
          required: ['temperature', 'humidity', 'conditions']

      - type: llm-rubric
        value: 'Response includes all requested weather data'

      - type: latency
        threshold: 1000 # Under 1 second

      - type: max-score
        value:
          weights:
            is-json: 2 # Must be valid JSON
            contains-json: 2 # Must have required fields
            llm-rubric: 1 # Quality check
            latency: 1 # Performance matters
```

## Comparison with select-best

| Feature          | max-score                        | select-best         |
| ---------------- | -------------------------------- | ------------------- |
| Selection method | Aggregate scores from assertions | LLM judgment        |
| API calls        | None (uses existing scores)      | One per eval        |
| Reproducibility  | Deterministic                    | May vary            |
| Best for         | Objective criteria               | Subjective criteria |
| Transparency     | Shows exact scores               | Shows LLM reasoning |
| Cost             | Free (no API calls)              | Costs per API call  |

## Edge cases

- **No other assertions**: Error - max-score requires at least one assertion to aggregate
- **Tie scores**: First output wins (by index)
- **All outputs fail**: Still selects the highest scorer ("least bad")
- **Below threshold**: No output selected if threshold is specified and not met

## Tips

1. **Use specific assertions**: More assertions provide better signal for selection
2. **Weight important criteria**: Use weights to emphasize what matters most
3. **Combine with select-best**: You can use both in the same test for comparison
4. **Debug with scores**: The output shows aggregate scores for transparency

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for other model-based assertions
- [Select best](/docs/configuration/expected-outputs/model-graded/select-best) for subjective selection
- [Assertions](/docs/configuration/expected-outputs) for all available assertion types
