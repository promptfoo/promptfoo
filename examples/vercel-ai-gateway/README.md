# vercel-ai-gateway (Vercel AI Gateway Example)

This example demonstrates how to use [Vercel AI Gateway](https://vercel.com/docs/ai-sdk/ai-gateway) to access multiple AI providers through a unified API.

## Prerequisites

1. A Vercel account with AI Gateway enabled
2. Your Vercel AI Gateway API key

## Setup

Set the required environment variable:

```bash
export VERCEL_AI_GATEWAY_API_KEY=your_api_key
```

## Running the Example

```bash
npx promptfoo@latest init --example vercel-ai-gateway
npx promptfoo eval
```

Or run directly:

```bash
npx promptfoo eval -c examples/vercel-ai-gateway/promptfooconfig.yaml
```

## What This Example Does

The configuration compares responses from three different providers, all accessed through Vercel AI Gateway:

- **OpenAI** (gpt-4o-mini)
- **Anthropic** (claude-haiku-4.5)
- **Google** (gemini-2.5-flash)

Each provider answers questions about technical topics, and the assertions verify that responses contain relevant keywords.

## Documentation

See the [Vercel AI Gateway provider documentation](https://www.promptfoo.dev/docs/providers/vercel) for more details.
