---
description: Ensure LLM outputs are faithful to the provided context in RAG applications to prevent hallucinations
---

# Context Faithfulness

The `context-faithfulness` assertion evaluates whether the LLM's output is faithful to the provided context, ensuring that the response doesn't include information or claims that aren't supported by the context. This is essential for RAG (Retrieval-Augmented Generation) applications to prevent hallucination.

## How to use it

To use the `context-faithfulness` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.9 # Score between 0 and 1
```

:::note
This assertion requires `query`, `context`, and the LLM's output to evaluate faithfulness.
:::

## How it works

The context faithfulness checker:

1. Extracts claims and statements from the LLM's output
2. Verifies each statement against the provided context
3. Calculates a faithfulness score based on the proportion of supported statements

A higher threshold requires the output to be more strictly supported by the context.

## Example Configuration

Here's a complete example showing how to use context faithfulness in a RAG system:

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    Answer this question: {{query}}
    Using this context: {{context}}
    Be specific and detailed in your response.
providers:
  - openai:gpt-4o
tests:
  - vars:
      query: 'What is our parental leave policy?'
      context: file://docs/policies/parental_leave.md
    assert:
      - type: context-faithfulness
        threshold: 0.9
      - type: context-recall
        threshold: 0.8
        value: 'Employees get 4 months paid leave'
```

## Overriding the Grader

Like other model-graded assertions, you can override the default grader:

1. Using the CLI:

   ```bash
   promptfoo eval --grader anthropic:messages:claude-3-7-sonnet-20250219
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

3. Using assertion-level override:
   ```yaml
   assert:
     - type: context-faithfulness
       threshold: 0.9
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

## Customizing the Prompt

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

## See Also

- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [Context-relevance](/docs/configuration/expected-outputs/model-graded/context-relevance) for evaluating context quality
- [Context-recall](/docs/configuration/expected-outputs/model-graded/context-recall) for ensuring ground truth is in the context
- [Factuality](/docs/configuration/expected-outputs/model-graded/factuality) for general factual consistency checking
- [Guide on RAG evaluation](/docs/guides/rag-evaluation)
- [Guide on hallucination prevention](/docs/guides/preventing-hallucinations)
