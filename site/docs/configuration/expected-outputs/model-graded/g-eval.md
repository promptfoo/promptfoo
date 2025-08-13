---
sidebar_position: 8
description: "Apply Google's G-Eval framework for sophisticated multi-criteria LLM evaluation using chain-of-thought and probability scoring"
---

# G-Eval

The `g-eval` assertion uses chain-of-thought reasoning to provide more thoughtful, nuanced evaluation of your LLM outputs.

**What it measures**: Given custom evaluation criteria, it uses a grading LLM with chain-of-thought prompting to deeply analyze whether the output meets those criteria. This produces more reliable evaluations than simple scoring.

**Example**:

- Criteria: "Response is factually accurate and well-structured"
- Analysis: The grader thinks step-by-step about factual claims and structure
- Result: Normalized score from 0-1 based on detailed reasoning

This metric is ideal for **complex evaluation criteria** that benefit from reasoning through multiple aspects.

## Required fields

The g-eval assertion requires:

- `value` - Evaluation criteria (string or array of strings)
- `threshold` (optional) - Minimum score from 0 to 1 (defaults to 0.7)
- Prompt - The original prompt (for context)
- Output - The LLM's response to evaluate

## Configuration

### Basic usage

```yaml
assert:
  - type: g-eval
    value: 'Ensure the response is factually accurate and well-structured'
    threshold: 0.7 # Default threshold
```

### Multiple criteria

```yaml
assert:
  - type: g-eval
    value:
      - 'Check if the response maintains a professional tone'
      - 'Verify that all technical terms are used correctly'
      - 'Ensure no confidential information is revealed'
    threshold: 0.8 # Higher threshold for multiple criteria
```

## How it works

The G-Eval process:

1. **Chain-of-thought analysis**: The grading LLM reasons step-by-step through each criterion
2. **Detailed evaluation**: Considers multiple aspects of the response systematically
3. **Score normalization**: Returns a score from 0 to 1:
   - **1.0**: Fully meets all criteria with excellent quality
   - **0.7**: Meets criteria adequately (default threshold)
   - **0.0**: Fails to meet criteria

G-Eval's chain-of-thought approach produces more consistent and explainable evaluations than simple scoring. Based on the paper ["G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment"](https://arxiv.org/abs/2303.16634).

## Customizing the evaluator

Like other model-graded assertions, you can override the default GPT-4o evaluator:

```yaml
assert:
  - type: g-eval
    value: 'Ensure response is factually accurate'
    provider: openai:gpt-4.1-mini
```

Or globally via test options:

```yaml
defaultTest:
  options:
    provider: openai:gpt-4.1-mini
```

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Use G-Eval for nuanced evaluation with chain-of-thought'

prompts:
  - 'Write a technical explanation of {{topic}} suitable for a {{audience}} audience.'

providers:
  - id: openai:gpt-4o-mini

tests:
  - description: 'Evaluate beginner-friendly explanation'
    vars:
      topic: 'quantum computing'
      audience: 'beginner'
    assert:
      # Single criterion
      - type: g-eval
        value: 'Explanation is clear and accessible to beginners'
        threshold: 0.75

      # Multiple criteria evaluated together
      - type: g-eval
        value:
          - 'Explains technical concepts in simple terms'
          - 'Maintains accuracy without oversimplification'
          - 'Includes relevant examples or analogies'
          - 'Avoids unnecessary jargon'
        threshold: 0.8

  - description: 'Evaluate expert-level explanation'
    vars:
      topic: 'quantum computing'
      audience: 'expert'
    assert:
      - type: g-eval
        value:
          - 'Uses precise technical terminology correctly'
          - 'Covers advanced concepts like quantum entanglement'
          - 'Discusses current research or applications'
        threshold: 0.85
```

## When to use G-Eval vs. alternatives

- **Use `g-eval`** for complex criteria requiring thoughtful analysis
- **Use [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric)** for simpler custom evaluation
- **Use [`model-graded-closedqa`](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa)** for binary yes/no evaluation

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - Simpler custom evaluation without CoT
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - For fact-checking against ground truth
- [`answer-relevance`](/docs/configuration/expected-outputs/model-graded/answer-relevance) - For checking if answers address the query

## Further reading

- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [G-Eval paper](https://arxiv.org/abs/2303.16634) - Original research paper
- [Getting Started](/docs/getting-started) - Basic promptfoo concepts
