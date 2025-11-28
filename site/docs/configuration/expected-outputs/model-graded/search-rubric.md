---
sidebar_label: Search Rubric
---

# Search-Rubric

The `search-rubric` assertion type is like `llm-rubric` but with web search capabilities. It evaluates outputs according to a rubric while having the ability to search for current information when needed.

## How it works

1. You provide a rubric that describes what the output should contain
2. The grading provider evaluates the output against the rubric
3. If the rubric requires current information, the provider searches the web
4. Returns pass/fail with a score from 0.0 to 1.0

## Basic Usage

```yaml
assert:
  - type: search-rubric
    value: 'Provides accurate current Bitcoin price within 5% of market value'
```

## Comparing to LLM-Rubric

The `search-rubric` assertion behaves exactly like `llm-rubric`, but automatically uses a provider with web search capabilities:

```yaml
# These are equivalent:
assert:
  # Using llm-rubric with a web-search capable provider
  - type: llm-rubric
    value: 'Contains current stock price for Apple (AAPL) within $5'
    provider: openai:responses:o4-mini # Must configure web search tool

  # Using search-rubric (automatically selects a web-search provider)
  - type: search-rubric
    value: 'Contains current stock price for Apple (AAPL) within $5'
```

## Using Variables in the Rubric

Like `llm-rubric`, you can use test variables:

```yaml
prompts:
  - 'What is the current weather in {{city}}?'

assert:
  - type: search-rubric
    value: 'Provides current temperature in {{city}} with units (F or C)'

tests:
  - vars:
      city: San Francisco
  - vars:
      city: Tokyo
```

## Grading Providers

The search-rubric assertion requires a grading provider with web search capabilities:

### 1. Anthropic Claude

Anthropic Claude models support web search through the `web_search_20250305` tool:

```yaml
grading:
  provider: anthropic:messages:claude-opus-4-5-20251101
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
  provider: openai:responses:gpt-5.1
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
  provider: google:gemini-3-pro-preview
  providerOptions:
    config:
      tools:
        - googleSearch: {}
```

### 5. xAI Grok

xAI's Grok models have built-in web search capabilities:

```yaml
grading:
  provider: xai:grok-4-1-fast-reasoning
  providerOptions:
    config:
      search_parameters:
        mode: 'on'
```

## Use Cases

### 1. Current Events Verification

```yaml
prompts:
  - 'Who won the latest Super Bowl?'

assert:
  - type: search-rubric
    value: 'Names the correct winner of the most recent Super Bowl with the final score'
```

### 2. Real-time Price Checking

```yaml
prompts:
  - "What's the current stock price of {{ticker}}?"

assert:
  - type: search-rubric
    value: |
      Provides accurate stock price for {{ticker}} that:
      1. Is within 2% of current market price
      2. Includes currency (USD)
      3. Mentions if market is open or closed
    threshold: 0.8
```

### 3. Weather Information

```yaml
prompts:
  - "What's the weather like in Tokyo?"

assert:
  - type: search-rubric
    value: |
      Describes current Tokyo weather including:
      - Temperature (with units)
      - General conditions (sunny, rainy, etc.)
      - Humidity or precipitation if relevant
```

### 4. Latest Software Versions

```yaml
prompts:
  - "What's the latest version of Node.js?"

assert:
  - type: search-rubric
    value: 'States the correct latest LTS version of Node.js (not experimental or nightly)'
```

## Cost Considerations

Web search assertions have the following cost implications:

- **Anthropic Claude**: $10 per 1,000 searches plus standard token costs
- **Perplexity**: Pricing varies by model (check current Perplexity Sonar pricing)
- **Google Gemini**: Built-in googleSearch tool, included in Gemini API pricing
- **OpenAI**: web_search_preview tool included in standard API pricing
- **xAI Grok**: Built-in search, standard API pricing applies

## Threshold Support

Like `llm-rubric`, the `search-rubric` assertion supports thresholds:

```yaml
assert:
  - type: search-rubric
    value: 'Contains accurate information about current US inflation rate'
    threshold: 0.9 # Requires 90% accuracy for economic data
```

## Best Practices

1. **Write clear rubrics**: Be specific about what information you expect
2. **Use thresholds appropriately**: Higher thresholds for factual accuracy, lower for general correctness
3. **Include acceptable ranges**: For volatile data like prices, specify acceptable accuracy (e.g., "within 5%")
4. **Enable caching**: Use `promptfoo eval --cache` during development to avoid repeated searches
5. **Test variable substitution**: Ensure your rubrics work with different variable values

## Troubleshooting

### "No provider with web search capabilities"

Ensure your grading provider supports web search. Default providers without web search configuration will fail.

### Inaccurate results

Try making your search query more specific or adjusting the threshold.

### High costs

Consider using Perplexity's `sonar` model or enabling result caching.
