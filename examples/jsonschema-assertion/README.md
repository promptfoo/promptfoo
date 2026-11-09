# JSON Schema Assertion Example

This example demonstrates how to use promptfoo's JSON Schema assertion to
validate that an LLM output conforms to a structured schema. JSON Schema is
widely supported and works well with function calling / tool use responses.

## What it does

We ask an LLM to extract structured information from free-form customer feedback
and assert that the response matches a schema describing `sentiment`
(`positive` | `negative` | `neutral`) and `keywords` (array of strings).

## Files

- `promptfooconfig.yaml` — the eval configuration
- `test.js` — a lightweight zero-dep sanity check that runs with plain Node

## Run it

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

## Key points

- The JSON Schema assertion lives under `assert` → `type: 'json-schema'`.
- The schema should be as strict as you can make it — this is what catches
  hallucinated fields and wrong types.
