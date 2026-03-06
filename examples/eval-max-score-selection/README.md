# Max-Score Selection Example

This example demonstrates the `max-score` assertion type for objective output selection based on aggregated scores from other assertions.

## Overview

The `max-score` assertion provides a deterministic way to select the best output from multiple providers by:

- Aggregating scores from other assertions (correctness, quality, documentation, etc.)
- Applying configurable weights to different assertion types
- Selecting the output with the highest weighted score
- Providing objective, reproducible selection criteria

## Key Differences from `select-best`

- **Objective**: Uses quantifiable scores rather than LLM judgment
- **Deterministic**: Same inputs always produce same selection
- **Transparent**: Clear scoring methodology based on weighted assertions
- **Cost-effective**: No additional LLM calls for selection

## Configuration

```yaml
- type: max-score
  value:
    method: average # 'average' (default) or 'sum'
    weights:
      python: 3 # Weight for Python code correctness tests
      llm-rubric: 1 # Weight for LLM-evaluated quality rubrics
      javascript: 2 # Weight for JavaScript tests
      contains: 0.5 # Weight for simple string matching
    threshold: 0.7 # Optional minimum score threshold
```

### Options

- **method**: How to aggregate scores
  - `average` (default): Weighted average of assertion scores
  - `sum`: Weighted sum of assertion scores
- **weights**: Map of assertion types to their weights (default: 1.0)
- **threshold**: Minimum score required for selection (optional)

## Usage

### Basic Example

```bash
# Run the main example (requires API keys for OpenAI/Anthropic)
npx promptfoo@latest eval
```

## How It Works

1. **Multiple Outputs Generated**: Each provider generates a solution
2. **Assertions Evaluated**: All assertions run on each output:
   - Python tests verify correctness (pass=1, fail=0)
   - LLM rubrics evaluate quality aspects (0-1 score)
   - Other assertions contribute their scores
3. **Scores Aggregated**: Max-score calculates weighted score for each output
4. **Best Selected**: Output with highest score is marked as passing
5. **Results Shown**: Clear indication of which output won and why

## Example Scoring

Given three outputs with these assertion results:

- Output A: python=1.0, documentation=0.5, efficiency=0.7
- Output B: python=1.0, documentation=0.9, efficiency=0.8
- Output C: python=0.0, documentation=1.0, efficiency=1.0

With weights: python=3, llm-rubric=1

- Output A: (3×1.0 + 1×0.5 + 1×0.7) / 5 = 0.84
- Output B: (3×1.0 + 1×0.9 + 1×0.8) / 5 = 0.94 ✓ (selected)
- Output C: (3×0.0 + 1×1.0 + 1×1.0) / 5 = 0.40

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
