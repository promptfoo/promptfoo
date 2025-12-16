# langfuse-traces (Evaluate Langfuse Traces)

Evaluate LLM outputs stored in Langfuse traces without re-running them.

## Setup

1. Copy `.env.example` to `.env` and add your Langfuse credentials:

   ```bash
   npx promptfoo@latest init --example langfuse-traces
   cd langfuse-traces
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. Get your API keys from [Langfuse](https://langfuse.com) -> Settings -> API Keys

## Usage

```bash
npx promptfoo@latest eval
```

## What This Example Shows

- Loading traces from Langfuse using `langfuse://traces` URL scheme
- Filtering traces by tags, limit, and other parameters
- Running assertions on stored trace outputs (assertion-only evaluation)

## URL Parameters

| Parameter       | Description                            | Example                    |
| --------------- | -------------------------------------- | -------------------------- |
| `limit`         | Maximum traces to fetch (default: 100) | `limit=50`                 |
| `userId`        | Filter by user ID                      | `userId=user_123`          |
| `sessionId`     | Filter by session ID                   | `sessionId=sess_456`       |
| `tags`          | Filter by tags (comma-separated)       | `tags=production,gpt-4`    |
| `name`          | Filter by trace name                   | `name=chat-completion`     |
| `fromTimestamp` | Start timestamp (ISO 8601)             | `fromTimestamp=2024-01-01` |
| `toTimestamp`   | End timestamp (ISO 8601)               | `toTimestamp=2024-01-31`   |

## Learn More

See the [Langfuse integration docs](https://promptfoo.dev/docs/integrations/langfuse#evaluating-langfuse-traces) for more details.
