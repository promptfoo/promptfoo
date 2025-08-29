---
sidebar_label: Model-graded Closed QA
description: 'Assess closed-domain QA performance using model-based evaluation for accuracy, completeness, and answer correctness'
---

# Model-graded closed QA

The `model-graded-closedqa` assertion provides simple yes/no evaluation of whether the LLM output meets a specific criterion.

**What it measures**: Given a criterion and the LLM's response, it evaluates with a binary yes/no whether the response satisfies that criterion. This is useful for clear-cut requirements that don't need nuanced scoring.

**Example**:

- Criterion: "Response is under 100 words"
- Good response: A 50-word answer → Passes (Y)
- Poor response: A 200-word answer → Fails (N)

This assertion handles binary requirements where something either meets the criterion or doesn't.

## Required fields

The model-graded-closedqa assertion requires:

- `value` - The criterion that the output must meet
- Prompt - The original prompt (required for context)
- Output - The LLM's response to evaluate

## Configuration

### Basic usage

```yaml
assert:
  - type: model-graded-closedqa
    value: 'Provides a clear answer without hedging or uncertainty'
```

:::tip
Use specific, measurable criteria. "Is good" is vague; "Includes at least 3 examples" is clear.
:::

:::warning
This assertion returns binary results only. For scored evaluation (0-1 scale), use [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) instead.
:::

## How it works

The model-graded-closedqa checker:

1. Takes the criterion and the LLM output
2. Uses a grading LLM to evaluate if the output meets the criterion
3. Returns Y (pass) if the output meets the criterion, N (fail) otherwise

Unlike scored assertions, this provides clear pass/fail results without ambiguity.

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Evaluate responses against specific binary criteria'

prompts:
  - 'Explain {{topic}} to a {{audience}}'

providers:
  - id: openai:gpt-4o-mini

tests:
  - description: 'Test explanation for beginners'
    vars:
      topic: quantum computing
      audience: 5-year-old
    assert:
      - type: model-graded-closedqa
        value: 'Uses simple language appropriate for a child'
      - type: model-graded-closedqa
        value: 'Avoids technical jargon completely'
      - type: model-graded-closedqa
        value: 'Includes a relatable analogy or example'

  - description: 'Test professional explanation'
    vars:
      topic: quantum computing
      audience: software engineer
    assert:
      - type: model-graded-closedqa
        value: 'Mentions quantum bits (qubits)'
      - type: model-graded-closedqa
        value: 'Discusses superposition or entanglement'
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
     - type: model-graded-closedqa
       value: Is concise and clear
       provider: openai:gpt-4.1-mini
   ```

### Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Question: {{input}}
      Criterion: {{criteria}}
      Response: {{completion}}

      Does this response meet the criterion? Answer Y or N.
```

## When to use vs. alternatives

- **Use `model-graded-closedqa`** for binary criteria (yes/no requirements)
- **Use [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric)** for nuanced evaluation with scoring
- **Use [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality)** for fact-checking against ground truth

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For scored evaluation (0-1) instead of binary
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - For checking factual accuracy
- [`contains`](/docs/configuration/expected-outputs/deterministic#contains) - For simple string matching

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) overview
- See [deterministic assertions](/docs/configuration/expected-outputs/deterministic) for non-LLM-based checks
