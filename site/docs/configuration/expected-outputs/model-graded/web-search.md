---
sidebar_label: Web Search
---

# Web-Search

The `web-search` assertion type evaluates outputs by searching for current information on the web and verifying the accuracy of the response. It's designed for quick, real-time fact verification.

## How it works

1. You provide a search query as the expected value
2. The grading provider searches the web for current information
3. The output is evaluated against the search results
4. Returns pass/fail based on accuracy and relevance

## Basic Usage

```yaml
assert:
  - type: web-search
    value: 'current price of Bitcoin in USD'
```

## With Custom Prompt

```yaml
prompts:
  - 'What is the current weather in San Francisco?'

assert:
  - type: web-search
    value: 'current weather San Francisco temperature humidity'
```

## Advanced Usage

```yaml
assert:
  - type: web-search
    value: 'latest Claude AI model release date features'
    threshold: 0.8 # Require 80% accuracy score
```

## Grading Providers

The web-search assertion requires a grading provider with web search capabilities:

### 1. Anthropic Claude

Anthropic Claude models support web search through the `web_search_20250305` tool:

```yaml
grading:
  provider: anthropic:messages:claude-sonnet-4-20250514
  providerOptions:
    config:
      tools:
        - type: web_search_20250305
          name: web_search
          max_uses: 5
```

### 2. OpenAI with Web Search

OpenAI's responses API supports web search through the `web_search_preview` tool:

```yaml
grading:
  provider: openai:responses:o4-mini
  providerOptions:
    config:
      tools:
        - type: web_search_preview
```

### 3. Perplexity

Perplexity models have built-in web search:

```yaml
grading:
  provider: perplexity:sonar
```

### 4. Google Gemini

Google's Gemini models support web search through the `googleSearch` tool:

```yaml
grading:
  provider: google:gemini-2.5-flash
  providerOptions:
    config:
      tools:
        - googleSearch: {}
```

### 5. xAI Grok

xAI's Grok models have built-in web search capabilities:

```yaml
grading:
  provider: xai:grok-beta
  providerOptions:
    config:
      search_parameters:
        enable_search: true
```

## Use Cases

### 1. Current Events Verification

```yaml
prompts:
  - 'Who won the latest Super Bowl?'

assert:
  - type: web-search
    value: 'Super Bowl 2025 winner'
```

### 2. Real-time Price Checking

```yaml
prompts:
  - "What's the current stock price of Apple?"

assert:
  - type: web-search
    value: 'AAPL stock price today'
```

### 3. Weather Information

```yaml
prompts:
  - "What's the weather like in Tokyo?"

assert:
  - type: web-search
    value: 'Tokyo weather forecast temperature'
```

### 4. Latest Software Versions

```yaml
prompts:
  - "What's the latest version of Node.js?"

assert:
  - type: web-search
    value: 'Node.js latest stable version'
```

## Cost Considerations

Web search assertions have the following cost implications:

- **Anthropic Claude**: $10 per 1,000 searches plus standard token costs
- **Perplexity**: Pricing varies by model (check current Perplexity Sonar pricing)
- **Google Gemini**: Built-in googleSearch tool, included in Gemini API pricing
- **OpenAI**: web_search_preview tool included in standard API pricing
- **xAI Grok**: Built-in search, standard API pricing applies

## Best Practices

1. **Use specific search queries**: More specific queries yield better verification results
2. **Consider caching**: Enable caching to avoid repeated searches during development
3. **Choose the right provider**: Perplexity for built-in search, Anthropic for comprehensive search with citations
4. **Set appropriate thresholds**: Use lower thresholds (0.7-0.8) for general information, higher (0.9+) for critical facts

## Troubleshooting

### "No provider with web search capabilities"

Ensure your grading provider supports web search. Default providers without web search configuration will fail.

### Inaccurate results

Try making your search query more specific or adjusting the threshold.

### High costs

Consider using Perplexity's `sonar` model or enabling result caching.
