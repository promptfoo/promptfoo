# Image Analysis Example

This example compares an image analysis task using:

- gpt-4o via OpenAI
- claude-3 via Amazon Bedrock
- claude-3.7 via Anthropic

GPT-4o and Claude have different prompt formats. We use custom provider functions in Python and JavaScript to dynamically format the prompt based on context about the provider.

## Quick Start

Run this example directly:

```sh
npx promptfoo@latest --example claude-vs-gpt-image
```

## Manual Setup

To run the example manually, set your environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

If you do not have access to all of these providers, simply comment out the providers you do not have access to in `promptfooconfig.yaml`.

Then run:

```sh
npx promptfoo@latest eval
```

Afterwards, you can view the results by running:

```sh
npx promptfoo@latest view
```
