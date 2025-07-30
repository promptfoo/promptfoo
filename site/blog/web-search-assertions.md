---
title: 'Real-Time Fact Checking for LLM Outputs'
description: 'Promptfoo now supports web search in assertions, allowing you to verify time-sensitive information like stock prices and weather during testing.'
image: /img/blog/web-search-assertions/title.jpg
image_alt: 'Web search assertion verifying current information'
slug: llm-web-search-assertions
keywords: [promptfoo, LLM testing, web search, fact checking, real-time verification, assertions]
date: 2025-07-30
authors: [steve]
tags: [feature-announcement, testing, assertions]
---

# Real-Time Fact Checking for LLM Outputs

On July 29, 2025, two U.S. federal judges withdrew rulings containing AI-generated citations that didn't exist.

This type of error happens because LLM outputs often include outdated or incorrect information from training data. Traditional assertion types check format and style, but can't verify current facts.

We're releasing web-search assertions that verify time-sensitive information during testing.

<!-- truncate -->

## How It Works

The web-search assertion verifies LLM outputs against current web data:

```yaml
assert:
  - type: web-search
    value: 'AAPL stock price today'
```

When your LLM outputs a response about Apple's stock price, the assertion:

1. Extracts the claim from the output
2. Searches for current information
3. Compares the output to live data
4. Returns pass/fail based on accuracy

## Example

Here's a complete test configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4o-mini

tests:
  - prompt: "What's the current stock price of Apple?"
    assert:
      - type: web-search
        value: 'AAPL stock price current'
```

If the model responds with outdated price information from its training data, the test will fail.

## Use Cases

Web-search assertions are useful when testing outputs that contain:

- Current stock prices or financial data
- Today's weather conditions
- Recent news or events
- Business hours or availability
- Real-time statistics

Traditional assertions can't catch when an LLM confidently states last year's stock price or yesterday's weather.

## Supported Providers

Web search requires a provider with search capabilities. All major providers now support this:

- **Anthropic** (May 2025): Configure with `web_search_20250305` tool
- **OpenAI**: Use `web_search_preview` tool with responses API
- **Google/Vertex**: Built-in `googleSearch` tool
- **Perplexity**: Native web search, no configuration needed
- **xAI**: Enable with `search_parameters`

## When to Use Web Search

| Use case                         | Keep `llm-rubric` | Add `web-search` |
| -------------------------------- | ----------------- | ---------------- |
| Fiction, tone, UX copy           | ✓                 |                  |
| API docs, math, finance          |                   | ✓                |
| Real-time data (weather, stocks) |                   | ✓                |
| Academic citations               |                   | ✓                |

## Real Examples

### Financial Services

```yaml
# Verify real-time market data
assert:
  - type: web-search
    value: 'S&P 500 current value within 1% of live quote'
```

### Legal Tech

```yaml
# Confirm case citations exist
assert:
  - type: web-search
    value: 'Miranda v. Arizona 384 U.S. 436 (1966)'
```

### Healthcare

```yaml
# Validate FDA approvals
assert:
  - type: web-search
    value: 'Leqembi FDA approval date January 2023'
```

## Configuration

### Basic Setup

```bash
npm install -g promptfoo@latest
```

### With Grading Provider

Specify a web-search capable provider for grading:

```yaml title="promptfooconfig.yaml"
grading:
  provider: openai:responses:o4-mini
  providerOptions:
    config:
      tools: [{ type: web_search_preview }]

tests:
  - prompt: "What's the weather in Tokyo?"
    assert:
      - type: web-search
        value: 'Tokyo weather temperature current'
```

### Auto-Detection

If no grading provider is specified, Promptfoo will automatically select one with web search capabilities based on available API keys.

## Performance and Costs

Web search adds approximately 2-3 seconds per assertion.

Pricing varies by provider:

- **OpenAI**: $0.003-0.008 per search
- **Anthropic**: $10 per 1,000 searches ($0.01 each)
- **Perplexity**: Varies by model tier
- **Google**: Included in standard API pricing

For a typical test suite with 50 web-search assertions, expect to pay $0.15-0.50 per run.

To reduce costs during development:

```bash
promptfoo eval --cache
```

## Provider Configuration

```yaml title="Provider setup examples"
providers:
  # Anthropic - requires web search tool
  - id: anthropic:claude-sonnet-4-20250514
    config:
      tools:
        - type: web_search_20250305
          name: web_search
          max_uses: 5

  # OpenAI - requires tool config
  - id: openai:o4-mini
    config:
      tools:
        - type: web_search_preview

  # Google - uses googleSearch
  - id: google:gemini-2.5-flash
    config:
      tools:
        - googleSearch

  # Perplexity - built-in search
  - perplexity:sonar-large
```

## Best Practices

**Use specific search queries:**

```yaml
# Good - specific and verifiable
- type: web-search
  value: 'Microsoft CEO Satya Nadella'

# Too vague
- type: web-search
  value: 'tech company leadership'
```

**Set appropriate thresholds:**

```yaml
# Allow some flexibility for volatile data
- type: web-search
  value: 'Bitcoin price USD'
  threshold: 0.8
```

**Cache during development:**

```bash
# Avoid repeated searches while iterating
promptfoo eval --cache
```

## Common Issues

**"No provider with web search capabilities"**

Ensure your grading provider has web search configured:

```yaml
grading:
  provider: openai:responses:o4-mini
  providerOptions:
    config:
      tools: [{ type: web_search_preview }]
```

**Timeouts**

Web searches can be slow. Increase timeout if needed:

```yaml
assert:
  - type: web-search
    value: 'complex query'
    timeout: 10000 # 10 seconds
```

## Try It Now

See the [documentation](/docs/configuration/expected-outputs/model-graded/web-search) for complete examples and provider configurations.

<script type="application/ld+json" dangerouslySetInnerHTML={{__html: `
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Real-Time Fact Checking for LLM Outputs",
  "datePublished": "2025-07-30",
  "author": {
    "@type": "Person",
    "name": "Steve"
  },
  "keywords": "LLM testing, web search, fact checking, real-time verification",
  "description": "Promptfoo now supports web search in assertions, allowing you to verify time-sensitive information like stock prices and weather during testing."
}
`}} />
