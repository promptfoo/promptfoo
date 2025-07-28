---
sidebar_position: 9
---

# Verdict

Verdict is a powerful framework for scaling "judge-time compute" using compound LLM-as-a-judge systems. It's based on the [Verdict library](https://github.com/haizelabs/verdict) by Haize Labs.

## Score Normalization

To maintain consistency with other promptfoo assertions, all verdict scores are automatically normalized to a 0-1 range:

- **Likert scales**: A score of 3 on a 1-5 scale becomes 0.5 (normalized as `(3-1)/(5-1) = 0.5`)
- **Custom numeric scales**: Proportionally mapped to 0-1
- **Binary categories**: "yes" = 1, "no" = 0
- **Custom categories**: All valid choices = 1 (pass)

The original scores are preserved in the output for transparency, shown as "Score: 3 (normalized: 0.50)".

## How to use it

To use Verdict in your test configuration:

```yaml
# Simple yes/no judgment
assert:
  - type: verdict
    value: 'Is this response helpful and accurate?'
```

For more complex evaluations:

```yaml
# Categorical classification
assert:
  - type: verdict
    value:
      type: categorical
      prompt: 'What is the sentiment of this response?'
      categories: ['positive', 'negative', 'neutral']

# Numeric rating
assert:
  - type: verdict
    value:
      type: likert
      prompt: 'Rate the quality from 1-10'
      scale: [1, 10]
    threshold: 7
```

## How it works

Verdict provides a flexible system for LLM evaluation through:

1. **Units**: Basic evaluation blocks (judges, verifiers, aggregators)
2. **Layers**: Groups of units that can work in parallel
3. **Pipelines**: Sequential processing of units and layers
4. **Scales**: Typed response schemas (categorical, numeric, boolean)

## Unit Types

### Judge Units

**Categorical Judge**
```yaml
assert:
  - type: verdict
    value:
      type: categorical
      prompt: 'Classify the tone of this response'
      categories: ['formal', 'casual', 'technical']
```

**Likert Scale Judge**
```yaml
assert:
  - type: verdict
    value:
      type: likert
      prompt: 'Rate clarity on a scale of 1-5'
      scale: [1, 5]
      explanation: true  # Request reasoning
```

**Pairwise Comparison**
```yaml
assert:
  - type: verdict
    value:
      type: pairwise
      prompt: |
        Compare these responses:
        A: {{ output }}
        B: "Alternative response here"
        
        Which is better?
      options: ['A', 'B']
```

**Verification Unit**
```yaml
assert:
  - type: verdict
    value:
      pipeline:
        - type: categorical
          name: initial
          prompt: 'Is this factually correct?'
          categories: ['correct', 'incorrect']
        - type: verify
          prompt: 'Verify the previous assessment: {{ previous.initial.choice }}'
```

### Aggregation Units

**Majority Voting (Max Pool)**
```yaml
assert:
  - type: verdict
    value:
      pipeline:
        - layer:
            unit:
              type: categorical
              prompt: 'Is this appropriate?'
              categories: ['yes', 'no']
            repeat: 3  # Create 3 judges
        - type: max-pool  # Take majority vote
```

**Average Score (Mean Pool)**
```yaml
assert:
  - type: verdict
    value:
      pipeline:
        - layer:
            units:
              - type: likert
                prompt: 'Rate accuracy (1-5)'
                scale: [1, 5]
            repeat: 5
        - type: mean-pool
```

**All Must Pass (Min Pool)**
```yaml
assert:
  - type: verdict
    value:
      pipeline:
        - layer:
            units:
              - type: categorical
                prompt: 'Is it safe?'
                categories: ['yes', 'no']
              - type: categorical
                prompt: 'Is it accurate?'
                categories: ['yes', 'no']
        - type: min-pool  # All must be 'yes'
```

**Weighted Average**
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

## Advanced Examples

### Multi-Stage Verification Pipeline

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        # Layer 1: Multiple aspects
        - layer:
            units:
              - type: categorical
                name: factual
                prompt: 'Is this factually accurate?'
                categories: ['accurate', 'inaccurate']
                explanation: true
              - type: likert
                name: complete
                prompt: 'How complete is the answer? (1-5)'
                scale: [1, 5]
        
        # Layer 2: Verify judgments
        - layer:
            units:
              - type: verify
                prompt: |
                  Review: {{ previous.factual.choice }}
                  Reason: {{ previous.factual.explanation }}
                  Is this assessment valid?
        
        # Final aggregation
        - type: mean-pool
```

### Hierarchical Evaluation

```yaml
assert:
  - type: verdict
    value:
      pipeline:
        # Expert evaluations
        - layer:
            units:
              - type: likert
                name: expert1
                prompt: 'As a domain expert, rate this (1-10)'
                scale: [1, 10]
                explanation: true
              - type: likert
                name: expert2
                prompt: 'As a technical reviewer, rate this (1-10)'
                scale: [1, 10]
                explanation: true
        
        # Meta-evaluation
        - type: categorical
          prompt: |
            Expert 1: {{ previous.expert1.score }}/10
            Expert 2: {{ previous.expert2.score }}/10
            
            Do the experts agree?
          categories: ['strong agreement', 'mild agreement', 'disagreement']
```

## Customizing the Evaluator

You can override the default evaluator (GPT-4o) in several ways:

```yaml
# Per assertion
assert:
  - type: verdict
    value: 'Is this helpful?'
    provider: openai:gpt-4.1-mini

# In the verdict configuration
assert:
  - type: verdict
    value:
      type: likert
      prompt: 'Rate quality (1-5)'
      scale: [1, 5]
      provider: anthropic:claude-3-opus

# Via test options
defaultTest:
  options:
    provider: openai:gpt-4.1
```

## Using Variables

You can use test variables in your verdict prompts:

```yaml
tests:
  - vars:
      expected_tone: professional
      max_length: 200
    assert:
      - type: verdict
        value:
          type: categorical
          prompt: |
            Does this response maintain a {{ expected_tone }} tone?
            Response: {{ output }}
          categories: ['yes', 'no']
```

## Threshold Support

All verdict evaluations support thresholds, which operate on the normalized 0-1 scale:

- **Numeric scores**: Threshold applies to normalized score (e.g., threshold: 0.8 requires 80% of max)
- **Binary categories**: 'yes' = 1, 'no' = 0
- **Custom categories**: All valid categories = 1 (pass by default)

```yaml
assert:
  - type: verdict
    value:
      type: likert
      prompt: 'Rate overall quality'
      scale: [1, 10]
    threshold: 0.8  # Requires normalized score ≥ 0.8 (raw score ≥ 8.2 on 1-10 scale)
```

For a 1-5 Likert scale:
- threshold: 0.5 = requires score ≥ 3
- threshold: 0.75 = requires score ≥ 4
- threshold: 1.0 = requires perfect score of 5

## Further Reading

- [Verdict GitHub Repository](https://github.com/haizelabs/verdict)
- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [Example configurations](https://github.com/promptfoo/promptfoo/tree/main/examples/verdict)