---
sidebar_label: Select Best
description: 'Leverage AI models to automatically select and rank the best outputs from multiple LLM responses for quality optimization'
---

# Select best

The `select-best` assertion identifies which prompt or model produces the best output for a given criterion.

**What it measures**: Given multiple outputs from different prompts or providers, it evaluates which one best meets your specified criterion. Only the winning output passes; all others fail.

**Example**:

- Criterion: "Most engaging tweet"
- Output A: Informative but dry → Fails
- Output B: Funny and viral-worthy → Passes (winner)
- Output C: Too long → Fails

This metric is ideal for **A/B testing prompts** or **comparing model performance**.

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

This creates a clear winner-takes-all evaluation, perfect for optimization and comparison tasks.

### Complete example - Comparing prompts

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Compare different prompt strategies'

# Multiple prompts to compare
prompts:
  - 'Write a tweet about {{topic}}'
  - 'Write a concise, funny tweet about {{topic}}'
  - 'Compose a viral tweet about {{topic}} with emojis'

providers:
  - id: openai:gpt-4o-mini

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
  - id: openai:gpt-4o-mini
  - id: openai:gpt-4o
  - id: anthropic:claude-3-haiku

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

- **Prompt optimization**: Finding the best wording or structure
- **Model selection**: Comparing different models on same tasks
- **Style testing**: Identifying which approach works best for your use case
- **A/B testing**: Evaluating variations systematically

## Related assertions

- [`max-score`](/docs/configuration/expected-outputs/model-graded/max-score) - Accepts any output meeting a threshold
- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For individual scoring without comparison
- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - For detailed evaluation with reasoning

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more evaluation options
- [Getting Started](/docs/getting-started) for promptfoo basics
- [Prompt optimization guide](/docs/guides/prompt-optimization) for systematic improvement
