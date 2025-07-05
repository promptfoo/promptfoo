---
sidebar_label: Context Faithfulness
---

# Context faithfulness

The `context-faithfulness` assertion evaluates whether the AI's response is faithful to the provided context, checking for hallucinations or unsupported claims.

## Configuration

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.8 # Score from 0 to 1
```

Note: This assertion requires `query`, `context`, and the LLM's output to evaluate faithfulness.

## Providing context

You can provide context in two ways:

### Using context variables

Include the context as a variable in your test case:

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
      context: 'France is a country in Europe. Paris is the capital and largest city of France.'
    assert:
      - type: context-faithfulness
        threshold: 0.8
```

### Extracting from provider responses

If your provider returns context within the response, use `contextTransform`:

```yaml
assert:
  - type: context-faithfulness
    contextTransform: 'output.context'
    threshold: 0.8
```

For complex response structures:

```yaml
assert:
  - type: context-faithfulness
    contextTransform: 'output.retrieved_docs.map(d => d.content).join("\n")'
    threshold: 0.8
```

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

### Troubleshooting

**Error: "contextTransform must return a string"**
Your expression returned `undefined` or `null`. Add a fallback:

```yaml
contextTransform: 'output.context || "No context found"'
```

**Error: "Context is required for context-based assertions"**
Your contextTransform returned an empty string. Check your provider response structure or add debugging:

```yaml
contextTransform: 'JSON.stringify(output, null, 2)' # Temporary: see full response
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

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
