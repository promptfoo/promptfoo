# Web Search Assertion Example

This example demonstrates how to use the `web-search` assertion type to verify that LLM outputs contain accurate, current information.

## Overview

The `web-search` assertion allows you to verify facts by searching the web in real-time. This is particularly useful for:

- Current events and news
- Stock prices and financial data
- Weather information
- Recent company information
- Any time-sensitive data

## Running the Example

```bash
npx promptfoo eval
```

## How It Works

1. The LLM generates a response to your prompt
2. The web-search assertion extracts the claim you want to verify
3. A provider with web search capabilities searches for current information
4. The assertion passes or fails based on whether the output matches current web data

## Provider Support

### Anthropic Claude

- Web search capabilities via tool configuration (launched May 2025)
- Requires explicit `web_search_20250305` tool configuration
- Pricing: $10 per 1,000 searches plus standard token costs

### OpenAI

- Requires `web_search_preview` tool configuration
- Works with o4-mini and other response models

### Perplexity

- Built-in web search capabilities
- No additional configuration needed

## Configuration

```yaml
assert:
  - type: web-search
    value: 'search query to verify'
    threshold: 0.8 # Optional: minimum accuracy score (0-1)
```

## Notes

- Web search assertions add latency (2-5 seconds per assertion)
- Use caching during development: `npx promptfoo eval --cache`
- Be specific with your search queries for better results
