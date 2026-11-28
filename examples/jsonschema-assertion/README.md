# jsonschema-assertion (JSON Schema Assertion)

Validate that an LLM returns structured JSON your code can consume, by checking
the output against a JSON Schema with the `is-json` assertion.

## Setup

```bash
npx promptfoo@latest init --example jsonschema-assertion
cd jsonschema-assertion
```

The example uses `openai:gpt-6-sol`, which needs an OpenAI API key. Put it in a
`.env` file inside the example directory and keep that file out of version
control:

```text
OPENAI_API_KEY=sk-...
```

## Run it

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
npx promptfoo@latest view
```

## What it does

The prompt asks for JSON only: a `sentiment` enum (`positive`, `negative`,
`neutral`) and up to three `keywords`. Each test passes a different customer
feedback string through `{{feedback}}`, then asserts the reply against the
schema defined once in `defaultTest.assert`.

## Key points

- The assertion type is `is-json`; its `value` is interpreted as a JSON Schema.
- `additionalProperties: false` rejects hallucinated fields, not just wrong types.
- Unlike exact-text checks, this keeps passing when the model picks different
  field values, as long as the structure still matches the schema.
- `is-json` parses the entire response, so it fails when the model adds prose
  around the JSON. If that can happen, use `contains-json`, which extracts JSON
  objects from the surrounding text.
