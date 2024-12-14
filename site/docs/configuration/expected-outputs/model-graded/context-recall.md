# Context Recall

The `context-recall` assertion evaluates whether key information from a ground truth statement appears in the provided context. This is particularly useful for RAG (Retrieval-Augmented Generation) applications to ensure that important facts are being retrieved. This metric is inspired by [RAGAS's Context Recall](https://docs.ragas.io/en/v0.1.21/concepts/metrics/context_recall.html) methodology.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: context-recall
    threshold: 0.9 # Score between 0.0 and 1.0
    value: 'Key facts that should appear in the context'
```

### Requirements

The assertion requires:

- A `context` variable containing the retrieved documents/context
- A `value` containing the ground truth statement to check for
- A `threshold` for the minimum acceptable score

### How it works

The context recall checker:

1. Breaks down the ground truth into individual statements
2. Evaluates whether each statement appears in the context
3. Calculates semantic similarity between the ground truth and context segments
4. Computes a recall score based on the proportion of supported statements

A higher threshold requires more of the ground truth information to be present in the context.

### Example Configuration

Here's a complete example showing how to use context recall:

```yaml
tests:
  - vars:
      context: |
        Our company policy states:
        - Maximum purchase without approval: $500
        - Purchases above $500 require manager approval
        - Emergency purchases may follow expedited process
    assert:
      - type: context-recall
        threshold: 0.9
        value: max purchase price without approval is $500
```

### Customizing the Grader

Like other model-graded assertions, you can override the default grader in three ways:

1. Using the CLI:

   ```sh
   promptfoo eval --grader openai:gpt-4
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-4
   ```

3. Using assertion-level override:
   ```yaml
   assert:
     - type: context-recall
       threshold: 0.9
       value: 'Key facts to check'
       provider: openai:gpt-4
   ```

### Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Context: {{context}}
      Ground Truth: {{groundTruth}}

      Break down the ground truth into atomic statements.
      For each statement, mark it with [FOUND] if it appears in the context,
      or [NOT FOUND] if it does not.
```

### Further Reading

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
- Learn more about [RAGAS Context Recall](https://docs.ragas.io/en/v0.1.21/concepts/metrics/context_recall.html)
