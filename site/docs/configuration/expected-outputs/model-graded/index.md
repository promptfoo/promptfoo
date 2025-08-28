---
sidebar_position: 7
description: 'Comprehensive overview of model-graded evaluation techniques leveraging AI models to assess quality, safety, and accuracy'
---

# Model-graded metrics

Promptfoo supports several types of model-graded assertions:

## Output-based

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - Promptfoo's general-purpose grader; uses an LLM to evaluate outputs against custom criteria or rubrics.
- [`model-graded-closedqa`](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa) - Checks if LLM answers meet specific requirements using OpenAI's public evals prompts.
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - Evaluates factual consistency between LLM output and a reference statement. Uses OpenAI's public evals prompt to determine if the output is factually consistent with the reference.
- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - Uses chain-of-thought prompting to evaluate outputs against custom criteria following the G-Eval framework.
- [`answer-relevance`](/docs/configuration/expected-outputs/model-graded/answer-relevance) - Evaluates whether LLM output is directly related to the original query.
- [`similar`](/docs/configuration/expected-outputs/similar) - Checks semantic similarity between output and expected value using embedding models.
- [`pi`](/docs/configuration/expected-outputs/model-graded/pi) - Alternative scoring approach using a dedicated evaluation model to score inputs/outputs against criteria.
- [`classifier`](/docs/configuration/expected-outputs/classifier) - Runs LLM output through HuggingFace text classifiers for detection of tone, bias, toxicity, and other properties. See [classifier grading docs](/docs/configuration/expected-outputs/classifier).
- [`moderation`](/docs/configuration/expected-outputs/moderation) - Uses OpenAI's moderation API to ensure LLM outputs are safe and comply with usage policies. See [moderation grading docs](/docs/configuration/expected-outputs/moderation).
- [`select-best`](/docs/configuration/expected-outputs/model-graded/select-best) - Compares multiple outputs from different prompts/providers and selects the best one based on custom criteria.
- [`max-score`](/docs/configuration/expected-outputs/model-graded/max-score) - Selects the output with the highest aggregate score based on other assertion results.

## Context-based

- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - Evaluates whether retrieved context contains the information needed to answer a given question or support a ground truth fact.
- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - Evaluates whether retrieved context is relevant and useful for answering the original query.
- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - Evaluates whether the LLM output is factually supported by and consistent with the provided context.

## Conversational

- [`conversation-relevance`](/docs/configuration/expected-outputs/model-graded/conversation-relevance) - Evaluates whether responses remain relevant and contextually appropriate throughout multi-turn conversations.

Context-based assertions are particularly useful for evaluating RAG systems. For complete RAG evaluation examples, see the [RAG Evaluation Guide](/docs/guides/evaluate-rag).

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

Example of pi scorer:

```yaml
assert:
  - type: pi
    # Evaluate output based on this criteria:
    value: Is not apologetic and provides a clear, concise answer
    threshold: 0.8 # Requires a score of 0.8 or higher to pass
```

For more information on factuality, see the [guide on LLM factuality](/docs/guides/factuality-eval).

Here's an example output that indicates PASS/FAIL based on LLM assessment ([see example setup and outputs](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading)):

