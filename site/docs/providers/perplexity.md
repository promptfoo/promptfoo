# Perplexity

The [Perplexity API](https://blog.perplexity.ai/blog/introducing-pplx-api) provides chat completion models with built-in search capabilities, citations, and structured output support. Perplexity follows OpenAI's chat completion API format - see our [OpenAI documentation](https://promptfoo.dev/docs/providers/openai) for the base API details.

## Setup

1. Get an API key from your [Perplexity Settings](https://www.perplexity.ai/settings/api)
2. Set the `PERPLEXITY_API_KEY` environment variable or specify `apiKey` in your config

## Supported Models

| Model     | Context Length | Description                                     | Use Case                                    |
| --------- | -------------- | ----------------------------------------------- | ------------------------------------------- |
| sonar-pro | 200k           | Chat completion model with 8k max output tokens | Long-form content, complex reasoning        |
| sonar     | 127k           | Chat completion model                           | General purpose, search-augmented responses |

## Basic Configuration

```yaml
providers:
  - id: perplexity:sonar-pro
    config:
      temperature: 0.7
      max_tokens: 4000

  - id: perplexity:sonar
    config:
      temperature: 0.2
      max_tokens: 8000
      search_domain_filter: ['wikipedia.org', 'nature.com', '-reddit.com'] # Include wikipedia/nature, exclude reddit
      search_recency_filter: 'week' # Only use recent sources
```

## Unique Features

### Search and Citations

Perplexity models automatically search the internet and cite sources. You can control this with:

- `search_domain_filter`: List of domains to include/exclude (prefix with `-` to exclude)
- `search_recency_filter`: Time filter for sources ('month', 'week', 'day', 'hour')
- `return_related_questions`: Get follow-up question suggestions

### Structured Output (Beta, sonar only)

Get responses in specific formats using JSON Schema or Regex patterns:

```yaml
providers:
  - id: perplexity:sonar
    config:
      response_format:
        type: 'json_schema'
        json_schema:
          schema:
            type: 'object'
            properties:
              title: { type: 'string' }
              year: { type: 'integer' }
              summary: { type: 'string' }
            required: ['title', 'year', 'summary']
```

Note: First request with a new schema may take 10-30 seconds to prepare.

Additional Perplexity-specific options:

- `return_images` (default: false) - Include images in responses
- `return_related_questions` (default: false) - Get follow-up questions

## Best Practices

- Use `sonar-pro` for tasks requiring deep analysis or long outputs
- Use `sonar` for factual queries that benefit from up-to-date information
- Set `search_domain_filter` to trusted domains for higher quality citations
- Consider `search_recency_filter` for time-sensitive topics
