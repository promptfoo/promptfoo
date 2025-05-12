# Perplexity

The [Perplexity API](https://blog.perplexity.ai/blog/introducing-pplx-api) provides chat completion models with built-in search capabilities, citations, and structured output support. Perplexity follows OpenAI's chat completion API format - see our [OpenAI documentation](https://promptfoo.dev/docs/providers/openai) for the base API details.

## Setup

1. Get an API key from your [Perplexity Settings](https://www.perplexity.ai/settings/api)
2. Set the `PERPLEXITY_API_KEY` environment variable or specify `apiKey` in your config

## Supported Models

| Model               | Context Length | Description                                         | Use Case                                         |
| ------------------- | -------------- | --------------------------------------------------- | ------------------------------------------------ |
| sonar-pro           | 200k           | Advanced search model with 8k max output tokens     | Long-form content, complex reasoning             |
| sonar               | 128k           | Lightweight search model                            | Quick searches, cost-effective responses         |
| sonar-reasoning-pro | 128k           | Premier reasoning model with Chain of Thought (CoT) | Complex analyses, multi-step problem solving     |
| sonar-reasoning     | 128k           | Fast real-time reasoning model                      | Problem-solving with search                      |
| sonar-deep-research | 128k           | Expert-level research model                         | Comprehensive reports, exhaustive research       |
| r1-1776             | 128k           | Offline chat model (no search)                      | Creative content, tasks without web search needs |

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
      max_tokens: 1000
      search_domain_filter: ['wikipedia.org', 'nature.com', '-reddit.com'] # Include wikipedia/nature, exclude reddit
      search_recency_filter: 'week' # Only use recent sources
```

## Unique Features

### Search and Citations

Perplexity models automatically search the internet and cite sources. You can control this with:

- `search_domain_filter`: List of domains to include/exclude (prefix with `-` to exclude)
- `search_recency_filter`: Time filter for sources ('month', 'week', 'day', 'hour')
- `return_related_questions`: Get follow-up question suggestions
- `web_search_options.search_context_size`: Control search context amount ('low', 'medium', 'high')

### Date and Location Filters

Control search results based on publication date or user location:

```yaml
providers:
  - id: perplexity:sonar-pro
    config:
      # Date filters - format: "MM/DD/YYYY"
      search_after_date_filter: "3/1/2025"
      search_before_date_filter: "3/15/2025"
      
      # Location filters
      web_search_options:
        user_location:
          latitude: 37.7749
          longitude: -122.4194
          country: "US"
```

### Structured Output

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

For regex patterns (sonar only):

```yaml
providers:
  - id: perplexity:sonar
    config:
      response_format:
        type: 'regex'
        regex: 
          regex: "(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
```

Note: First request with a new schema may take 10-30 seconds to prepare.

### Image Support

You can include images in your API requests:

```yaml
providers:
  - id: perplexity:sonar-pro
    config:
      return_images: true
```

## Additional Options

- `return_images` (default: false) - Include images in responses
- `return_related_questions` (default: false) - Get follow-up questions

## Best Practices

- **Model Selection**:
  - Use `sonar-pro` for complex queries requiring detailed responses
  - Use `sonar` for factual queries and cost efficiency
  - Use `sonar-reasoning-pro` or `sonar-reasoning` for step-by-step problem solving
  - Use `sonar-deep-research` for comprehensive reports (may take 30+ minutes)
  - Use `r1-1776` for creative content not requiring search

- **Search Optimization**:
  - Set `search_domain_filter` to trusted domains for higher quality citations
  - Use `search_recency_filter` for time-sensitive topics
  - For cost optimization, set `web_search_options.search_context_size` to "low"
  - For comprehensive research, set `web_search_options.search_context_size` to "high"

- **When using structured outputs with reasoning models**:
  - Be aware that reasoning models will include a `<think>` section followed by the structured output
