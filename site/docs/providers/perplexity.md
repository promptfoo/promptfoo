---
sidebar_label: Perplexity
description: "Integrate Perplexity's online LLMs with real-time web search for fact-checking, current events, and knowledge-grounded responses"
---

# Perplexity

The [Perplexity Sonar API](https://docs.perplexity.ai/docs/sonar/quickstart) provides chat completion models with built-in search capabilities, citations, and structured output support. Perplexity models retrieve information from the web in real-time, enabling up-to-date responses with source citations.

Perplexity follows OpenAI's chat completion API format - see our [OpenAI documentation](https://promptfoo.dev/docs/providers/openai) for the base API details.

The four model IDs below are Perplexity's current Sonar catalog. The provider forwards model IDs without a local allow-list, but it targets the Sonar chat-completions endpoint. Perplexity's separate [Agent API](https://docs.perplexity.ai/docs/agent-api/quickstart) uses vendor-qualified IDs through a different endpoint.

## Setup

1. Get an API key from your [Perplexity Settings](https://www.perplexity.ai/settings/api)
2. Set the `PERPLEXITY_API_KEY` environment variable or specify `apiKey` in your config

## Supported Models

Perplexity offers several specialized models optimized for different tasks:

| Model               | Context Length | Description                                         | Use Case                                     |
| ------------------- | -------------- | --------------------------------------------------- | -------------------------------------------- |
| sonar-pro           | 200k           | Advanced search model                               | Long-form content, complex queries           |
| sonar               | 128k           | Lightweight search model                            | Quick searches, cost-effective responses     |
| sonar-reasoning-pro | 128k           | Premier reasoning model with Chain of Thought (CoT) | Complex analyses, multi-step problem solving |
| sonar-deep-research | 128k           | Expert-level research model                         | Comprehensive reports, exhaustive research   |

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

promptfoo uses Perplexity's returned `usage.cost.total_cost` when available, which includes request and specialized usage charges. It falls back to an estimate based on published input and output token prices for responses that do not include cost metadata.

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
      passthrough:
        reasoning_effort: 'high' # low, medium (default), or high
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

Perplexity's current catalog focuses on online Sonar models. The former offline `r1-1776`
model is retired, so use another provider when a task must run without web search.

## Best Practices

### Model Selection

- **sonar-pro**: Use for complex queries requiring detailed responses with citations
- **sonar**: Use for factual queries and cost efficiency
- **sonar-reasoning-pro**: Use for step-by-step problem solving
- **sonar-deep-research**: Use for comprehensive reports (may take 30+ minutes)

### Search Optimization

- Set `search_domain_filter` to trusted domains for higher quality citations
- Use `search_recency_filter` for time-sensitive topics
- For Sonar, Sonar Pro, and Sonar Reasoning Pro, set `web_search_options.search_context_size` to "low" to reduce request fees
- For Deep Research, set `passthrough.reasoning_effort` to balance depth and cost

### Structured Output Tips

- When using structured outputs with reasoning models, responses will include a `<think>` section followed by the structured output
- JSON schemas cannot include recursive structures or unconstrained objects

## Example Configurations

Check our [perplexity.ai-example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-perplexity) with multiple configurations showcasing Perplexity's capabilities:

- **promptfooconfig.yaml**: Basic model comparison
- **promptfooconfig.structured-output.yaml**: JSON Schema structured output
- **promptfooconfig.search-filters.yaml**: Date and location-based filters
- **promptfooconfig.research-reasoning.yaml**: Specialized research and reasoning models

You can initialize these examples with:

```bash
npx promptfoo@latest init --example provider-perplexity
```

## Pricing and Rate Limits

Pricing varies by model and search context size:

| Model               | Input Tokens (per million) | Output Tokens (per million) |
| ------------------- | -------------------------- | --------------------------- |
| sonar               | $1                         | $1                          |
| sonar-pro           | $3                         | $15                         |
| sonar-reasoning-pro | $2                         | $8                          |
| sonar-deep-research | $2                         | $8                          |

Search request fees vary by `web_search_options.search_context_size`:

| Model               | Low (per 1K requests) | Medium (per 1K requests) | High (per 1K requests) |
| ------------------- | --------------------- | ------------------------ | ---------------------- |
| sonar               | $5                    | $8                       | $12                    |
| sonar-pro           | $6                    | $10                      | $14                    |
| sonar-reasoning-pro | $6                    | $10                      | $14                    |

Deep Research also charges $2 per million citation tokens, $5 per 1,000 search queries, and $3 per million reasoning tokens.

Check [Perplexity's pricing page](https://docs.perplexity.ai/docs/getting-started/pricing) for the latest rates.

## Troubleshooting

- **Long Initial Requests**: First request with a new schema may take 10-30 seconds
- **Citation Issues**: Use `search_domain_filter` with trusted domains for better citations
- **Timeout Errors**: For research models, consider increasing your request timeout settings
- **Reasoning Format**: For reasoning models, outputs include `<think>` sections, which may need parsing for structured outputs
