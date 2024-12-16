# Context Recall

The `context-recall` assertion evaluates whether key information from a ground truth statement appears in the provided context. This is particularly useful for RAG (Retrieval-Augmented Generation) applications to ensure that important facts are being retrieved.

### How to use it

To use the `context-recall` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: context-recall
    threshold: 0.9 # Score between 0 and 1
    value: 'Key facts that should appear in the context'
```

Note: This assertion requires the `context` variable to be set in your test.

### How it works

The context recall checker:

1. Takes a ground truth statement (the `value`) and the retrieved context
2. Breaks down the ground truth into individual statements
3. Checks which statements are supported by the context
4. Calculates a recall score based on the proportion of supported statements

A higher threshold requires more of the ground truth information to be present in the context.

### Example Configuration

Here's a complete example showing how to use context recall in a RAG system:

```yaml
prompts:
  - |
    Answer this question: {{query}}
    Using this context: {{context}}
providers:
  - openai:gpt-4
tests:
  - vars:
      query: 'What is our maternity leave policy?'
      context: file://docs/policies/maternity.md
    assert:
      - type: context-recall
        threshold: 0.9
        value: |
          Employees get 4 months paid maternity leave.
          Leave can be taken before or after birth.
          Additional unpaid leave is available upon request.
```

### Overriding the Grader

Like other model-graded assertions, you can override the default grader:

1. Using the CLI:

   ```sh
   promptfoo eval --grader openai:gpt-4o-mini
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-4o-mini
   ```

3. Using assertion-level override:
   ```yaml
   assert:
     - type: context-recall
       threshold: 0.9
       value: 'Key facts to check'
       provider: openai:gpt-4o-mini
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

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
