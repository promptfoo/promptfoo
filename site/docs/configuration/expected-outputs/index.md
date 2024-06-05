---
sidebar_position: 5
sidebar_label: Overview
---

# Assertions & metrics

Assertions are used to compare the LLM output against expected values or conditions. While assertions are not required to run an eval, they are a useful way to automate your analysis.

Different types of assertions can be used to validate the output in various ways, such as checking for equality, JSON structure, similarity, or custom functions.

In machine learning, "Accuracy" is a metric that measures the proportion of correct predictions made by a model out of the total number of predictions. With `promptfoo`, accuracy is defined as the proportion of prompts that produce the expected or desired output.

## Using assertions

To use assertions in your test cases, add an `assert` property to the test case with an array of assertion objects. Each assertion object should have a `type` property indicating the assertion type and any additional properties required for that assertion type.

Example:

```yaml
tests:
  - description: 'Test if output is equal to the expected value'
    vars:
      example: 'Hello, World!'
    assert:
      - type: equals
        value: 'Hello, World!'
```

## Assertion properties

| Property     | Type               | Required | Description                                                                                             |
| ------------ | ------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| type         | string             | Yes      | Type of assertion                                                                                       |
| value        | string             | No       | The expected value, if applicable                                                                       |
| threshold    | number             | No       | The threshold value, applicable only to certain types such as `similar`, `cost`, `javascript`, `python` |
| weight       | number             | No       | How heavily to weigh the assertion. Defaults to 1.0                                                     |
| provider     | string             | No       | Some assertions (similarity, llm-rubric, model-graded-\*) require an [LLM provider](/docs/providers)    |
| rubricPrompt | string \| string[] | No       | Model-graded LLM prompt                                                                                 |

## Grouping assertions via Assertion Sets

Assertions can be grouped together using an `assert-set`.

Example:

```yaml
tests:
  - description: 'Test that the output is cheap and fast'
    vars:
      example: 'Hello, World!'
    assert:
      - type: assert-set
        assert:
          - type: cost
            threshold: 0.001
          - type: latency
            threshold: 200
```

In the above example if all assertions of the `assert-set` pass the entire `assert-set` passes.

There are cases where you may only need a certain number of assertions to pass. Here you can use `threshold`.

Example - if one of two assertions need to pass or 50%:

```yaml
tests:
  - description: 'Test that the output is cheap or fast'
    vars:
      example: 'Hello, World!'
    assert:
      - type: assert-set
        threshold: 0.5
        assert:
          - type: cost
            threshold: 0.001
          - type: latency
            threshold: 200
```

## Assertion Set properties

| Property  | Type             | Required | Description                                                                                                          |
| --------- | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| type      | string           | Yes      | Must be assert-set                                                                                                   |
| assert    | array of asserts | Yes      | Assertions to be run for the set                                                                                     |
| threshold | number           | No       | Success threshold for the assert-set. Ex. 1 out of 4 equal weights assertions need to pass. Threshold should be 0.25 |
| weight    | number           | No       | How heavily to weigh the assertion set within test assertions. Defaults to 1.0                                       |
| metric    | string           | No       | Metric name for this assertion set within the test                                                                   |

## Assertion types

### Deterministic eval metrics

These metrics are programmatic tests that are run on LLM output. [See all details](/docs/configuration/expected-outputs/deterministic)

