---
sidebar_label: Context Faithfulness
description: 'Measure LLM faithfulness to source context by detecting hallucinations, fabrications, and unsupported claims in responses'
---

# Context faithfulness

The `context-faithfulness` assertion prevents your LLM from making things up (hallucinating) by ensuring every claim in its response is supported by the provided context.

**What it measures**: Given the LLM's response and the context it was provided, it identifies all factual claims in the response and verifies each one is supported by the context. This catches when the LLM adds information that wasn't in the context.

**Example**:

- Context: "Paris is the capital of France."
- Good response (high score): "The capital of France is Paris."
- Poor response (low score): "Paris, with 2.2 million residents, is France's capital." (population not in context = hallucination)

This metric evaluates your **LLM's adherence to context**, not whether the context itself is good.

## Required fields

The context-faithfulness assertion requires:

- `query` - The user's question (must be defined in test vars)
- `context` - The reference information the LLM should use (defined via test vars or contextTransform)
- `threshold` (optional but recommended) - Minimum faithfulness score from 0 to 1 (defaults to 0)

## Configuration

### Basic usage

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.8 # Require 80% faithfulness to context
```

:::warning
The default threshold is 0, which means the assertion will pass even if the response is completely unfaithful to the context. Always set an appropriate threshold value for meaningful evaluation.
:::

### How it works

The context faithfulness checker:

1. Analyzes the relationship between the provided context and the AI's response
2. Identifies claims in the response that are not supported by the context
3. Returns a score from 0 to 1, where 1 means the response is completely faithful to the context

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Test context faithfulness to prevent hallucinations'

prompts:
  - 'Answer based on context: {{query}}\n\nContext: {{context}}'

providers:
  - id: openai:gpt-4o-mini

tests:
  - description: 'Test faithfulness with limited context'
    vars:
      query: 'What is the capital of France and what is its population?'
      context: 'France is a country in Europe. Paris is the capital and largest city of France.'
    assert:
      - type: context-faithfulness
        threshold: 0.8
```

The assertion will pass if the LLM's response only mentions Paris as the capital (faithful to context) and doesn't hallucinate population numbers (not in context).

### Using contextTransform for dynamic context

When your provider returns context as part of its response (common in RAG systems), use `contextTransform` to extract it:

```yaml
# Example when your RAG system returns context in the response
providers:
  - id: file://my-rag-provider.js # Custom provider that returns { answer, context }

tests:
  - vars:
      query: 'What are the company policies on remote work?'
    assert:
      - type: context-faithfulness
        # highlight-next-line
        contextTransform: 'output.context' # Extract context from provider's response
        threshold: 0.9 # High threshold for policy accuracy
```

### Complex contextTransform example

```yaml
# When context comes from multiple retrieved documents
assert:
  - type: context-faithfulness
    # highlight-next-line
    contextTransform: 'output.sources.map(s => s.text).join("\n\n")'
    threshold: 0.85
```

:::note
**Understanding context-faithfulness**: This assertion verifies that the LLM's response is grounded in the provided context. It does NOT check if the context is relevant (that's [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance)) or if the context contains the right information (that's [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall)).

You can provide context in two ways:

1. **Static context**: Define it directly in the `vars` section (useful for testing with predetermined context)
2. **Dynamic context**: Extract it from your RAG system's response using `contextTransform` (useful for evaluating real retrieval systems)
   :::

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

## How it works

The context faithfulness checker:

1. Extracts factual claims from the LLM's response
2. Verifies each claim against the provided context
3. Returns a score from 0 to 1:
   - **1.0**: All claims in the response are supported by context
   - **0.5**: Half the claims are supported
   - **0.0**: No claims are supported (complete hallucination)

This helps identify when your LLM generates information not present in the context.

## Related assertions

- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - Checks if the context is relevant to the query
- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - Verifies context contains expected information

## Further reading

- Learn more about [defining context in test cases](/docs/configuration/expected-outputs/model-graded#defining-context) including static and dynamic approaches
- Explore all [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for comprehensive evaluation options
- See the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for a complete walkthrough of evaluating retrieval-augmented generation systems
