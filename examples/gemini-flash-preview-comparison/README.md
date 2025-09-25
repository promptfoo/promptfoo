# Gemini 2.5 Flash Preview Comparison

This example evaluates the new Gemini 2.5 Flash preview releases against the current generally available Flash models using the Google AI Studio provider.

## What it does

- Compares the baseline `gemini-2.5-flash` model with the September 2025 preview release
- Compares the baseline `gemini-2.5-flash-lite` model with its September 2025 preview counterpart
- Exercises the `gemini-flash-latest` and `gemini-flash-lite-latest` aliases that resolve to the new preview models
- Uses the same set of prompts for each model so you can quickly spot quality, latency, or cost trade-offs

## Prerequisites

1. Install dependencies as described in the [Promptfoo README](../../README.md)
2. Set a Gemini API key in your environment:

   ```bash
   export GEMINI_API_KEY="your_api_key"
   ```

## Run the eval

From this directory run:

```bash
promptfoo eval -c promptfooconfig.yaml
```

The eval compares all six providers defined in the config and writes the results to `.promptfoo/results/latest`. Open the HTML report to review model responses side-by-side.

## Customizing

- Adjust or add prompts in `promptfooconfig.yaml` to focus on your workloads
- Swap in the Vertex AI provider IDs (e.g. `vertex:gemini-2.5-flash-preview-09-2025`) if you want to run the comparison against Vertex instead of Google AI Studio
- Add `assert` blocks to track specific regression criteria across the preview and baseline models
