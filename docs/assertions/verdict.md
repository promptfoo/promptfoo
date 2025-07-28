# Verdict Assertion

The `verdict` assertion enables sophisticated LLM-as-a-judge evaluation pipelines based on the [Verdict library](https://github.com/haizelabs/verdict).

## Score Normalization

All verdict scores are automatically normalized to the 0-1 range to match promptfoo's conventions:

- Likert scales (e.g., 1-5) are normalized: score 3 on a 1-5 scale becomes 0.5
- Binary choices (yes/no) map to 1/0
- Custom scales are proportionally mapped to 0-1

The original scores are preserved in the reason field for transparency.

## Threshold Behavior

Thresholds can be specified in two ways:

- **Raw scale values**: Use the actual scale value (e.g., `threshold: 4` for a 1-5 scale)
- **Normalized values**: Use 0-1 range (e.g., `threshold: 0.8` for 80%)

The system automatically detects and normalizes thresholds when scale information is available.

## Basic Usage

```yaml
# Simple yes/no verdict
assert:
  - type: verdict
    value: 'Is this response helpful and accurate?'
```

```yaml
# Categorical classification with expected values
assert:
  - type: verdict
    value:
      type: categorical
      prompt: 'What is the sentiment of this response?'
      categories: ['positive', 'negative', 'neutral']
      expectedCategories: ['positive'] # Only 'positive' will pass
```

```yaml
# Numeric rating with raw threshold
assert:
  - type: verdict
    value:
      type: likert
      prompt: 'Rate the quality from 1-5'
      scale: [1, 5]
    threshold: 4 # Automatically normalized to 0.75
```

## Categorical Assertions

By default, any valid category choice is considered a pass. To specify which categories should pass:

```yaml
assert:
  - type: verdict
    value:
      type: categorical
      prompt: 'Is this explanation accurate?'
      categories: ['accurate', 'partially accurate', 'inaccurate']
      expectedCategories: ['accurate', 'partially accurate'] # These will pass
```

For yes/no categories, positive choices ('yes', 'true', 'correct', etc.) pass by default.

## Advanced Features

### Ensemble Voting

Use multiple judges and aggregate their results:

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        # Create 3 judges
        - layer:
            unit:
              type: categorical
              prompt: 'Is this response accurate?'
              categories: ['yes', 'no']
            repeat: 3
        # Take majority vote
        - type: max-pool
```

### Multi-Stage Verification

Verify judgments with follow-up evaluation:

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        # Initial judgment
        - type: categorical
          prompt: 'Is this explanation correct?'
          categories: ['correct', 'incorrect']
          explanation: true

        # Verify the judgment
        - type: verify
          prompt: 'Review the previous assessment. Is it valid?'
```

### Weighted Criteria

Evaluate multiple aspects with different weights:

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        - layer:
            units:
              - type: likert
                name: accuracy
                prompt: 'Rate accuracy (1-5)'
                scale: [1, 5]

              - type: likert
                name: clarity
                prompt: 'Rate clarity (1-5)'
                scale: [1, 5]

        - type: weighted-mean
          weights:
            accuracy: 0.7
            clarity: 0.3
```

## Unit Types

### Judge Units

- `judge` / `likert` - Numeric rating
- `categorical` - Classification
- `pairwise` - Compare two options
- `verify` - Verify previous judgments

### Aggregation Units

- `max-pool` - Majority vote
- `mean-pool` - Average score
- `weighted-mean` - Weighted average
- `min-pool` - Conservative (all must pass)

## Configuration

- `prompt` - Evaluation prompt (supports templates)
- `categories` - For categorical units
- `scale` - For numeric units [min, max]
- `explanation` - Request reasoning
- `threshold` - Pass/fail threshold
- `provider` - Override LLM provider
- `repeat` - Repeat units in layer

## Examples

See `/examples/verdict/` for complete examples.
