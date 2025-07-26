# Max Score Selection Example

This example demonstrates the `max-score` assertion, which selects outputs based on objective scoring from other assertions.

## Overview

The `max-score` assertion:
- Aggregates scores from other assertions (correctness tests, quality checks, etc.)
- Selects the output with the highest aggregate score
- Provides transparent, deterministic selection without additional LLM calls

## Running the Example

```bash
npx promptfoo@latest eval
```

## What This Example Shows

### 1. Weighted Scoring
The first test case demonstrates weighted scoring where correctness (Python tests) is weighted 3x more than other criteria:

```yaml
- type: max-score
  value:
    weights:
      python: 3          # Correctness is most important
      llm-rubric: 1      # Efficiency and docs are secondary
      contains: 0.5      # Basic structure check
```

### 2. Comparison with select-best
The example includes both `max-score` and `select-best` assertions on the same test, allowing you to compare:
- **max-score**: Objective, based on test scores
- **select-best**: Subjective, based on LLM judgment

### 3. Different Aggregation Methods
The second test shows using average scoring with a threshold:

```yaml
- type: max-score
  value:
    method: average  # Use average instead of weighted sum
    threshold: 0.6   # Require at least 60% average score
```

### 4. Simple Usage
The third test demonstrates the simplest usage with no configuration:

```yaml
- type: max-score  # Automatically averages all assertion scores
```

## Understanding the Results

When you run the evaluation, you'll see:
- Individual assertion results for each output
- The aggregate score calculated by max-score
- Which output was selected and why
- Comparison with select-best's choice (if different)

## Key Benefits

1. **Transparency**: See exactly why an output was selected
2. **Determinism**: Same scores always produce same selection
3. **No API Calls**: Uses existing assertion scores, no additional LLM calls
4. **Flexibility**: Weight different criteria based on importance

## When to Use max-score

Use `max-score` when:
- You have objective criteria (tests, metrics)
- You want reproducible results
- You need to weight different aspects differently
- You want to avoid additional API costs

Use `select-best` when:
- You need subjective judgment
- The criteria are hard to quantify
- You want nuanced evaluation of quality