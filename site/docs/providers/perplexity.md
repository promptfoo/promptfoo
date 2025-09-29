---
sidebar_label: Perplexity
description: "Integrate Perplexity's online LLMs with real-time web search for fact-checking, current events, and knowledge-grounded responses"
---

# Perplexity

The [Perplexity API](https://blog.perplexity.ai/blog/introducing-pplx-api) provides chat completion models with built-in search capabilities, citations, and structured output support. Perplexity models retrieve information from the web in real-time, enabling up-to-date responses with source citations.

Perplexity follows OpenAI's chat completion API format - see our [OpenAI documentation](https://promptfoo.dev/docs/providers/openai) for the base API details.

## Setup

1. Get an API key from your [Perplexity Settings](https://www.perplexity.ai/settings/api)
2. Set the `PERPLEXITY_API_KEY` environment variable or specify `apiKey` in your config

## Supported Models

Perplexity offers several specialized models optimized for different tasks:

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

## Features

### Search and Citations

Perplexity models automatically search the internet and cite sources. You can control this with:

- `search_domain_filter`: List of domains to include/exclude (prefix with `-` to exclude)
- `search_recency_filter`: Time filter for sources ('month', 'week', 'day', 'hour')
- `return_related_questions`: Get follow-up question suggestions
- `web_search_options.search_context_size`: Control search context amount ('low', 'medium', 'high')

```yaml
providers:
  - id: perplexity:sonar-pro
    config:
      search_domain_filter: ['stackoverflow.com', 'github.com', '-quora.com']
      search_recency_filter: 'month'
      return_related_questions: true
      web_search_options:
        search_context_size: 'high'
```

### Date Range Filters

Control search results based on publication date:

```yaml
providers:
  - id: perplexity:sonar-pro
    config:
      # Date filters - format: "MM/DD/YYYY"
      search_after_date_filter: '3/1/2025'
      search_before_date_filter: '3/15/2025'
```

### Location-Based Filtering

Localize search results by specifying user location:

```yaml
providers:
  - id: perplexity:sonar
    config:
      web_search_options:
        user_location:
          latitude: 37.7749
          longitude: -122.4194
          country: 'US' # Optional: ISO country code
```

### Structured Output

Get responses in specific formats using JSON Schema:

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

Or with regex patterns (sonar model only):

```yaml
providers:
  - id: perplexity:sonar
    config:
      response_format:
        type: 'regex'
        regex:
          regex: "(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
```

**Note**: First request with a new schema may take 10-30 seconds to prepare. For reasoning models, the response will include a `<think>` section followed by the structured output.

### Image Support

Enable image retrieval in responses:

```yaml
providers:
  - id: perplexity:sonar-pro
    config:
      return_images: true
```

### Cost Tracking

promptfoo includes built-in cost calculation for Perplexity models based on their official pricing. You can specify the usage tier with the `usage_tier` parameter:

```yaml
providers:
  - id: perplexity:sonar-pro
    config:
      usage_tier: 'medium' # Options: 'high', 'medium', 'low'
```

The cost calculation includes:

- Different rates for input and output tokens
- Model-specific pricing (sonar, sonar-pro, sonar-reasoning, etc.)
- Usage tier considerations (high, medium, low)

## Advanced Use Cases

### Comprehensive Research

For in-depth research reports:

```yaml
providers:
  - id: perplexity:sonar-deep-research
    config:
      temperature: 0.1
      max_tokens: 4000
      search_domain_filter: ['arxiv.org', 'researchgate.net', 'scholar.google.com']
      web_search_options:
        search_context_size: 'high'
```

### Step-by-Step Reasoning

For problems requiring explicit reasoning steps:

```yaml
providers:
  - id: perplexity:sonar-reasoning-pro
    config:
      temperature: 0.2
      max_tokens: 3000
```

### Offline Creative Tasks

For creative content that doesn't require web search:

```yaml
providers:
  - id: perplexity:r1-1776
    config:
      temperature: 0.7
      max_tokens: 2000
```

## Best Practices

### Model Selection

- **sonar-pro**: Use for complex queries requiring detailed responses with citations
- **sonar**: Use for factual queries and cost efficiency
- **sonar-reasoning-pro/sonar-reasoning**: Use for step-by-step problem solving
- **sonar-deep-research**: Use for comprehensive reports (may take 30+ minutes)
- **r1-1776**: Use for creative content not requiring search

### Search Optimization

- Set `search_domain_filter` to trusted domains for higher quality citations
- Use `search_recency_filter` for time-sensitive topics
- For cost optimization, set `web_search_options.search_context_size` to "low"
- For comprehensive research, set `web_search_options.search_context_size` to "high"

### Structured Output Tips

- When using structured outputs with reasoning models, responses will include a `<think>` section followed by the structured output
- For regex patterns, ensure they follow the supported syntax
- JSON schemas cannot include recursive structures or unconstrained objects

## Example Configurations

Check our [perplexity.ai-example](https://github.com/promptfoo/promptfoo/tree/main/examples/perplexity.ai-example) with multiple configurations showcasing Perplexity's capabilities:

- **promptfooconfig.yaml**: Basic model comparison
- **promptfooconfig.structured-output.yaml**: JSON schema and regex patterns
- **promptfooconfig.search-filters.yaml**: Date and location-based filters
- **promptfooconfig.research-reasoning.yaml**: Specialized research and reasoning models

You can initialize these examples with:

```bash
npx promptfoo@latest init --example perplexity.ai-example
```

## Pricing and Rate Limits

Pricing varies by model and usage tier:

| Model               | Input Tokens (per million) | Output Tokens (per million) |
| ------------------- | -------------------------- | --------------------------- |
| sonar               | $1                         | $1                          |
| sonar-pro           | $3                         | $15                         |
| sonar-reasoning     | $1                         | $5                          |
| sonar-reasoning-pro | $2                         | $8                          |
| sonar-deep-research | $2                         | $8                          |
| r1-1776             | $2                         | $8                          |

Rate limits also vary by usage tier (high, medium, low). Specify your tier with the `usage_tier` parameter to get accurate cost calculations.

Check [Perplexity's pricing page](https://docs.perplexity.ai/docs/pricing) for the latest rates.

## Troubleshooting

- **Long Initial Requests**: First request with a new schema may take 10-30 seconds
- **Citation Issues**: Use `search_domain_filter` with trusted domains for better citations
- **Timeout Errors**: For research models, consider increasing your request timeout settings
- **Reasoning Format**: For reasoning models, outputs include `<think>` sections, which may need parsing for structured outputs