[![LLM prompt quality evaluation with PASS/FAIL expectations](https://user-images.githubusercontent.com/310310/236690475-b05205e8-483e-4a6d-bb84-41c2b06a1247.png)](https://user-images.githubusercontent.com/310310/236690475-b05205e8-483e-4a6d-bb84-41c2b06a1247.png)

### Using variables in the rubric

You can use test `vars` in the LLM rubric. This example uses the `question` variable to help detect hallucinations:

```yaml
providers:
  - openai:gpt-4.1-mini
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

The `max-score` assertion type is used to objectively select the output with the highest score from other assertions:

```yaml
prompts:
  - 'Write a summary of {{article}}'
  - 'Write a detailed summary of {{article}}'
  - 'Write a comprehensive summary of {{article}} with key points'

providers:
  - openai:gpt-4

tests:
  - vars:
      article: 'AI safety research is accelerating...'
    assert:
      - type: contains
        value: 'AI safety'
      - type: contains
        value: 'research'
      - type: llm-rubric
        value: 'Summary captures the main points accurately'
      - type: max-score
        value:
          method: average # Use average of all assertion scores
          threshold: 0.7 # Require at least 70% score to pass
```

## Overriding the LLM grader

By default, model-graded asserts use `gpt-4.1-2025-04-14` for grading. If you do not have access to `gpt-4.1-2025-04-14` or prefer not to use it, you can override the rubric grader. There are several ways to do this, depending on your preferred workflow:

1. Using the `--grader` CLI option:

   ```bash
   promptfoo eval --grader openai:gpt-4.1-mini
   ```

2. Using `test.options` or `defaultTest.options` on a per-test or testsuite basis:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-4.1-mini
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
           provider: openai:gpt-4.1-mini
   ```

Use the `provider.config` field to set custom parameters:

```yaml
provider:
  - id: openai:gpt-4.1-mini
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

:::tip Object handling in variables

When `{{output}}` or `{{rubric}}` contain objects, they are automatically converted to JSON strings by default to prevent display issues. To access object properties directly (e.g., `{{output.text}}`), enable object property access:

```bash
export PROMPTFOO_DISABLE_OBJECT_STRINGIFY=true
promptfoo eval
```

For details, see the [object template handling guide](/docs/usage/troubleshooting#object-template-handling).

:::

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

### Image-based rubric prompts

`llm-rubric` can also grade responses that reference images. Provide a `rubricPrompt` in OpenAI chat format that includes an image and use a vision-capable provider such as `openai:gpt-4.1`.

```yaml
defaultTest:
  options:
    provider: openai:gpt-4.1
    rubricPrompt: |
      [
        { "role": "system", "content": "Evaluate if the answer matches the image. Respond with JSON {reason:string, pass:boolean, score:number}" },
        {
          "role": "user",
          "content": [
            { "type": "image_url", "image_url": { "url": "{{image_url}}" } },
            { "type": "text", "text": "Output: {{ output }}\nRubric: {{ rubric }}" }
          ]
        }
      ]
```

#### select-best rubric prompt

For control over the `select-best` rubric prompt, you may use the variables `{{outputs}}` (list of strings) and `{{criteria}}` (string). It expects the LLM output to contain the index of the winning output.

## Classifiers

Classifiers can be used to detect tone, bias, toxicity, helpfulness, and much more. See [classifier documentation](/docs/configuration/expected-outputs/classifier).

---

## Defining context for context-based assertions

Context can be defined in one of two ways: statically using test case variables or dynamically from the provider's response.

### Statically via test variables

Set `context` as a variable in your test case:

```yaml
tests:
  - vars:
      context: 'Paris is the capital of France. It has a population of over 2 million people.'
    assert:
      - type: context-recall
        value: 'Paris is the capital of France'
        threshold: 0.8
```

### Dynamically via Context Transform

Defining `contextTransform` allows you to construct context from provider responses. This is particularly useful for RAG systems.

```yaml
assert:
  - type: context-faithfulness
    contextTransform: 'output.citations.join("\n")'
    threshold: 0.8
```

The `contextTransform` property accepts a stringified Javascript expression which itself accepts two arguments: `output` and `context`, and **must return a non-empty string.**

```typescript
/**
 * The context transform function signature.
 */
type ContextTransform = (output: Output, context: Context) => string;

/**
 * The provider's response output.
 */
type Output = string | object;

/**
 * Metadata about the test case, prompt, and provider response.
 */
type Context = {
  // Test case variables
  vars: Record<string, string | object>;

  // Raw prompt sent to LLM
  prompt: {
    label: string;
  };

  // Provider-specific metadata.
  // The documentation for each provider will describe any available metadata.
  metadata?: object;
};
```

For example, given the following provider response:

```typescript
/**
 * A response from a fictional Research Knowledge Base.
 */
type ProviderResponse = {
  output: {
    content: string;
  };
  metadata: {
    retrieved_docs: {
      content: string;
    }[];
  };
};
```

```yaml
assert:
  - type: context-faithfulness
    contextTransform: 'output.content'
    threshold: 0.8

  - type: context-relevance
    # Note: `ProviderResponse['metadata']` is accessible as `context.metadata`
    contextTransform: 'context.metadata.retrieved_docs.map(d => d.content).join("\n")'
    threshold: 0.7
```

If your expression should return `undefined` or `null`, for example because no context is available, add a fallback:

```yaml
contextTransform: 'output.context ?? "No context found"'
```

If you expected your context to be non-empty, but it's empty, you can debug your provider response by returning a stringified version of the response:

```yaml
contextTransform: 'JSON.stringify(output, null, 2)'
```

### Examples

Context-based metrics require a `query` and context. You must also set the `threshold` property on your test (all scores are normalized between 0 and 1).

Here's an example config using statically-defined (`test.vars.context`) context:

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

Alternatively, if your system returns context in the response, like in a RAG system, you can use `contextTransform`:

```yaml
prompts:
  - |
    You are an internal corporate chatbot.
    Respond to this query: {{query}}
providers:
  - openai:gpt-4
tests:
  - vars:
      query: What is the max purchase that doesn't require approval?
    assert:
      - type: context-recall
        contextTransform: 'output.context'
        threshold: 0.9
        value: max purchase price without approval is $500
      - type: context-relevance
        contextTransform: 'output.context'
        threshold: 0.9
      - type: context-faithfulness
        contextTransform: 'output.context'
        threshold: 0.9
```

## Transforming outputs for context assertions

### Transform: Extract answer before context grading

```yaml
providers:
  - echo

tests:
  - vars:
      prompt: '{"answer": "Paris is the capital of France", "confidence": 0.95}'
      context: 'France is a country in Europe. Paris is the capital of France. Paris has over 2 million residents.'
      query: 'What is the capital of France?'
    assert:
      - type: context-faithfulness
        transform: 'JSON.parse(output).answer' # Grade only the answer field
        threshold: 0.9

      - type: context-recall
        transform: 'JSON.parse(output).answer' # Check if answer appears in context
        value: 'Paris is the capital of France'
        threshold: 0.1
```

### Context transform: Extract context from provider response

```yaml
providers:
  - echo

tests:
  - vars:
      prompt: '{"answer": "Returns accepted within 30 days", "sources": ["Returns are accepted for 30 days from purchase", "30-day money-back guarantee"]}'
      query: 'What is the return policy?'
    assert:
      - type: context-faithfulness
        transform: 'JSON.parse(output).answer'
        contextTransform: 'JSON.parse(context.vars.prompt).sources.join(". ")' # Extract sources as context
        threshold: 0.9

      - type: context-relevance
        contextTransform: 'JSON.parse(context.vars.prompt).sources.join(". ")' # Check if context is relevant to query
        threshold: 0.8
```

### Transform response: Normalize RAG system output

```yaml
providers:
  - id: http://rag-api.example.com/search
    config:
      transformResponse: 'json.data' # Extract data field from API response

tests:
  - vars:
      query: 'What are the office hours?'
    assert:
      - type: context-faithfulness
        transform: 'output.answer' # After transformResponse, extract answer
        contextTransform: 'output.documents.map(d => d.text).join(" ")' # Extract documents as context
        threshold: 0.85
```

## Other assertion types

For more info on assertions, see [Test assertions](/docs/configuration/expected-outputs).
