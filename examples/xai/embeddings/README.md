# xai/embeddings (xAI Embeddings)

This example uses xAI embeddings for semantic similarity assertions.

## Setup

```bash
npx promptfoo@latest init --example xai/embeddings
cd xai/embeddings
export XAI_API_KEY=your_api_key_here
```

## Run

```bash
npx promptfoo@latest eval
```

The config uses `xai:embedding:v1` as the embedding provider for `similar` assertions while Grok generates the evaluated text.
