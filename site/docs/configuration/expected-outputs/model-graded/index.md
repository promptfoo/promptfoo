---
sidebar_position: 7
---

# Model-graded metrics

promptfoo supports several types of model-graded assertions that help evaluate LLM outputs and RAG system performance.

## Output-based Assertions

These assertions evaluate the quality and characteristics of LLM outputs:

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - checks if the LLM output matches given requirements using a language model to grade based on the rubric.
- [`model-graded-closedqa`](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa) - a "criteria-checking" eval that ensures the answer meets specific requirements. Uses an OpenAI-authored prompt from their public evals.
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - evaluates factual consistency between a completion and reference answer, determining if statements are subsets, supersets, equivalent, or conflicting.
- [`answer-relevance`](/docs/configuration/expected-outputs/model-graded/answer-relevance) - ensures that LLM output is related to the original query.
- [`classifier`](/docs/configuration/expected-outputs/classifier) - classifies outputs into categories. See [classifier grading docs](/docs/configuration/expected-outputs/classifier).
- [`moderation`](/docs/configuration/expected-outputs/moderation) - checks content safety and policy compliance. See [moderation grading docs](/docs/configuration/expected-outputs/moderation).
- [`select-best`](/docs/configuration/expected-outputs/model-graded/select-best) - compares outputs from multiple test cases and chooses a winner.

## RAG-based Assertions

These assertions evaluate RAG system performance and require `query` and/or `context` variables:

- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - ensures that ground truth appears in context
- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - ensures that context is relevant to original query
- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - ensures that LLM output uses the context

## Examples (output-based)

Example of `llm-rubric` and/or `model-graded-closedqa`:

```yaml
assert:
  - type: model-graded-closedqa # or llm-rubric
    value: Is not apologetic
```

Example of factuality check:

```yaml
assert:
  - type: factuality
    value: The capital of France is Paris
```

### Using variables in the rubric

You can use test `vars` in the LLM rubric:

```yaml
providers:
  - openai:gpt-4
prompts:
  - file://prompt1.txt
tests:
  - vars:
      question: What is quantum computing?
    assert:
      - type: llm-rubric
        value: Accurately answers {{question}} without technical jargon
```

## Examples (RAG-based)

RAG metrics require variables named `context` and `query`. Here's an example:

```yaml
prompts:
  - |
    Question: {{query}}
    Context: {{context}}
    Answer the question using only the provided context.
tests:
  - vars:
      query: What is our refund policy?
      context: |
        Refunds are processed within 30 days.
        All returns must include original packaging.
    assert:
      - type: context-faithfulness
        threshold: 0.9
      - type: context-relevance
        threshold: 0.8
```

## Customizing Providers

### Basic Provider Configuration

You can customize provider settings:

```yaml
provider:
  - id: openai:gpt-4
    config:
      temperature: 0
      max_tokens: 500
```

### Multiple Graders

Some assertions use multiple types of providers:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: azureopenai:chat:gpt-4-deployment
        config:
          apiHost: xxx.openai.azure.com
      embedding:
        id: azureopenai:embeddings:text-embedding-ada-002-deployment
        config:
          apiHost: xxx.openai.azure.com
```

### Available Variables

When customizing prompts, you can use these variables:

- `{{output}}` - The LLM output
- `{{rubric}}` - The assertion value
- For select-best: `{{outputs}}` and `{{criteria}}`

## Troubleshooting

Common issues:

- Missing required variables (check Requirements section of each metric)
- Incorrect provider configuration
- Threshold values out of range (should be between 0 and 1)

## Further Reading

- See [Test assertions](/docs/configuration/expected-outputs) for more information on assertions
- Check out the [classifier documentation](/docs/configuration/expected-outputs/classifier) for classification tasks
- Learn about [custom providers](/docs/providers/custom-api) for implementing your own graders
