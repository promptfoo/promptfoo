# python-provider

This example demonstrates how to create a custom Python provider for promptfoo that integrates with the OpenAI API.

You can run this example with:

```bash
npx promptfoo@latest init --example python-provider
```

## Overview

The Python provider allows you to use Python code as a provider in promptfoo evaluations. This is useful when you need to:

1. Call APIs from Python libraries
2. Implement custom logic before or after calling LLMs
3. Process responses in specific ways
4. Track token usage and other metrics

This example shows how to properly implement a Python provider that:

- Calls the OpenAI Chat Completions API
- Extracts and returns token usage information

## Files

- `provider.py` - The Python provider implementation that calls OpenAI's API
- `promptfooconfig.yaml` - Configuration for promptfoo evaluation

## Requirements

- Python with the OpenAI package installed (`pip install openai`)
- An OpenAI API key set as the `OPENAI_API_KEY` environment variable

## Implementation Details

The Python provider is defined in `provider.py` and includes:

1. A `call_api` function that makes API calls to OpenAI
2. Token usage extraction from the API response
3. Multiple sample functions showing different ways to call the API

## File Reference Configuration

The file reference example (`promptfooconfig.advanced-config.yaml`) demonstrates how to load configuration values from external files using the `file://` protocol. It shows three main file types:

1. **YAML file** (`settings.yaml`): Contains model settings like temperature and max tokens
2. **JavaScript file** (`formatting.js`): Provides formatting options through a function export
3. **Python file** (`params.py`): Supplies additional parameters through a Python function

The provider supports loading from:

- JSON files (`.json`)
- YAML files (`.yaml`, `.yml`)
- JavaScript files (`.js`, `.mjs`, `.ts`, `.cjs`)
- Python files (`.py`)
- Text files (`.txt`, `.md`)

Run the file reference example with:

```bash
npx promptfoo@latest evaluate -c examples/python-provider/promptfooconfig.advanced-config.yaml
```

## Learn More

For more information on creating custom providers, see the [promptfoo documentation](https://promptfoo.dev/docs/providers/python/).
