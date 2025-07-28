# Verdict Assertion

The `verdict` assertion type implements a TypeScript port of the [Verdict library](https://github.com/haizelabs/verdict) for scaling judge-time compute in LLM evaluations.

## Overview

Verdict enables sophisticated LLM-as-a-judge evaluation pipelines through:

- **Units**: Base evaluation blocks (judges, verifiers)
- **Layers**: Containers for multiple units with connection patterns
- **Pipelines**: Orchestration of units and layers
- **Scales**: Typed response schemas
- **Aggregation**: Ensemble voting and result pooling

## Basic Usage

### Simple Verdict

```yaml
assert:
  - type: verdict
    value: 'Is this response accurate?'
    threshold: 0.8
```

### Categorical Verdict

```yaml
assert:
  - type: verdict
    value:
      type: categorical
      prompt: 'Classify the sentiment of this response'
      categories: ['positive', 'negative', 'neutral']
```

### Likert Scale Rating

```yaml
assert:
  - type: verdict
    value:
      type: likert
      prompt: 'Rate the quality on a scale of 1-5'
      scale: [1, 5]
      explanation: true
    threshold: 4
```

## Advanced Usage

### Pipeline with Verification

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        # First judge the response
        - type: categorical-judge
          prompt: |
            Is this explanation scientifically accurate?
            Consider factual correctness and clarity.
          categories: ['accurate', 'inaccurate']
          explanation: true

        # Then verify the judgment
        - type: verify
          prompt: |
            Review the previous assessment.
            Previous judgment: {{ previous.categorical_judge.choice }}
            Explanation: {{ previous.categorical_judge.explanation }}

            Do you agree with this assessment?
```

### Ensemble Voting with Layers

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        # Create 3 judges
        - layer:
            unit:
              type: categorical-judge
              prompt: 'Is this response helpful?'
              categories: ['helpful', 'not helpful']
            repeat: 3

        # Aggregate with majority vote
        - type: max-pool
    threshold: 0.6
```

### Complex Pipeline Example

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        # Multiple evaluation criteria
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

              - type: categorical
                name: safety
                prompt: 'Is this response safe?'
                categories: ['safe', 'unsafe']

        # Weighted aggregation
        - type: weighted-mean
          weights:
            accuracy: 0.5
            clarity: 0.3
            safety: 0.2
```

## Unit Types

### Judge Units

- **`judge`** / **`likert`**: Numeric rating on a scale
- **`categorical`** / **`categorical-judge`**: Classification into categories
- **`pairwise`** / **`pairwise-judge`**: Compare two options
- **`verify`**: Verify previous judgments

### Aggregation Units

- **`max-pool`** / **`majority-vote`**: Most common result
- **`mean-pool`** / **`average`**: Average of numeric scores
- **`weighted-mean`** / **`weighted-mean-pool`**: Weighted average
- **`min-pool`**: Minimum score (conservative)

## Configuration Options

### Unit Configuration

- `prompt`: The evaluation prompt (supports Nunjucks templates)
- `provider`: Optional provider override
- `temperature`: Optional temperature setting
- `explanation`: Request reasoning (boolean)
- `categories`: For categorical units (array or scale)
- `scale`: For numeric units (array [min, max] or scale object)
- `options`: For pairwise comparison
- `weights`: For weighted aggregation

### Layer Configuration

- `units`: Array of unit configurations
- `unit`: Single unit configuration (alternative to `units`)
- `repeat`: Number of times to repeat units
- `inner`: Connection pattern (`none`, `chain`, `dense`, `broadcast`)

### Pipeline Configuration

- `pipeline`: Array of units and layers
- `threshold`: Pass/fail threshold (default: 0.5)

## Template Variables

Units have access to:

- `{{ output }}`: The output being evaluated
- `{{ vars.* }}`: Test variables
- `{{ previous.* }}`: Results from previous units

## Token Usage

Token usage is automatically tracked and accumulated across all units in the pipeline.

## Examples

See the `examples/verdict/` directory for complete examples:

- `basic-verdict.yaml`: Simple verdict assertions
- `ensemble-voting.yaml`: Multiple judges with aggregation
- `verification-pipeline.yaml`: Multi-stage verification
- `custom-scales.yaml`: Custom rating scales

## Attribution

This implementation is based on:

```
Kalra, N., & Tang, L. (2025). VERDICT: A Library for Scaling Judge-Time Compute.
arXiv preprint arXiv:2502.18018.
```

Original library: https://github.com/haizelabs/verdict
