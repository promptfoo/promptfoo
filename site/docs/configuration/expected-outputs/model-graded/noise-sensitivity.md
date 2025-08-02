---
sidebar_label: Noise Sensitivity
---

# Noise Sensitivity

The `noise-sensitivity` assertion evaluates how robust an LLM's responses are to noisy or irrelevant context. This metric is based on the [RAGAS noise sensitivity](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/noise_sensitivity/) approach.

This assertion is useful for testing RAG (Retrieval-Augmented Generation) systems where retrieved context may contain irrelevant or distracting information.

## How it works

The noise sensitivity metric measures how robust an LLM is to noisy or irrelevant context by:

1. **Extracting claims** from the LLM's output
2. **Verifying each claim** for factual correctness (compared to ground truth)
3. **For incorrect claims**, identifying which context chunk they came from
4. **Calculating the score** based on the mode:
   - **Relevant mode**: All incorrect claims count as noise sensitivity
   - **Irrelevant mode**: Only incorrect claims from irrelevant chunks count

A lower score indicates better robustness (the model is less influenced by noise in the context).

### Formula

```
noise_sensitivity = incorrect_claims_subset / total_claims

where:
- relevant mode: incorrect_claims_subset = ALL incorrect claims
- irrelevant mode: incorrect_claims_subset = incorrect claims from irrelevant chunks only
```

### RAGAS Compatibility

This implementation follows the RAGAS algorithm exactly. For full compatibility, you can provide labeled context chunks indicating which parts are relevant or irrelevant to the query.

## Basic Example

```yaml
assert:
  - type: noise-sensitivity
    value: "Paris is the capital of France"  # Ground truth
    threshold: 0.2  # Maximum 20% incorrect claims
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | number | 0.2 | Maximum acceptable ratio of incorrect claims (0-1) |
| `mode` | string | 'relevant' | Either 'relevant' or 'irrelevant' - affects which claims count as noise-influenced |
| `noiseContext` | string | - | Additional noisy context to inject (backward compatibility) |
| `contextChunks` | array | - | Array of context chunks with relevance labels (RAGAS-compatible format) |

## Mode Options

- **`relevant`** (default): Assumes all context is relevant. Any incorrect claim indicates the model was influenced by noise in the "relevant" context. Score = incorrect claims / total claims.
- **`irrelevant`**: Only counts incorrect claims that come from irrelevant context chunks. This mode requires labeled context chunks to distinguish between relevant and irrelevant content. Score = incorrect claims from irrelevant chunks / total claims.

## Example with Configuration

```yaml
tests:
  - vars:
      query: "What is the capital of France?"
      context: |
        Paris is the capital of France. The city has a population of over 2 million.
        Berlin is the capital of Germany. London is known for its fog.
        Tokyo has excellent sushi restaurants.
    assert:
      - type: noise-sensitivity
        value: "Paris is the capital of France. It has a population of over 2 million people."
        threshold: 0.1
        config:
          mode: relevant
          noiseContext: "Rome is famous for pasta. Madrid has great weather."
```

## Example with Labeled Context Chunks (RAGAS-Compatible)

```yaml
providers:
  - openai:gpt-4

tests:
  - vars:
      query: "What are the main features of Python?"
      contextChunks:
        - text: "Python is a high-level programming language known for its simplicity and readability."
          relevant: true
        - text: "JavaScript is used for web development. Java requires compilation."
          relevant: false
        - text: "Python supports multiple programming paradigms including procedural and object-oriented."
          relevant: true
        - text: "Ruby was created by Yukihiro Matsumoto in 1995."
          relevant: false
    assert:
      - type: noise-sensitivity
        value: |
          Python is a high-level programming language known for its simplicity and readability.
          It supports multiple programming paradigms including procedural and object-oriented programming.
        threshold: 0.2
        config:
          mode: irrelevant
          contextChunks: '{{contextChunks}}'
```

In this example:
- Relevant chunks contain information about Python
- Irrelevant chunks contain information about other languages
- In `irrelevant` mode, only incorrect claims from the irrelevant chunks (JavaScript, Java, Ruby) count toward the noise sensitivity score

### Step-by-Step Calculation Example

Let's say the LLM outputs: "Python is a high-level language. JavaScript is also popular."

1. **Extract claims**:
   - "Python is a high-level language" 
   - "JavaScript is also popular"

2. **Check correctness** (vs ground truth):
   - First claim: ✓ Correct (matches ground truth)
   - Second claim: ✗ Incorrect (not in ground truth)

3. **Find source** (for incorrect claims):
   - "JavaScript is also popular" → from irrelevant chunk #2

4. **Calculate score**:
   - Relevant mode: 1 incorrect / 2 total = 0.5
   - Irrelevant mode: 1 incorrect from irrelevant / 2 total = 0.5

## Performance Considerations

The noise sensitivity assertion makes multiple LLM calls per test:
1. One call to extract claims from the output
2. For each claim:
   - One call to verify factual correctness against ground truth
   - If incorrect, one or more calls to identify which context chunk it came from

This can impact performance and cost. Consider using this assertion selectively for critical test cases.

### Tips for Optimization

- Use a faster/cheaper model for grading (e.g., `gpt-4o-mini`)
- Test with smaller context chunks when possible
- Consider caching results for repeated tests

## Legacy Format Support

For backward compatibility, you can still use the simple string format for context:

```yaml
tests:
  - vars:
      query: "What is the capital of France?"
      context: "Paris is the capital of France. Berlin is the capital of Germany."
    assert:
      - type: noise-sensitivity
        value: "Paris is the capital of France"
        threshold: 0.1
```

However, this format treats all context as relevant, limiting the usefulness of the `irrelevant` mode.

## Common Use Cases

### 1. Testing RAG Robustness

```yaml
# Test if your RAG system can focus on relevant information
tests:
  - vars:
      query: "What is the main export of Brazil?"
      contextChunks:
        - text: "Brazil's main export is soybeans, accounting for billions in revenue."
          relevant: true
        - text: "Argentina is famous for its beef exports."
          relevant: false
        - text: "Chile exports large amounts of copper."
          relevant: false
```

### 2. Evaluating Distraction Resistance

```yaml
# Test if the model gets distracted by similar but irrelevant information
tests:
  - vars:
      query: "When was the iPhone first released?"
      contextChunks:
        - text: "The iPhone was first released by Apple in 2007."
          relevant: true
        - text: "The iPad was released in 2010."
          relevant: false
        - text: "Samsung released the Galaxy S in 2010."
          relevant: false
```

## Troubleshooting

### High Noise Sensitivity Scores

If you're getting unexpectedly high scores:

1. **Check your ground truth**: Make sure it includes all correct information the model might output
2. **Review context chunks**: Ensure chunks are properly labeled as relevant/irrelevant
3. **Consider the threshold**: Typical good scores are below 0.2-0.3

### Mode Selection

- Use **relevant mode** when testing general robustness to any incorrect information
- Use **irrelevant mode** when specifically testing the ability to ignore irrelevant context

## RAGAS Attribution

This implementation is based on the noise sensitivity metric from the [RAGAS framework](https://github.com/explodinggradients/ragas). The metric helps evaluate robustness of RAG systems to noisy or irrelevant retrieved context.

For the original implementation and research, see the [RAGAS documentation](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/noise_sensitivity/).

## Related Assertions

- [Context Faithfulness](./context-faithfulness.md) - Ensures the answer is faithful to the provided context
- [Context Relevance](./context-relevance.md) - Evaluates if the context is relevant to the query
- [Answer Relevance](./answer-relevance.md) - Checks if the answer addresses the question