| Assertion Type                                                                                                     | Returns true if...                                               |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [contains-all](/docs/configuration/expected-outputs/deterministic/#contains-all)                                   | output contains all list of substrings                           |
| [contains-any](/docs/configuration/expected-outputs/deterministic/#contains-any)                                   | output contains any of the listed substrings                     |
| [contains-json](/docs/configuration/expected-outputs/deterministic/#contains-json)                                 | output contains valid json (optional json schema validation)     |
| [contains](/docs/configuration/expected-outputs/deterministic/#contains)                                           | output contains substring                                        |
| [cost](/docs/configuration/expected-outputs/deterministic/#cost)                                                   | Inference cost is below a threshold                              |
| [equals](/docs/configuration/expected-outputs/deterministic/#equality)                                             | output matches exactly                                           |
| [icontains-all](/docs/configuration/expected-outputs/deterministic/#contains-all)                                  | output contains all list of substrings, case insensitive         |
| [icontains-any](/docs/configuration/expected-outputs/deterministic/#contains-any)                                  | output contains any of the listed substrings, case insensitive   |
| [icontains](/docs/configuration/expected-outputs/deterministic/#contains)                                          | output contains substring, case insensitive                      |
| [is-json](/docs/configuration/expected-outputs/deterministic/#is-json)                                             | output is valid json (optional json schema validation)           |
| [is-valid-openai-function-call](/docs/configuration/expected-outputs/deterministic/#is-valid-openai-function-call) | Ensure that the function call matches the function's JSON schema |
| [is-valid-openai-tools-call](/docs/configuration/expected-outputs/deterministic/#is-valid-openai-tools-call)       | Ensure all tool calls match the tools JSON schema                |
| [javascript](/docs/configuration/expected-outputs/javascript)                                                      | provided Javascript function validates the output                |
| [latency](/docs/configuration/expected-outputs/deterministic/#latency)                                             | Latency is below a threshold (milliseconds)                      |
| [levenshtein](/docs/configuration/expected-outputs/deterministic/#levenshtein-distance)                            | Levenshtein distance is below a threshold                        |
| [perplexity](/docs/configuration/expected-outputs/deterministic/#perplexity)                                       | Perplexity is below a threshold                                  |
| [perplexity-score](/docs/configuration/expected-outputs/deterministic/#perplexity-score)                           | Normalized perplexity                                            |
| [python](/docs/configuration/expected-outputs/python)                                                              | provided Python function validates the output                    |
| [regex](/docs/configuration/expected-outputs/deterministic/#regex)                                                 | output matches regex                                             |
| [starts-with](/docs/configuration/expected-outputs/deterministic/#starts-with)                                     | output starts with string                                        |
| [webhook](/docs/configuration/expected-outputs/deterministic/#webhook)                                             | provided webhook returns \{pass: true\}                          |
| rouge-n                                                                                                            | Rouge-N score is above a given threshold                         |

:::tip
Every test type can be negated by prepending `not-`. For example, `not-equals` or `not-regex`.
:::

### Model-assisted eval metrics

These metrics are model-assisted, and rely on LLMs or other machine learning models.

See [Model-graded evals](/docs/configuration/expected-outputs/model-graded), [classification](/docs/configuration/expected-outputs/classifier), and [similarity](/docs/configuration/expected-outputs/similar) docs for more information.

| Assertion Type                                                                        | Method                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [similar](/docs/configuration/expected-outputs/similar)                               | Embeddings and cosine similarity are above a threshold                          |
| [classifier](/docs/configuration/expected-outputs/classifier)                         | Run LLM output through a classifier                                             |
| [llm-rubric](/docs/configuration/expected-outputs/model-graded)                       | LLM output matches a given rubric, using a Language Model to grade output       |
| [answer-relevance](/docs/configuration/expected-outputs/model-graded)                 | Ensure that LLM output is related to original query                             |
| [context-faithfulness](/docs/configuration/expected-outputs/model-graded)             | Ensure that LLM output uses the context                                         |
| [context-recall](/docs/configuration/expected-outputs/model-graded)                   | Ensure that ground truth appears in context                                     |
| [context-relevance](/docs/configuration/expected-outputs/model-graded)                | Ensure that context is relevant to original query                               |
| [factuality](/docs/configuration/expected-outputs/model-graded)                       | LLM output adheres to the given facts, using Factuality method from OpenAI eval |
| [model-graded-closedqa](/docs/configuration/expected-outputs/model-graded)            | LLM output adheres to given criteria, using Closed QA method from OpenAI eval   |
| [select-best](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded) | Compare multiple outputs for a test case and pick the best one                  |

## Weighted assertions

In some cases, you might want to assign different weights to your assertions depending on their importance. The `weight` property is a number that determines the relative importance of the assertion. The default weight is 1.

The final score of the test case is calculated as the weighted average of the scores of all assertions, where the weights are the `weight` values of the assertions.

Here's an example:

```yaml
tests:
  assert:
    - type: equals
      value: 'Hello world'
      weight: 2
    - type: contains
      value: 'world'
      weight: 1
```

In this example, the `equals` assertion is twice as important as the `contains` assertion.

If the LLM output is `Goodbye world`, the `equals` assertion fails but the `contains` assertion passes, and the final score is 0.33 (1/3).

### Setting a score requirement

Test cases support an optional `threshold` property. If set, the pass/fail status of a test case is determined by whether the combined weighted score of all assertions exceeds the threshold value.

For example:

```yaml
tests:
  threshold: 0.5
  assert:
    - type: equals
      value: 'Hello world'
      weight: 2
    - type: contains
      value: 'world'
      weight: 1
```

If the LLM outputs `Goodbye world`, the `equals` assertion fails but the `contains` assertion passes and the final score is 0.33. Because this is below the 0.5 threshold, the test case fails. If the threshold were lowered to 0.2, the test case would succeed.

## Load assertions from external file

#### Raw files

The `value` of an assertion can be loaded directly from a file using the `file://` syntax:

```yaml
- assert:
    - type: contains
      value: file://gettysburg_address.txt
```

#### Javascript

If the file ends in `.js`, the Javascript is executed:

```yaml title=promptfooconfig.yaml
- assert:
    - type: javascript
      value: file://path/to/assert.js
```

The type definition is:

```ts
type AssertionResponse = string | boolean | number | GradingResult;
type AssertFunction = (output: string, context: { vars: Record<string, string> }) => AssertResponse;
```

See [GradingResult definition](/docs/configuration/reference#gradingresult).

Here's an example `assert.js`:

```js
module.exports = (output, { vars }) => {
  console.log(`Received ${output} using variables ${JSON.stringify(vars)}`);
  return {
    pass: true,
    score: 0.5,
    reason: 'Some custom reason',
  };
};
```

You can also use Javascript files in non-`javascript`-type asserts. For example, using a Javascript file in a `contains` assertion will check that the output contains the string returned by Javascript.

#### Python

If the file ends in `.py`, the Python is executed:

```yaml title=promptfooconfig.yaml
- assert:
    - type: python
      value: file://path/to/assert.py
```

The assertion expects an output that is `bool`, `float`, or a JSON [GradingResult](/docs/configuration/reference#gradingresult).

For example:

```py
import sys
import json

output = sys.argv[1]
context = json.loads(sys.argv[2])

# Use `output` and `context['vars']` to determine result ...

print(json.dumps({
  'pass': False,
  'score': 0.5,
  'reason': 'Some custom reason',
}))
```

## Load assertions from CSV

The [Tests file](/docs/configuration/parameters#tests-file) is an optional format that lets you specify test cases outside of the main config file.

To add an assertion to a test case in a vars file, use the special `__expected` column.

Here's an example tests.csv:

| text               | \_\_expected                                         |
| ------------------ | ---------------------------------------------------- |
| Hello, world!      | Bonjour le monde                                     |
| Goodbye, everyone! | fn:output.includes('Au revoir');                     |
| I am a pineapple   | grade:doesn't reference any fruits besides pineapple |

All assertion types can be used in `__expected`. The column supports exactly one assertion.

- `is-json` and `contains-json` are supported directly, and do not require any value
- `fn` indicates `javascript` type. For example: `fn:output.includes('foo')`
- `python` indicates `python` type. For example: `python:file://custom_assertion.py`
- `similar` takes a threshold value. For example: `similar(0.8):hello world`
- `grade` indicates `llm-rubric`. For example: `grade: does not mention being an AI`
- By default, `__expected` will use type `equals`

When the `__expected` field is provided, the success and failure statistics in the evaluation summary will be based on whether the expected criteria are met.

To run multiple assertions, use column names `__expected1`, `__expected2`, `__expected3`, etc.

For more advanced test cases, we recommend using a testing framework like [Jest](/docs/integrations/jest) or [Mocha](/docs/integrations/mocha-chai) and using promptfoo [as a library](/docs/usage/node-package).

## Reusing assertions with templates

If you have a set of common assertions that you want to apply to multiple test cases, you can create assertion templates and reuse them across your configuration.

```yaml
// highlight-start
assertionTemplates:
  containsMentalHealth:
    type: javascript
    value: output.toLowerCase().includes('mental health')
// highlight-end

prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
tests:
  - vars:
      input: Tell me about the benefits of exercise.
    assert:
      // highlight-next-line
      - $ref: "#/assertionTemplates/containsMentalHealth"
  - vars:
      input: How can I improve my well-being?
    assert:
      // highlight-next-line
      - $ref: "#/assertionTemplates/containsMentalHealth"
```

In this example, the `containsMentalHealth` assertion template is defined at the top of the configuration file and then reused in two test cases. This approach helps maintain consistency and reduces duplication in your configuration.

## Defining named metrics

Each assertion supports a `metric` field that allows you to tag the result however you like. Use this feature to combine related assertions into aggregate metrics.

For example, these asserts will aggregate results into two metrics, `Tone` and `Consistency`.

```yaml
tests:
  - assert:
      - type: equals
        value: Yarr
        metric: Tone

  - assert:
      - type: icontains
        value: grub
        metric: Tone

  - assert:
      - type: is-json
        metric: Consistency

  - assert:
      - type: python
        value: max(0, len(output) - 300)
        metric: Consistency

      - type: similar
        value: Ahoy, world
        metric: Tone

  - assert:
      - type: llm-rubric
        value: Is spoken like a pirate
        metric: Tone
```

These metrics will be shown in the UI:

![llm eval metrics](/img/docs/named-metrics.png)

See [named metrics example](https://github.com/promptfoo/promptfoo/tree/main/examples/named-metrics).

## Creating derived metrics

Derived metrics, also known as composite or calculated metrics, are computed at runtime based on other metrics. They are aggregated and displayed as named metrics (see above).

Derived metrics are calculated after all individual test evaluations are completed. They can be defined using mathematical expressions or custom functions that aggregate or transform the named scores collected during the tests.

### Configuring derived metrics

To configure derived metrics in your test suite, you add a `derivedMetrics` array to the `TestSuite` object. Each entry in this array is an object that specifies the name of the metric and the formula or function used to calculate it.

#### Usage

Each derived metric has the following properties:

- **name**: The name of the metric. This is used as the identifier in the output results.
- **value**: The calculation method for the metric. This can be a string representing a mathematical expression or a function that takes the current scores and the evaluation context as arguments and returns a numeric value.

#### Example

Here's an example of how to define derived metrics in a test suite configuration:

```yaml
derivedMetrics:
  - name: 'EfficiencyAdjustedPerformance'
    value: '(PerformanceScore / InferenceTime) * EfficiencyFactor'
  # - ...
```

In this example, `EfficiencyAdjustedPerformance` is calculated using a simple mathematical expression that uses existing named scores.

:::info
Good to know:

- Derived metrics are calculated in the order they are provided. You can reference previous derived metrics.
- In order to reference a basic metric, you must name it (see named scores above).
- In order to be used in a mathematical expression, named scores must not have any spaces or special characters in them.
  :::

## Running assertions directly on outputs

If you already have LLM outputs and want to run assertions on them, the `eval` command supports standalone assertion files.

Put your outputs in a JSON string array, like this `output.json`:

```json
["Hello world", "Greetings, planet", "Salutations, Earth"]
```

And create a list of assertions (`asserts.yaml`):

```yaml
- type: icontains
  value: hello

- type: javascript
  value: 1 / (output.length + 1) # prefer shorter outputs

- type: model-graded-closedqa
  value: ensure that the output contains a greeting
```

Then run the eval command:

```sh
promptfoo eval --assertions asserts.yaml --model-outputs outputs.json
```

### Tagging outputs

Promptfoo accepts a slightly more complex JSON structure that includes an `output` field for the model's output and a `tags` field for the associated tags. These tags are shown in the web UI as a comma-separated list. It's useful if you want to keep track of certain output attributes:

```json
[
  { "output": "Hello world", "tags": ["foo", "bar"] },
  { "output": "Greetings, planet", "tags": ["baz", "abc"] },
  { "output": "Salutations, Earth", "tags": ["def", "ghi"] }
]
```

### Processing and formatting outputs

If you need to do any processing/formatting of outputs, use a [Javascript provider](/docs/providers/custom-api/), [Python provider](https://promptfoo.dev/docs/providers/python/), or [custom script](/docs/providers/custom-script/).
