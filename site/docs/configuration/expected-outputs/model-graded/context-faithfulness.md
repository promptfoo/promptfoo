---
sidebar_label: Context Faithfulness
---

# Context faithfulness

The `context-faithfulness` assertion evaluates whether the AI's response is faithful to the provided context, checking for hallucinations or unsupported claims.

:::info
This implementation is based on the [RAGAS](https://github.com/explodinggradients/ragas) framework's faithfulness metric, using their two-step approach of claim extraction followed by Natural Language Inference (NLI) verification.
:::

## Configuration

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.8 # Score from 0 to 1
```

### Claim-Level Analysis (New)

For more granular insights, enable claim-level analysis to see exactly which claims are supported or unsupported:

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.8
    config:
      claimLevel: true # Enable detailed claim analysis
```

With claim-level analysis, you'll receive:

- Individual claims extracted from the response
- Support status for each claim
- Explanations for verification decisions
- List of unsupported claims in the failure reason

:::note

This assertion requires `query`, context, and the LLM's output to evaluate faithfulness. See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.

:::

### How it works

The context faithfulness checker has two modes:

**Standard Mode:**

1. Analyzes the relationship between the provided context and the AI's response
2. Identifies claims in the response that are not supported by the context
3. Returns a score from 0 to 1, where 1 means the response is completely faithful to the context

**Claim-Level Mode** (when `config.claimLevel: true`):

1. Extracts individual factual claims from the AI's response (using RAGAS statement extraction)
2. Verifies each claim against the provided context using Natural Language Inference (NLI)
3. Calculates the score as the ratio of supported claims to total claims
4. Provides detailed feedback on which specific claims lack support

This mode gives you the same granular analysis as RAGAS, showing exactly which claims in your LLM's response are hallucinated.

### Example

**Standard Mode:**

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
      context: 'France is a country in Europe. Paris is the capital and largest city of France.'
    assert:
      - type: context-faithfulness
        threshold: 0.8
```

**Claim-Level Mode:**

```yaml
tests:
  - vars:
      query: 'Tell me about the Eiffel Tower'
      context: |
        The Eiffel Tower is a wrought-iron lattice tower in Paris, France.
        It was designed by Gustave Eiffel and built between 1887 and 1889.
        The tower is 330 meters tall.
    assert:
      - type: context-faithfulness
        threshold: 0.8
        config:
          claimLevel: true
```

Example output with claim-level analysis:

```
FAIL: 3/4 claims supported (75.0%)
Unsupported claims:
- "The Eiffel Tower has a restaurant at the top"

Detailed results:
✓ "The Eiffel Tower is in Paris" - Supported by context
✓ "It was built between 1887 and 1889" - Supported by context
✓ "The tower is 330 meters tall" - Supported by context
✗ "The Eiffel Tower has a restaurant at the top" - Not mentioned in context
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
     - type: context-faithfulness
       threshold: 0.9
       provider: openai:gpt-4.1-mini
   ```

### Customizing the Prompt

Context faithfulness uses two prompts adapted from RAGAS: one for extracting claims and another for verifying them using Natural Language Inference. You can customize both using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt:
      - |
        Question: {{question}}
        Answer: {{answer}}

        Extract all factual claims from the answer, one per line.
      - |
        Context: {{context}}
        Statements: {{statements}}

        For each statement, determine if it is supported by the context.
        Answer YES if the statement is fully supported, NO if not.
```

## Performance Considerations

When using claim-level analysis (`config.claimLevel: true`):

- Requires two LLM calls instead of one (claim extraction + verification)
- Processing time increases with the number of claims in the response
- Consider using a faster/cheaper model for grading if evaluating many test cases
- Results are cached to avoid redundant API calls for identical inputs

# Further reading

- See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
- Learn more about the [RAGAS framework](https://github.com/explodinggradients/ragas) that inspired these metrics.
