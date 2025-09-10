---
sidebar_position: 8
description: "Apply Google's G-Eval framework for multi-criteria LLM evaluation using chain-of-thought reasoning"
---

# G-Eval

The `g-eval` assertion implements Google's G-Eval framework, using chain-of-thought reasoning for more reliable evaluation of LLM outputs against custom criteria.

**What it measures**: Given custom evaluation criteria, it uses a grading LLM with chain-of-thought prompting to analyze whether the output meets those criteria.

**Example**:

- Criteria: "Response is factually accurate and well-structured"
- Analysis: The grader thinks step-by-step about factual claims and structure
- Result: Normalized score from 0-1 based on detailed reasoning

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
    threshold: 0.7
```

For non-English evaluation output, see the [multilingual evaluation guide](/docs/configuration/expected-outputs/model-graded#non-english-evaluation).

### Multiple criteria

You can also provide multiple evaluation criteria as an array:

```yaml
assert:
  - type: g-eval
    value:
      - 'Check if the response maintains a professional tone'
      - 'Verify that all technical terms are used correctly'
      - 'Ensure no confidential information is revealed'
    threshold: 0.8
```

## How it works

The G-Eval process:

1. **Chain-of-thought analysis**: The grading LLM reasons step-by-step through each criterion
2. **Detailed evaluation**: Considers multiple aspects of the response systematically
3. **Score normalization**: Returns a score from 0 to 1

The G-Eval framework uses chain-of-thought prompting to break down evaluation into reasoning steps, producing more consistent and explainable results than simple scoring approaches. This implementation is based on ["G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment"](https://arxiv.org/abs/2303.16634).

## Customizing the evaluator

Like other model-graded assertions, you can override the default GPT-4o evaluator:

```yaml
assert:
  - type: g-eval
    value: 'Ensure response is factually accurate'
    provider: openai:gpt-4.1
```

Or globally via test options:

```yaml
defaultTest:
  options:
    provider: openai:gpt-4.1
```

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Use G-Eval for nuanced evaluation with chain-of-thought'

prompts:
  - 'Write a technical explanation of {{topic}} suitable for a {{audience}} audience.'

providers:
  - id: openai:gpt-4.1-mini

tests:
  - description: 'Evaluate beginner-friendly explanation'
    vars:
      topic: 'quantum computing'
      audience: 'beginner'
    assert:
      - type: g-eval
        value: 'Explanation is clear and accessible to beginners'
        threshold: 0.75

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
