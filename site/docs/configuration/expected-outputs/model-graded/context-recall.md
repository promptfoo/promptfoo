---
description: Evaluate whether key information from ground truth statements appears in the retrieved context for RAG applications
---

# Context Recall

The `context-recall` assertion evaluates whether key information from ground truth statements appears in the retrieved context. This is essential for RAG (Retrieval-Augmented Generation) applications to ensure that the context being fed to the model contains the necessary information to answer questions correctly.

## How to use it

To use the `context-recall` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: context-recall
    threshold: 0.8 # Score between 0 and 1
    value: 'The expected ground truth statement'
```

:::note
This assertion requires both the `context` variable and a ground truth statement to be set.
:::

## How it works

The context recall checker:

1. Takes a ground truth statement and the retrieved context
2. Breaks down the ground truth into individual facts
3. Verifies whether each fact is present in the context
4. Calculates a recall score based on how many facts are found

A higher threshold requires more complete recall of the ground truth facts.

## Example Configuration

Here's a complete example showing how to use context recall in a RAG system:

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    Answer this question: {{query}}
    Using this context: {{context}}
providers:
  - openai:gpt-4o
tests:
  - vars:
      query: 'What is our return policy?'
      context: file://docs/policies/returns.md
    assert:
      - type: context-recall
        threshold: 0.9
        value: 'Customers have 30 days to return unopened items for a full refund'
      - type: context-relevance
        threshold: 0.8
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
     - type: context-recall
       threshold: 0.8
       value: 'Our company was founded in 1998'
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

## Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Ground Truth: {{groundTruth}}
      Context: {{context}}

      Break down the ground truth into individual facts.
      For each fact, determine if it appears in the context.
      For each fact, answer YES if it appears, or NO if it does not.
```

## See Also

- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [Context-relevance](/docs/configuration/expected-outputs/model-graded/context-relevance) for evaluating context quality
- [Context-faithfulness](/docs/configuration/expected-outputs/model-graded/context-faithfulness) for checking output adherence to context
- [Guide on RAG evaluation](/docs/guides/rag-evaluation)
- [Guide on retrieval quality metrics](/docs/guides/retrieval-metrics)
