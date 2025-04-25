# Google AI Studio Tools Example

This example demonstrates how to use tools with Google AI Studio's Gemini models in promptfoo.

The example shows both function calling and Google Search grounding, a feature that allows Gemini to retrieve up-to-date information from the web.

## Usage

Run the example:

```bash
promptfoo eval -c examples/google-aistudio-tools/promptfooconfig.yaml
```

## Example Files

- `promptfooconfig.yaml`: Main configuration file
- `tools.json`: Function definitions for function calling
- `search-tools.json`: Google Search configuration for grounding with search

For more information, see the [Google AI Studio documentation](https://ai.google.dev/docs).
