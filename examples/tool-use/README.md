# Tool Use Example

This example demonstrates how to use promptfoo to call functions using OpenAI and Anthropic's API.
Please see the documentation below on how to define functions for each type of provider.

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/tool-use)

The example uses:

- Claude 3.7 Sonnet for Anthropic
- GPT-4 for OpenAI
- Llama 3.3 for Groq

Note that the function and tool syntax differ slightly between providers.

## Quick Start

Run this example directly:

```sh
npx promptfoo@latest --example tool-use
```

## Manual Setup

The configuration for this example is specified in `promptfooconfig.yaml`. To run the example manually:

1. Set your API keys:

```sh
export OPENAI_API_KEY=your_key_here
export ANTHROPIC_API_KEY=your_key_here
```

2. Run the evaluation:

```sh
promptfoo eval
```

3. View the results:

```sh
promptfoo view
```
