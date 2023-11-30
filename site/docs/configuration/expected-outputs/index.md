---
sidebar_position: 5
sidebar_label: Overview
---

# Test assertions

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

| Property     | Type   | Required | Description                                                                                          |
| ------------ | ------ | -------- | ---------------------------------------------------------------------------------------------------- |
| type         | string | Yes      | Type of assertion                                                                                    |
| value        | string | No       | The expected value, if applicable                                                                    |
| threshold    | number | No       | The threshold value, only applicable for similarity                                                  |
| weight       | string | No       | How heavily to weigh the assertion. Defaults to 1.0                                                  |
| provider     | string | No       | Some assertions (similarity, llm-rubric, model-graded-\*) require an [LLM provider](/docs/providers) |
| rubricPrompt | string | No       | LLM rubric grading prompt                                                                            |

## Assertion types

Deterministic eval metrics

| Assertion Type                                                | Returns true if...                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| [equals](#equality)                                           | output matches exactly                                         |
| [contains](#contains)                                         | output contains substring                                      |
| [icontains](#contains)                                        | output contains substring, case insensitive                    |
| [regex](#regex)                                               | output matches regex                                           |
| [starts-with](#starts-with)                                   | output starts with string                                      |
| [contains-any](#contains-any)                                 | output contains any of the listed substrings                   |
| [contains-all](#contains-all)                                 | output contains all list of substrings                         |
| [icontains-any](#contains-any)                                | output contains any of the listed substrings, case insensitive |
| [icontains-all](#contains-all)                                | output contains all list of substrings, case insensitive       |
| [is-json](#is-json)                                           | output is valid json (optional json schema validation)         |
| [contains-json](#contains-json)                               | output contains valid json (optional json schema validation)   |
| [javascript](/docs/configuration/expected-outputs/javascript) | provided Javascript function validates the output              |
| [python](/docs/configuration/expected-outputs/python)         | provided Python function validates the output                  |
| [webhook](#webhook)                                           | provided webhook returns {pass: true}                          |
| rouge-n                                                       | Rouge-N score is above a given threshold                       |
| [levenshtein](#levenshtein-distance)                          | Levenshtein distance is below a threshold                      |

Model-assisted eval metrics

| Assertion Type                                                             | Method                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [similar](/docs/configuration/expected-outputs/similar)                    | embeddings and cosine similarity are above a threshold                          |
| [classifier](/docs/configuration/expected-outputs/classifier)              | Run LLM output through a classifier                                             |
| [llm-rubric](/docs/configuration/expected-outputs/model-graded)            | LLM output matches a given rubric, using a Language Model to grade output       |
| [factuality](/docs/configuration/expected-outputs/model-graded)            | LLM output adheres to the given facts, using Factuality method from OpenAI eval |
| [model-graded-closedqa](/docs/configuration/expected-outputs/model-graded) | LLM output adheres to given criteria, using Closed QA method from OpenAI eval   |
| [answer-relevance](/docs/configuration/expected-outputs/model-graded)      | Ensure that LLM output is related to original query                             |
| [context-recall](/docs/configuration/expected-outputs/model-graded)        | Ensure that ground truth appears in context                                     |
| [context-relevance](/docs/configuration/expected-outputs/model-graded)     | Ensure that context is relevant to original query                               |
| [context-faithfulness](/docs/configuration/expected-outputs/model-graded)  | Ensure that LLM output uses the context                                         |

:::tip
Every test type can be negated by prepending `not-`. For example, `not-equals` or `not-regex`.
:::

### Equality

The `equals` assertion checks if the LLM output is equal to the expected value.

Example:

```yaml
assert:
  - type: equals
    value: 'The expected output'
```

Here are the new additions to the "Assertion Types" section:

### Contains

The `contains` assertion checks if the LLM output contains the expected value.

Example:

```yaml
assert:
  - type: contains
    value: 'The expected substring'
```

The `icontains` is the same, except it ignores case:

```yaml
assert:
  - type: icontains
    value: 'The expected substring'
```

### Regex

The `regex` assertion checks if the LLM output matches the provided regular expression.

Example:

```yaml
assert:
  - type: regex
    value: "\\d{4}" # Matches a 4-digit number
```

### Starts-With

The `starts-with` assertion checks if the LLM output begins with the specified string.

This example checks if the output starts with "Yes":

```yaml
assert:
  - type: starts-with
    value: 'Yes'
```

### Contains-Any

The `contains-any` assertion checks if the LLM output contains at least one of the specified values.

Example:

```yaml
assert:
  - type: contains-any
    value:
      - 'Value 1'
      - 'Value 2'
      - 'Value 3'
```

For case insensitive matching, use `icontains-any`.

### Contains-All

The `contains-all` assertion checks if the LLM output contains all of the specified values.

Example:

```yaml
assert:
  - type: contains-all
    value:
      - 'Value 1'
      - 'Value 2'
      - 'Value 3'
```

For case insensitive matching, use `icontains-all`.

### Is-JSON

The `is-json` assertion checks if the LLM output is a valid JSON string.

Example:

```yaml
assert:
  - type: is-json
```

You may optionally set a `value` as a JSON schema. If set, the output will be validated against this schema:

```yaml
assert:
  - type: is-json
    value:
      required: [latitude, longitude]
      type: object
      properties:
        latitude:
          minimum: -90
          type: number
          maximum: 90
        longitude:
          minimum: -180
          type: number
          maximum: 180
```

JSON is valid YAML, so you can also just copy in any JSON schema directly:

```yaml
assert:
  - type: is-json
    value:
      {
        'required': ['latitude', 'longitude'],
        'type': 'object',
        'properties':
          {
            'latitude': { 'type': 'number', 'minimum': -90, 'maximum': 90 },
            'longitude': { 'type': 'number', 'minimum': -180, 'maximum': 180 },
          },
      }
```

If your JSON schema is large, import it from a file:

```yaml
assert:
  - type: is-json
    value: file://./path/to/schema.json
```

### Contains-JSON

The `contains-json` assertion checks if the LLM output contains a valid JSON structure.

Example:

```yaml
assert:
  - type: contains-json
```

Just like `is-json` above, you may optionally set a `value` as a JSON schema in order to validate the JSON contents.

### Javascript

See [Javascript assertions](/docs/configuration/expected-outputs/javascript).

### Python

See [Python assertions](/docs/configuration/expected-outputs/python).

### Webhook

The `webhook` assertion sends the LLM output to a specified webhook URL for custom validation. The webhook should return a JSON object with a `pass` property set to `true` or `false`.

Example:

```yaml
assert:
  - type: webhook
    value: 'https://example.com/webhook'
```

The webhook will receive a POST request with a JSON payload containing the LLM output and the context (test case variables). For example, if the LLM output is "Hello, World!" and the test case has a variable `example` set to "Example text", the payload will look like:

```json
{
  "output": "Hello, World!",
  "context": {
    "prompt": "Greet the user",
    "vars": {
      "example": "Example text"
    }
  }
}
```

The webhook should process the request and return a JSON response with a `pass` property set to `true` or `false`, indicating whether the LLM output meets the custom validation criteria. Optionally, the webhook can also provide a `reason` property to describe why the output passed or failed the assertion.

Example response:

```json
{
  "pass": true,
  "reason": "The output meets the custom validation criteria"
}
```

If the webhook returns a `pass` value of `true`, the assertion will be considered successful. If it returns `false`, the assertion will fail, and the provided `reason` will be used to describe the failure.

You may also return a score:

```json
{
  "pass": true,
  "score": 0.5,
  "reason": "The output meets the custom validation criteria"
}
```

### Similarity

See [Similarity assertions](/docs/configuration/expected-outputs/similar.

### Levenshtein distance

The `levenshtein` assertion checks if the LLM output is within a given edit distance from an expected value.

Example:

```yaml
assert:
  # Ensure Levenshtein distance from "hello world" is <= 5
  - type: levenshtein
    threshold: 5
    value: hello world
```

### Model-graded evals

See [Model-graded evals](/docs/configuration/expected-outputs/model-graded).

### Classifier

See [classifier](/docs/configuration/expected-outputs/classifier) grading documentation.

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

print(f'Received {output} with variables {context}')

return {
  'pass': True,
  'score': 0.5,
  'reason': 'Some custom reason',
}
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
- `similar` takes a threshold value. For example: `similar(0.8):hello world`
- `grade` indicates `llm-rubric`. For example: `grade: does not mention being an AI`
- By default, `__expected` will use type `equals`

When the `__expected` field is provided, the success and failure statistics in the evaluation summary will be based on whether the expected criteria are met.

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
