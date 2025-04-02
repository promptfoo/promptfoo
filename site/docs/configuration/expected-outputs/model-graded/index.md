---
sidebar_position: 7
description: Use LLM-based grading to evaluate your outputs with sophisticated metrics like factuality, coherence, and more
---

# Model-Graded Metrics

Promptfoo supports various model-graded metrics that use an LLM to evaluate your outputs. These metrics can assess nuanced aspects of LLM outputs that would be difficult to evaluate using simple text matching.

## Output-Based Metrics

These metrics evaluate the inherent quality of the LLM's responses:

- [**g-eval**](/docs/configuration/expected-outputs/model-graded/g-eval): General-purpose LLM evaluation that checks if an output meets specific criteria
- [**factuality**](/docs/configuration/expected-outputs/model-graded/factuality): Measures the factual accuracy of an LLM response
- [**llm-rubric**](/docs/configuration/expected-outputs/model-graded/llm-rubric): Evaluates outputs against a custom rubric you define
- [**model-graded-closedqa**](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa): Checks whether an output correctly answers a closed-ended question
- [**select-best**](/docs/configuration/expected-outputs/model-graded/select-best): Compares multiple outputs to determine which is best
- [**answer-relevance**](/docs/configuration/expected-outputs/model-graded/answer-relevance): Evaluates whether an output is relevant to the original query

## RAG-Based Metrics

These metrics specifically evaluate aspects of RAG (Retrieval-Augmented Generation) systems:

- [**context-relevance**](/docs/configuration/expected-outputs/model-graded/context-relevance): Evaluates whether the retrieved context is relevant to the query
- [**context-faithfulness**](/docs/configuration/expected-outputs/model-graded/context-faithfulness): Checks if the output is faithful to the provided context
- [**context-recall**](/docs/configuration/expected-outputs/model-graded/context-recall): Verifies that key information from ground truth appears in the context

## General Usage

Model-graded metrics can be used in your test configuration like this:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Tell me about {{topic}}'
providers:
  - openai:gpt-4o
tests:
  - vars:
      topic: quantum computing
    assert:
      - type: g-eval
        value: The response should include quantum mechanics principles
      - type: factuality
        threshold: 0.8
```

## Specifying a Grader

By default, model-graded metrics use a capable model as the grader (like Claude or GPT-4). You can override this in several ways:

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
     - type: factuality
       threshold: 0.8
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

## Azure OpenAI Service

To use Azure OpenAI Service as a grader, specify the endpoint and API key:

```yaml
defaultTest:
  options:
    provider:
      id: azure:gpt-4
      config:
        apiHost: https://your-resource.openai.azure.com
        apiKey: your-azure-api-key
        apiVersion: 2023-05-15
```

## Customizing Evaluation Prompts

You can customize the prompts used for evaluation with the `rubricPrompt` option:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Does this response: {{output}}
      Answer the question: {{prompt}}
      
      Your answer should be YES if it answers the question accurately,
      or NO if it doesn't.
```

## Related Resources

- [Guide on LLM evaluation](/docs/guides/llm-evaluation)
- [Guide on RAG evaluation](/docs/guides/rag-evaluation)
- [Guide on preventing hallucinations](/docs/guides/preventing-hallucinations)
- [Prompt benchmarking](/docs/benchmark)
