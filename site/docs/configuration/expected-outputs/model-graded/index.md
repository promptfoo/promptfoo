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
    # Make sure the LLM output adheres to this criteria:
    value: Is not apologetic
```

Example of factuality check:

```yaml
assert:
  - type: factuality
    # Make sure the LLM output is consistent with this statement:
    value: Sacramento is the capital of California
```

For more information on factuality, see the [guide on LLM factuality](/docs/guides/factuality-eval).

### Using variables in the rubric

You can use test `vars` in the LLM rubric. This example uses the `question` variable to help detect hallucinations:

```yaml
providers:
  - openai:gpt-4
prompts:
  - file://prompt1.txt
  - file://prompt2.txt
defaultTest:
  assert:
    - type: llm-rubric
      value: 'Says that it is uncertain or unable to answer the question: "{{question}}"'
tests:
  - vars:
      question: What's the weather in New York?
  - vars:
      question: Who won the latest football match between the Giants and 49ers?
```

## Examples (RAG-based)

RAG metrics require variables named `context` and `query`. You must also set the `threshold` property on your test (all scores are normalized between 0 and 1).

Here's an example config of a RAG-based knowledge bot:

```yaml
prompts:
  - |
    You are an internal corporate chatbot.
    Respond to this query: {{query}}
    Here is some context that you can use to write your response: {{context}}
providers:
  - openai:gpt-4
tests:
  - vars:
      query: What is the max purchase that doesn't require approval?
      context: file://docs/reimbursement.md
    assert:
      - type: contains
        value: '$500'
      - type: factuality
        value: the employee's manager is responsible for approvals
      - type: answer-relevance
        threshold: 0.9
      - type: context-recall
        threshold: 0.9
        value: max purchase price without approval is $500. Talk to Fred before submitting anything.
      - type: context-relevance
        threshold: 0.9
      - type: context-faithfulness
        threshold: 0.9
```

## Examples (comparison)

The `select-best` assertion type compares multiple outputs and selects the one that best meets specified criteria:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'
  - 'Write a very concise, funny tweet about {{topic}}'

providers:
  - openai:gpt-4

tests:
  - vars:
      topic: bananas
    assert:
      - type: select-best
        value: choose the funniest tweet
```

## Overriding the LLM grader

By default, model-graded asserts use GPT-4. You can override the grader in several ways:

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
     - type: llm-rubric
       value: Is spoken like a pirate
       provider: openai:gpt-4
   ```

### Multiple graders

Some assertions use multiple types of providers. To override both embedding and text providers:

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

## Further Reading

- See [Test assertions](/docs/configuration/expected-outputs) for more information on assertions
- Check out the [classifier documentation](/docs/configuration/expected-outputs/classifier) for classification tasks
- Learn about [custom providers](/docs/providers/custom-api) for implementing your own graders
