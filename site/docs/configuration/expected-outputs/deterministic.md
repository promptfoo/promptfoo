---
sidebar_position: 6
---

# Deterministic metrics

These metrics are created by logical tests that are run on LLM output.

| Assertion Type                                                  | Returns true if...                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| [contains](#contains)                                           | output contains substring                                        |
| [contains-all](#contains-all)                                   | output contains all list of substrings                           |
| [contains-any](#contains-any)                                   | output contains any of the listed substrings                     |
| [contains-json](#contains-json)                                 | output contains valid json (optional json schema validation)     |
| [cost](#cost)                                                   | Inference cost is below a threshold                              |
| [equals](#equality)                                             | output matches exactly                                           |
| [icontains](#contains)                                          | output contains substring, case insensitive                      |
| [icontains-all](#contains-all)                                  | output contains all list of substrings, case insensitive         |
| [icontains-any](#contains-any)                                  | output contains any of the listed substrings, case insensitive   |
| [is-json](#is-json)                                             | output is valid json (optional json schema validation)           |
| [is-valid-openai-function-call](#is-valid-openai-function-call) | Ensure that the function call matches the function's JSON schema |
| [is-valid-openai-tools-call](#is-valid-openai-tools-call)       | Ensure all tool calls match the tools JSON schema                |
| [javascript](/docs/configuration/expected-outputs/javascript)   | provided Javascript function validates the output                |
| [latency](#latency)                                             | Latency is below a threshold (milliseconds)                      |
| [levenshtein](#levenshtein-distance)                            | Levenshtein distance is below a threshold                        |
| [perplexity-score](#perplexity-score)                           | Normalized perplexity                                            |
| [perplexity](#perplexity)                                       | Perplexity is below a threshold                                  |
| [python](/docs/configuration/expected-outputs/python)           | provided Python function validates the output                    |
| [regex](#regex)                                                 | output matches regex                                             |
| rouge-n                                                         | Rouge-N score is above a given threshold                         |
| [starts-with](#starts-with)                                     | output starts with string                                        |
| [webhook](#webhook)                                             | provided webhook returns \{pass: true\}                          |

:::tip
Every test type can be negated by prepending `not-`. For example, `not-equals` or `not-regex`.
:::

## Assertion types

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

For case insensitive matching, use `icontains-all`.

### Regex

The `regex` assertion checks if the LLM output matches the provided regular expression.

Example:

```yaml
assert:
  - type: regex
    value: "\\d{4}" # Matches a 4-digit number
```

### Contains-JSON

The `contains-json` assertion checks if the LLM output contains a valid JSON structure.

Example:

```yaml
assert:
  - type: contains-json
```

You may optionally set a `value` as a JSON schema in order to validate the JSON contents:

```yaml
assert:
  - type: contains-json
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
  - type: contains-json
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
  - type: contains-json
    value: file://./path/to/schema.json
```

See also: [`is-json`](#is-json)

### Cost

The `cost` assertion checks if the cost of the LLM call is below a specified threshold.

This requires LLM providers to return cost information. Currently this is only supported by OpenAI GPT models and custom providers.

Example:

```yaml
providers:
  - openai:gpt-3.5-turbo
  - openai:gpt-4
assert:
  # Pass if the LLM call costs less than $0.001
  - type: cost
    threshold: 0.001
```

### Equality

The `equals` assertion checks if the LLM output is equal to the expected value.

Example:

```yaml
assert:
  - type: equals
    value: 'The expected output'
```

You can also check whether it matches the expected JSON format.

```yaml
assert:
  - type: equals
    value: { 'key': 'value' }
```

If your expected JSON is large, import it from a file:

```yaml
assert:
  - type: equals
    value: 'file://path/to/expected.json'
```

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

### is-valid-openai-function-call

This ensures that any JSON LLM output adheres to the schema specified in the `functions` configuration of the provider. Learn more about the [OpenAI provider](/docs/providers/openai/#using-tools-and-functions).

### is-valid-openai-tools-call

This ensures that any JSON LLM output adheres to the schema specified in the `tools` configuration of the provider. Learn more about the [OpenAI provider](/docs/providers/openai/#using-tools-and-functions).

### Javascript

See [Javascript assertions](/docs/configuration/expected-outputs/javascript).

### Latency

The `latency` assertion passes if the LLM call takes longer than the specified threshold. Duration is specified in milliseconds.

Example:

```yaml
assert:
  # Fail if the LLM call takes longer than 5 seconds
  - type: latency
    threshold: 5000
```

Note that `latency` requires that the [cache is disabled](/docs/configuration/caching) with `promptfoo eval --no-cache` or an equivalent option.

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

### Perplexity

Perplexity is a measurement used in natural language processing to quantify how well a language model predicts a sample of text. It's essentially a measure of the model's uncertainty.

**High perplexity** suggests it is less certain about its predictions, often because the text is very diverse or the model is not well-tuned to the task at hand.

**Low perplexity** means the model predicts the text with greater confidence, implying it's better at understanding and generating text similar to its training data.

To specify a perplexity threshold, use the `perplexity` assertion type:

```yaml
assert:
  # Fail if the LLM is below perplexity threshold
  - type: perplexity
    threshold: 1.5
```

:::warning
Perplexity requires the LLM API to output `logprobs`. Currently only more recent versions of OpenAI GPT and Azure OpenAI GPT APIs support this.
:::

#### Comparing different outputs from the same LLM

You can compare perplexity scores across different outputs from the same model to get a sense of which output the model finds more likely (or less surprising). This is a good way to tune your prompts and hyperparameters (like temperature) to be more accurate.

#### Comparing outputs from different LLMs

Comparing scores across models may not be meaningful, unless the models have been trained on similar datasets, the tokenization process is consistent between models, and the vocabulary of the models is roughly the same.

#### perplexity-score

`perplexity-score` is a supported metric similar to `perplexity`, except it is normalized between 0 and 1 and inverted, meaning larger numbers are better.

This makes it easier to include in an aggregate promptfoo score, as higher scores are usually better. In this example, we compare perplexity across multiple GPTs:

```yaml
providers: [gpt-4-1106-preview, gpt-3.5-turbo-1106]
tests:
  - assert:
      - type: perplexity-score
        threshold: 0.5 # optional
  # ...
```

### Python

See [Python assertions](/docs/configuration/expected-outputs/python).

### Starts-With

The `starts-with` assertion checks if the LLM output begins with the specified string.

This example checks if the output starts with "Yes":

```yaml
assert:
  - type: starts-with
    value: 'Yes'
```

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
