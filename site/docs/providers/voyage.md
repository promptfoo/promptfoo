# Voyage AI

[Voyage AI](https://www.voyageai.com/) is Anthropic's [recommended](https://docs.anthropic.com/en/docs/embeddings) embeddings provider. It offers state-of-the-art embedding models optimized for different use cases.

## Available Models

- `voyage-3-large` (1024d) - Best general-purpose model, recommended default
- `voyage-3` (1024d) - Standard model
- `voyage-3-lite` (512d) - Lightweight model
- `voyage-code-3` - Specialized for code embeddings
- `voyage-finance-2` - Specialized for financial text
- `voyage-law-2` - Specialized for legal text
- `voyage-multimodal-3` - Supports text + image embeddings

## Basic Usage

Set your API key:

```bash
export VOYAGE_API_KEY="your-api-key"
```

Use in your configuration:

```yaml
provider: voyage:voyage-3-large
```

## Default Configuration

Enable Voyage embeddings for all similarity comparisons:

```yaml
defaultTest:
  options:
    provider:
      embedding: voyage:voyage-3-large
```

## Advanced Configuration

Full configuration options:

```yaml
provider:
  id: voyage:voyage-3-large
  config:
    apiKey: xxx # Direct API key
    apiKeyEnvar: VOYAGE_API_KEY # Environment variable for API key
    apiBaseUrl: https://api.voyageai.com/v1 # Custom API endpoint
    input_type: document # or 'query' for search queries
```

### Configuration Options

- `apiKey`: Direct API key (not recommended, prefer environment variables)
- `apiKeyEnvar`: Environment variable name for API key (default: VOYAGE_API_KEY)
- `apiBaseUrl`: Custom API endpoint (default: https://api.voyageai.com/v1)
- `input_type`: Type of embedding to generate
  - `document`: For document/content embeddings (default)
  - `query`: For search query embeddings
