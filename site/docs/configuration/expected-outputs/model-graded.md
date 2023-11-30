---
sidebar_position: 100
---

# Model-graded evals

promptfoo supports several types of model-graded assertions:

Output-based:

- `llm-rubric` - checks if the LLM output matches given requirements, using a language model to grade the output based on the rubric.
- `model-graded-closedqa` - similar to the above, a "criteria-checking" eval that ensures the answer meets a specific requirement. Uses an OpenAI-authored prompt from their public evals.
- `factuality` - a factual consistency eval which, given a completion `A` and reference answer `B` evaluates whether A is a subset of B, A is a superset of B, A and B are equivalent, A and B disagree, or A and B differ, but difference don't matter from the perspective of factuality. Uses the prompt from OpenAI's public evals.
- `answer-relevance` - ensure that LLM output is related to original query
- `classifier` - see [classifier grading docs](/docs/configuration/expected-outputs/classifier).

RAG-based (requires `query` and/or `context` vars):

- `context-recall` - ensure that ground truth appears in context
- `context-relevance` - ensure that context is relevant to original query
- `context-faithfulness` - ensure that LLM output uses the context

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

Here's an example output that indicates PASS/FAIL based on LLM assessment ([see example setup and outputs](https://github.com/typpo/promptfoo/tree/main/examples/self-grading)):

[![LLM prompt quality evaluation with PASS/FAIL expectations](https://user-images.githubusercontent.com/310310/236690475-b05205e8-483e-4a6d-bb84-41c2b06a1247.png)](https://user-images.githubusercontent.com/310310/236690475-b05205e8-483e-4a6d-bb84-41c2b06a1247.png)

### Using variables in the rubric

You can use test `vars` in the LLM rubric. This example uses the `question` variable to help detect hallucinations:

```yaml
providers: [openai:gpt-3.5-turbo]
prompts: [prompt1.txt, prompt2.txt]
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
providers: [openai:gpt-4]
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

## Overriding the LLM grader

By default, model-graded asserts use GPT-4 for grading. If you do not have access to GPT-4 or prefer not to use it, you can override the rubric grader. There are several ways to do this, depending on your preferred workflow:

1. Using the `--grader` CLI option:

   ```
   promptfoo eval --grader openai:gpt-3.5-turbo
   ```

2. Using `test.options` or `defaultTest.options` on a per-test or testsuite basis:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-3.5-turbo
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
           provider: openai:gpt-3.5-turbo
   ```

Use the `provider.config` field to set custom parameters:

```yaml
provider:
  - id: openai:gpt-3.5-turbo
    config:
      temperature: 0
```

Also note that [custom providers](/docs/providers/custom-api) are supported as well.

## Overriding the rubric prompt

For the greatest control over the output of `llm-rubric`, you may set a custom prompt using the `rubricPrompt` property of `TestCase` or `Assertion`.

The rubric prompt has two built-in variables that you may use:

- `{{output}}` - The output of the LLM (you probably want to use this)
- `{{rubric}}` - The `value` of the llm-rubric `assert` object

In this example, we set `rubricPrompt` under `defaultTest`, which applies it to every test in this test suite:

```yaml
defaultTest:
  options:
    rubricPrompt:
      - role: system
        content: >-
          Grade the output by the following specifications, keeping track of the points scored:

          Did the output mention {{x}}? +1 point
          Did the output describe {{y}}? + 1 point
          Did the output ask to clarify {{z}}? +1 point

          Calculate the score but always pass the test. Output your response in the following JSON format:
          {pass: true, score: number, reason: string}
      - role: user
        content: 'Output: {{ output }}'
```

See the [full example](https://github.com/promptfoo/promptfoo/blob/main/examples/custom-grading-prompt/promptfooconfig.yaml).

## Classifers

Classifiers can be used to detect tone, bias, toxicity, helpfulness, and much more. See [classifier documentation](/docs/configuration/expected-outputs/classifier).

## Other assertion types

For more info on assertions, see [Test assertions](/docs/configuration/expected-outputs).
