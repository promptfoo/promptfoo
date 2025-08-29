# Vertex AI Response Schema Example

This example demonstrates how to use response schemas with Vertex AI provider, specifically the `file://` protocol for loading schema files.

## Files

- `schema.json` - JSON schema defining the expected response structure
- `promptfooconfig.yaml` - Configuration file with Vertex AI provider using responseSchema
- `README.md` - This documentation

## Issue Fixed

Previously, the Vertex AI provider didn't support the `responseSchema` configuration with `file://` protocol:

```yaml
# This didn't work before:
providers:
  - id: vertex:gemini-2.5-flash
    config:
      responseSchema: file://schema.json  # ❌ Ignored by Vertex provider

# You had to use this workaround:
providers:
  - id: vertex:gemini-2.5-flash
    config:
      generationConfig:
        response_schema: file://schema.json  # ✅ Worked but inconsistent
```

## Now Fixed

After the fix, both approaches work consistently:

```yaml
# Now works with consistent API:
providers:
  - id: vertex:gemini-2.5-flash
    config:
      responseSchema: file://schema.json  # ✅ Now works!

# This still works too:
providers:
  - id: vertex:gemini-2.5-flash
    config:
      generationConfig:
        response_schema: file://schema.json  # ✅ Still works
```

## Setup

1. Replace `your-project-id` in `promptfooconfig.yaml` with your actual Google Cloud project ID
2. Ensure you have Vertex AI credentials configured
3. Run the evaluation:

```bash
promptfoo eval
```

## Expected Behavior

The model should generate structured JSON responses matching the schema:

```json
{
  "tweet": "🍌 Bananas are nature's perfect snack! Packed with potassium and natural sweetness. #bananas #healthyeating"
}
```

The `transform: JSON.parse(output).tweet` will extract just the tweet content for assertion testing.

## Schema Features Supported

- ✅ JSON string schemas: `responseSchema: '{"type": "object", ...}'`
- ✅ File references: `responseSchema: file://schema.json`
- ✅ Variable substitution in schema content: `"description": "{{dynamicDescription}}"`
- ✅ Complex nested schemas
- ✅ Conflict detection with `generationConfig.response_schema`
- ✅ Error handling for invalid JSON or missing files