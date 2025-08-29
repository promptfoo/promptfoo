---
sidebar_label: Select Best
description: 'Select and rank the best outputs from multiple LLM responses using LLM judges'
---

# Select best

The `select-best` assertion identifies which prompt or model produces the best output for a given criterion.

**What it measures**: Given multiple outputs from different prompts or providers, it evaluates which one best meets the specified criterion. Only the winning output passes; all others fail.

**Example**:

- Criterion: "Most engaging tweet"
- Output A: Informative but dry → Fails
- Output B: Funny and viral-worthy → Passes (winner)
- Output C: Too long → Fails

This assertion compares prompts or model performance.

## Required fields

The select-best assertion requires:

- `value` - The criterion for selecting the best output
- **Multiple prompts or providers** - To generate different outputs to compare
- Output - Multiple outputs to evaluate against each other

## Configuration

### Basic usage

```yaml
assert:
  - type: select-best
    value: 'choose the most concise and accurate response'
```

:::warning
This assertion requires multiple prompts or providers in your test configuration. With only one output, there's nothing to compare.
:::

## How it works

The select-best evaluation process:

1. **Collects all outputs** from different prompts/providers in the test
2. **Evaluates each output** against your criterion using an LLM judge
3. **Selects the winner** that best meets the criterion
4. **Returns results**:
   - **Pass**: Only for the winning output
   - **Fail**: For all other outputs

This creates a winner-takes-all evaluation for optimization and comparison tasks.

### Complete example - Comparing prompts

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Compare different prompt strategies'

prompts:
  - 'Write a tweet about {{topic}}'
  - 'Write a concise, funny tweet about {{topic}}'
  - 'Compose a viral tweet about {{topic}} with emojis'

providers:
  - id: openai:gpt-4.1-mini

tests:
  - description: 'Find best prompt for engagement'
    vars:
      topic: 'artificial intelligence'
    assert:
      - type: select-best
        value: 'choose the tweet most likely to get high engagement'

  - description: 'Find best prompt for education'
    vars:
      topic: 'climate change'
    assert:
      - type: select-best
        value: 'choose the most informative yet accessible tweet'
```

### Comparing models example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Compare different models on same task'

prompts:
  - 'Explain {{concept}} in one paragraph'

# Multiple providers to compare
providers:
  - id: openai:gpt-4.1-mini
  - id: openai:gpt-4.1
  - id: anthropic:messages:claude-opus-4-1-latest

tests:
  - description: 'Find best model for technical accuracy'
    vars:
      concept: 'quantum computing'
    assert:
      - type: select-best
        value: 'choose the most technically accurate explanation'
```

### Overriding the Grader

Like other model-graded assertions, you can override the default grader:

1. Using the CLI:

   ```sh
   promptfoo eval --grader openai:gpt-4.1-mini
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-4.1-mini
   ```

3. Using assertion-level override:
   ```yaml
   assert:
     - type: select-best
       value: 'choose the most engaging response'
       provider: openai:gpt-4.1-mini
   ```

### Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Here are {{ outputs | length }} responses:
      {% for output in outputs %}
      Output {{ loop.index0 }}: {{ output }}
      {% endfor %}

      Criteria: {{ criteria }}

      Analyze each output against the criteria.
      Choose the best output by responding with its index (0 to {{ outputs | length - 1 }}).
```

## When to use select-best

- **Prompt optimization**: Finding the best wording or structure across variations
- **Model comparison**: Comparing different models on the same task
- **Style evaluation**: Identifying which approach works best for your use case
- **A/B testing**: Systematically evaluating different approaches

## Performance considerations

- Requires one additional LLM API call per test case for evaluation
- More expensive than [`max-score`](/docs/configuration/expected-outputs/model-graded/max-score) which uses existing assertion scores
- Results may vary between runs due to LLM non-determinism
- Best for subjective criteria where human-like judgment is needed

## Related assertions

- [`max-score`](/docs/configuration/expected-outputs/model-graded/max-score) - Accepts any output meeting a threshold
- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For individual scoring without comparison
- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - For detailed evaluation with reasoning

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more evaluation options
- [Getting Started](/docs/getting-started) for promptfoo basics
- [Getting Started](/docs/getting-started) for systematic improvement
