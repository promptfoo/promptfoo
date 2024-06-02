---
sidebar_label: Evaluating JSON outputs
---

# LLM evaluation techniques for JSON outputs

Getting an LLM to output valid JSON can be a difficult task. There are a few failure modes:

- **Hallucination**: OpenAI function calling and other nascent frameworks are notorious for hallucinating functions and arguments.
- **Invalid JSON**: Asking an LLM to produce JSON output is unreliable. Some inference engines such as [llama.cpp](https://github.com/ggerganov/llama.cpp/tree/master) support constrained output with GBNF grammars. OpenAI began supporting this in late 2023 with the [response format](https://platform.openai.com/docs/api-reference/chat/create#chat-create-response_format) parameter.
- **Schema non-conformance**: Getting the model to output JSON is only half the battle. The JSON may be malformed or incomplete.

This guide explains some eval techniques for testing your model's JSON quality output by ensuring that specific fields are present in the outputted object. It's useful for tweaking your prompt and model to ensure that it outputs valid JSON that conforms to your desired specification.

## Prerequisites

Before proceeding, ensure you have a basic understanding of how to set up test cases and assertions. Find more information in the [Getting Started](/docs/getting-started) guide and the [Expected Outputs](/docs/configuration/expected-outputs/index.md) documentation.

## Example Scenario

Let's say your language model outputs a JSON object like the following:

```json
{
  "color": "Yellow",
  "location": "Guatemala"
}
```

You want to create assertions that specifically target the values of `color` and `location`. Here's how you can do it.

## Ensuring that outputs are valid JSON

To ensure that your language model's output is valid JSON, you can use the `is-json` assertion type. This assertion will check that the output is a valid JSON string and optionally validate it against a JSON schema if provided.

Here's an example of how to use the `is-json` assertion without a schema:

```yaml
assert:
  - type: is-json
```

If you want to validate the structure of the JSON output, you can define a JSON schema. Here's an example of using the `is-json` assertion with a schema that requires `color` to be a string and `countries` to be a list of strings:

```yaml title=promptfooconfig.yaml
prompts:
  - "Output a JSON object that contains the keys `color` and `countries`, describing the following object: {{item}}"

tests:
  - vars:
      item: Banana
    assert:
      // highlight-start
      - type: is-json
        value:
          required: ["color", "countries"]
          type: object
          properties:
            color:
              type: string
            countries:
              type: array
              items:
                type: string
      // highlight-end
```

This will ensure that the output is valid JSON that contains the required fields with the correct data types.

## Ensuring the validity of specific JSON fields

To assert on specific fields of a JSON output, use the `javascript` assertion type. This allows you to write custom JavaScript code to perform logical checks on the JSON fields.

Here's an example configuration that demonstrates how to assert that `color` equals "Yellow" and `countries` contains "Ecuador":

```yaml
prompts:
  - "Output a JSON object that contains the keys `color` and `countries`, describing the following object: {{item}}"

tests:
  - vars:
      item: Banana
    assert:
      - type: is-json
        # ...

      // highlight-start
      # Parse the JSON and test the contents
      - type: javascript
        value: JSON.parse(output).color === 'yellow' && JSON.parse(output).countries.includes('Ecuador')
      // highlight-end
```

If you don't want to add `JSON.parse` to every assertion, you can add a transform under `test.options` that parses the JSON before the result is passed to the assertions:

```yaml
tests:
  - vars:
      item: Banana
    // highlight-start
    options:
      transform: JSON.parse(output)
    // highlight-end
    assert:
      - type: is-json
        # ...

      - type: javascript
        // highlight-start
        # `output` is now a parsed object
        value: output.color === 'yellow' && output.countries.includes('Ecuador')
        // highlight-end
```

### Extracting specific JSON fields for testing

For [model-graded assertions](/docs/configuration/expected-outputs/model-graded) such as similarity and rubric-based evaluations, preprocess the output to extract the desired field before running the check. The [`transform` directive](/docs/configuration/guide/#transforming-outputs) can be used for this purpose, and it applies to the entire test case.

Here's how you can use `transform` to assert the similarity of `location` to a given value:

```yaml
tests:
  - vars:
      item: banana
    // highlight-start
    options:
      transform: JSON.parse(output).countries
    // highlight-end
    assert:
      - type: contains-any
        value: [Guatemala, Costa Rica, India, Indonesia]
      - type: llm-rubric
        value: is someplace likely to find {{item}}
```

## Example

See the full example in [Github](https://github.com/promptfoo/promptfoo/tree/main/examples/json-output).

## Conclusion

By using JavaScript within your assertions, you can perform complex checks on JSON outputs, including targeting specific fields. The `transform` can be used to tailor the output for similarity checks.

promptfoo is free and open-source software. To install promptfoo and get started, see the [getting started guide](/docs/getting-started).

For more on different assertion types available, see [assertions documentation](/docs/configuration/expected-outputs). You might also be interested in [Evaluating RAG pipelines](/docs/guides/evaluate-rag) guide, which provides insights into evaluating retrieval-augmented generation applications.
