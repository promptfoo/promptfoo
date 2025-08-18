---
sidebar_label: Context Faithfulness
description: 'Measure LLM faithfulness to source context by detecting hallucinations, fabrications, and unsupported claims in responses'
---

# Context faithfulness

The `context-faithfulness` assertion evaluates whether the AI's response is faithful to the provided context, checking for hallucinations or unsupported claims.

## Configuration

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.8 # Score from 0 to 1
```

:::note

This assertion requires `query`, context, and the LLM's output to evaluate faithfulness. See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.

:::

### How it works

The context faithfulness checker:

1. Analyzes the relationship between the provided context and the AI's response
2. Identifies claims in the response that are not supported by the context
3. Returns a score from 0 to 1, where 1 means the response is completely faithful to the context

### Example

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
      context: 'France is a country in Europe. Paris is the capital and largest city of France.'
    assert:
      - type: context-faithfulness
        threshold: 0.8
```

The assertion will pass if the AI's response about France's capital is faithful to the provided context and doesn't include unsupported information.

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

Context faithfulness uses two prompts: one for extracting claims and another for verifying them. You can customize both using the `rubricPrompt` property:

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

# Further reading

- See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
