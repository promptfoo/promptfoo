---
description: Evaluate whether the retrieved context in RAG applications is relevant to the original query
---

# Context Relevance

The `context-relevance` assertion evaluates whether the retrieved context is relevant to the original query. This is crucial for RAG (Retrieval-Augmented Generation) applications to ensure that the retrieved information is actually useful for answering the question.

## How to use it

To use the `context-relevance` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: context-relevance
    threshold: 0.8 # Score between 0 and 1
```

:::note
This assertion requires both `query` and `context` variables to be set in your test.
:::

## How it works

The context relevance checker:

1. Analyzes the query and context
2. Breaks down the context into individual statements
3. Evaluates each statement's relevance to the query
4. Calculates a relevance score based on the proportion of relevant statements

A higher threshold requires the context to be more closely related to the query.

## Example Configuration

Here's a complete example showing how to use context relevance in a RAG system:

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    Answer this question: {{query}}
    Using this context: {{context}}
providers:
  - openai:gpt-4o
tests:
  - vars:
      query: 'What are our company holidays?'
      context: file://docs/policies/holidays.md
    assert:
      - type: context-relevance
        threshold: 0.8
  - vars:
      query: 'What is the dress code?'
      context: file://docs/policies/attire.md
    assert:
      - type: context-relevance
        threshold: 0.9
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
     - type: context-relevance
       threshold: 0.8
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

## Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Context: {{context}}
      Query: {{query}}

      Break down the context into individual statements.
      For each statement, mark it as [RELEVANT] if it helps answer the query,
      or [NOT RELEVANT] if it does not.
```

## See Also

- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [Answer-relevance](/docs/configuration/expected-outputs/model-graded/answer-relevance) for evaluating output relevance to queries
- [Context-faithfulness](/docs/configuration/expected-outputs/model-graded/context-faithfulness) for checking output adherence to context
- [Context-recall](/docs/configuration/expected-outputs/model-graded/context-recall) for ensuring ground truth is in the context
- [Guide on RAG evaluation](/docs/guides/rag-evaluation)
