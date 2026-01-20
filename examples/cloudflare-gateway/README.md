# Cloudflare AI Gateway Example

This example demonstrates how to route AI requests through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) for caching, rate limiting, and analytics.

## Prerequisites

1. A Cloudflare account with AI Gateway enabled
2. An AI Gateway created in your Cloudflare dashboard
3. API keys for the providers you want to use (OpenAI, Anthropic, Groq, etc.)

## Setup

Set the required environment variables:

```bash
export CLOUDFLARE_ACCOUNT_ID=your_account_id
export CLOUDFLARE_GATEWAY_ID=your_gateway_id
export OPENAI_API_KEY=your_openai_key
export ANTHROPIC_API_KEY=your_anthropic_key
export GROQ_API_KEY=your_groq_key
```

## Running the Example

```bash
npx promptfoo eval -c examples/cloudflare-gateway/promptfooconfig.yaml
```

## What This Example Does

The configuration compares responses from three different providers, all routed through Cloudflare AI Gateway:

- **OpenAI** (gpt-4o-mini)
- **Anthropic** (claude-3-5-haiku-latest)
- **Groq** (llama-3.1-8b-instant)

Each provider answers questions about technical topics, and the assertions verify that responses contain relevant keywords.

## Benefits of Using AI Gateway

- **Caching**: Identical requests are cached, reducing costs during development
- **Analytics**: View usage across all providers in your Cloudflare dashboard
- **Rate Limiting**: Protect against quota issues with request queuing
- **Logging**: All requests and responses are logged for debugging

## Documentation

See the [Cloudflare AI Gateway provider documentation](https://www.promptfoo.dev/docs/providers/cloudflare-gateway) for more details.
