# Google AI Studio Function Calling Example

This example demonstrates how to use function calling capabilities with Google AI Studio's Gemini models in promptfoo.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`

## Overview

Function calling allows Gemini models to request specific structured actions like API calls. In this example:

- The model responds to weather queries using a predefined function schema
- The system validates that models correctly produce function calls with proper parameters
- We use function calling with the Gemini 2.0 Flash model

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example google-aistudio-tools
```

Or run directly with:

```bash
promptfoo eval -c examples/google-aistudio-tools/promptfooconfig.yaml
```

## Example Files

- `promptfooconfig.yaml`: Main configuration file defining providers, prompts and tests
- `tools.json`: Function definitions for the weather function calling example

## Expected Outputs

The tests verify that:

1. The model returns a valid function call
2. The function name is correct (`get_current_weather`)
3. The location parameter matches the user's query

For more information, see the [Google AI Studio Function Calling documentation](https://ai.google.dev/docs/function_calling).
