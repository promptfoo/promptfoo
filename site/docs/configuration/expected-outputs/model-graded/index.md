---
sidebar_position: 7
---

# Model-graded metrics

promptfoo supports several types of model-graded assertions:

Output-based:

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - checks if the LLM output matches given requirements, using a language model to grade the output based on the rubric.
- [`model-graded-closedqa`](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa) - similar to the above, a "criteria-checking" eval that ensures the answer meets a specific requirement. Uses an OpenAI-authored prompt from their public evals.
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - a factual consistency eval which, given a completion `A` and reference answer `B` evaluates whether A is a subset of B, A is a superset of B, A and B are equivalent, A and B disagree, or A and B differ, but that the difference doesn't matter from the perspective of factuality. It uses the prompt from OpenAI's public evals.
- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - uses chain-of-thought prompting to evaluate outputs based on custom criteria, following the G-Eval framework.
- [`answer-relevance`](/docs/configuration/expected-outputs/model-graded/answer-relevance) - ensure that LLM output is related to original query
- [`classifier`](/docs/configuration/expected-outputs/classifier) - see classifier grading docs.
- [`moderation`](/docs/configuration/expected-outputs/moderation) - see moderation grading docs.
- [`select-best`](/docs/configuration/expected-outputs/model-graded/select-best) - compare outputs from multiple test cases and choose a winner

RAG-based (requires `query` and/or `context` vars):

- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - ensure that ground truth appears in context
- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - ensure that context is relevant to original query
- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - ensure that LLM output uses the context

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

Here's an example output that indicates PASS/FAIL based on LLM assessment ([see example setup and outputs](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading)):

[![LLM prompt quality evaluation with PASS/FAIL expectations](https://user-images.githubusercontent.com/310310/236690475-b05205e8-483e-4a6d-bb84-41c2b06a1247.png)](https://user-images.githubusercontent.com/310310/236690475-b05205e8-483e-4a6d-bb84-41c2b06a1247.png)

### Using variables in the rubric

You can use test `vars` in the LLM rubric. This example uses the `question` variable to help detect hallucinations:

```yaml
providers:
  - openai:gpt-4o-mini
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

Here's an example config of a RAG-based knowledge bot that evaluates RAG context metrics:

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
  - vars:
      query: How many weeks is maternity leave?
      context: file://docs/maternity.md
    assert:
      - type: factuality
        value: maternity leave is 4 months
      - type: answer-relevance
        threshold: 0.9
      - type: context-recall
        threshold: 0.9
        value: The company offers 4 months of maternity leave, unless you are an elephant, in which case you get 22 months of maternity leave.
      - type: context-relevance
        threshold: 0.9
      - type: context-faithfulness
        threshold: 0.9
```

## Examples (comparison)

The `select-best` assertion type is used to compare multiple outputs in the same TestCase row and select the one that best meets a specified criterion.

Here's an example of how to use `select-best` in a configuration file:

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

  - vars:
      topic: nyc
    assert:
      - type: select-best
        value: choose the tweet that contains the most facts
```

## Overriding the LLM grader

By default, model-graded asserts use GPT-4 for grading. If you do not have access to GPT-4 or prefer not to use it, you can override the rubric grader. There are several ways to do this, depending on your preferred workflow:

1. Using the `--grader` CLI option:

   ```
   promptfoo eval --grader openai:gpt-4o-mini
   ```

2. Using `test.options` or `defaultTest.options` on a per-test or testsuite basis:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-4o-mini
   tests:
     - description: Use LLM to evaluate output
       assert:
         - type: llm-rubric
           value: Is spoken like a pirate
   ```

3. Using `assertion.provider` on a per-assertion basis:

   ```yaml
   tests:
     - description: Use LLM to evaluate output
       assert:
         - type: llm-rubric
           value: Is spoken like a pirate
           provider: openai:gpt-4o-mini
   ```

Use the `provider.config` field to set custom parameters:

```yaml
provider:
  - id: openai:gpt-4o-mini
    config:
      temperature: 0
```

Also note that [custom providers](/docs/providers/custom-api) are supported as well.

### Multiple graders

Some assertions (such as `answer-relevance`) use multiple types of providers. To override both the embedding and text providers separately, you can do something like this:

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

If you are implementing a custom provider, `text` providers require a `callApi` function that returns a [`ProviderResponse`](/docs/configuration/reference/#providerresponse), whereas embedding providers require a `callEmbeddingApi` function that returns a [`ProviderEmbeddingResponse`](/docs/configuration/reference/#providerembeddingresponse).

## Overriding the rubric prompt

For the greatest control over the output of `llm-rubric`, you may set a custom prompt using the `rubricPrompt` property of `TestCase` or `Assertion`.

The rubric prompt has two built-in variables that you may use:

- `{{output}}` - The output of the LLM (you probably want to use this)
- `{{rubric}}` - The `value` of the llm-rubric `assert` object

In this example, we set `rubricPrompt` under `defaultTest`, which applies it to every test in this test suite:

```yaml
defaultTest:
  options:
    rubricPrompt: >
      [
        {
          "role": "system",
          "content": "Grade the output by the following specifications, keeping track of the points scored:\n\nDid the output mention {{x}}? +1 point\nDid the output describe {{y}}? +1 point\nDid the output ask to clarify {{z}}? +1 point\n\nCalculate the score but always pass the test. Output your response in the following JSON format:\n{pass: true, score: number, reason: string}"
        },
        {
          "role": "user",
          "content": "Output: {{ output }}"
        }
      ]
```

See the [full example](https://github.com/promptfoo/promptfoo/blob/main/examples/custom-grading-prompt/promptfooconfig.yaml).

#### select-best rubric prompt

For control over the `select-best` rubric prompt, you may use the variables `{{outputs}}` (list of strings) and `{{criteria}}` (string). It expects the LLM output to contain the index of the winning output.

## Classifiers

Classifiers can be used to detect tone, bias, toxicity, helpfulness, and much more. See [classifier documentation](/docs/configuration/expected-outputs/classifier).

## Other assertion types

For more info on assertions, see [Test assertions](/docs/configuration/expected-outputs).
