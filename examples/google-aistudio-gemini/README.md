# Google AI Studio (Gemini) Example

This example demonstrates various features of the Google AI Studio integration with Gemini models:

- Basic chat completion with temperature and token control
- Structured output with JSON schema validation
- Function calling with custom tools
- Different model variants:
  - Gemini 1.5 Pro (standard model)
  - Gemini 1.5 Flash (fast responses)
  - Gemini 2.0 Flash (experimental)
  - Gemini 2.0 Flash Thinking (with thought process, uses v1alpha API)

## Model Details

### Gemini 2.0 Flash Thinking

This experimental model automatically uses the `v1alpha` API endpoint for advanced features like thought process visibility. No additional configuration is needed - the provider handles this automatically.

## Usage

1. Set your Google AI Studio API key:

```bash
export GOOGLE_API_KEY=your_api_key_here
```

2. Run the example:

```bash
promptfoo eval
```

The example tests a math puzzle across different models, comparing their accuracy and output formats.

Afterwards, you can view the results by running `promptfoo view`
