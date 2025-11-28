---
title: 'Real-Time Fact Checking for LLM Outputs'
description: 'Promptfoo now supports web search in assertions, allowing you to verify time-sensitive information like stock prices and weather during testing.'
image: /img/blog/search-rubric-assertions/title.jpg
image_alt: 'Search rubric assertion verifying current information'
slug: llm-search-rubric-assertions
keywords: [promptfoo, LLM testing, web search, fact checking, real-time verification, assertions]
date: 2025-11-28
authors: [steve]
tags: [feature-announcement, testing, assertions]
---

# Real-Time Fact Checking for LLM Outputs

LLM hallucinations have real consequences. In 2023, lawyers in *Mata v. Avianca* were [fined $5,000](https://en.wikipedia.org/wiki/Mata_v._Avianca,_Inc.) for submitting ChatGPT-generated legal briefs containing fabricated case citations. More recently, [two federal judges withdrew rulings](https://www.washingtontimes.com/news/2025/oct/23/two-federal-judges-admit-using-ai-botched-rulings/) after their clerks used AI that hallucinated nonexistent legal precedents.

LLM outputs often include outdated or incorrect information. Traditional assertion types check format and style, but can't verify current facts against reality.

We're releasing `search-rubric` assertions that verify time-sensitive information during testing.

<!-- truncate -->

## How It Works

The search-rubric assertion works like llm-rubric but with web search capabilities:

```yaml
assert:
  - type: search-rubric
    value: 'Provides accurate AAPL stock price within 2% of current market value'
```

When evaluating, the assertion:

1. Uses your rubric to understand what to verify
2. Searches the web if current information is needed
3. Grades the output based on the rubric criteria
4. Returns pass/fail with a score from 0.0 to 1.0

## Example

Here's a complete test configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4o-mini

tests:
  - prompt: "What's the current stock price of {{company}}?"
    assert:
      - type: search-rubric
        value: |
          States the current {{ticker}} stock price that:
          1. Is within 3% of actual market price
          2. Includes currency (USD)
          3. Mentions if market is currently open or closed
    vars:
      company: Apple
      ticker: AAPL
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

- **Anthropic**: Configure with `web_search_20250305` tool
- **OpenAI**: Use `web_search_preview` tool with Responses API
- **Google/Vertex**: Built-in `googleSearch` tool
- **Perplexity**: Native web search, no configuration needed
- **xAI**: Enable with `search_parameters`

## When to Use Web Search

| Use case                         | Keep `llm-rubric` | Add `search-rubric` |
| -------------------------------- | ----------------- | ------------------- |
| Fiction, tone, UX copy           | ✓                 |                     |
| Current events, news             |                   | ✓                   |
| Real-time data (weather, stocks) |                   | ✓                   |
| Recent releases, announcements   |                   | ✓                   |

## Real Examples

### Financial Services

```yaml
# Verify real-time market data
assert:
  - type: search-rubric
    value: |
      Provides S&P 500 index value that:
      - Is within 1% of current market value
      - Includes point change from previous close
      - States whether markets are open or closed
```

### Current Events

```yaml
# Verify recent news accuracy
assert:
  - type: search-rubric
    value: |
      Correctly describes the 2024 U.S. Presidential Election:
      - Names the winning candidate
      - States the electoral vote margin
      - Mentions key swing states
```

### Healthcare

```yaml
# Validate FDA approvals
assert:
  - type: search-rubric
    value: 'States correct FDA approval date for Leqembi (should be January 2023) and its approved use'
```

## Configuration

### Basic Setup

```bash
npm install -g promptfoo@latest
```

### With Grading Provider

Specify a search-rubric capable provider for grading:

```yaml title="promptfooconfig.yaml"
grading:
  provider: openai:responses:o4-mini
  providerOptions:
    config:
      tools: [{ type: web_search_preview }]

tests:
  - prompt: "What's the weather in Tokyo?"
    assert:
      - type: search-rubric
        value: |
          Describes current Tokyo weather with:
          - Temperature in Celsius or Fahrenheit
          - Current conditions (sunny, rainy, cloudy, etc.)
          - Any active weather warnings if applicable
```

### Auto-Detection

If no grading provider is specified, Promptfoo will automatically select one with web search capabilities based on available API keys.

## Performance and Costs

Web search adds approximately 2-3 seconds per assertion.

Pricing varies by provider (as of late 2025):

- **OpenAI**: $10-50 per 1,000 web searches depending on context size, plus token costs
- **Anthropic**: $10 per 1,000 searches plus standard token costs
- **Perplexity**: Varies by model tier
- **Google**: Included in standard API pricing

For a typical test suite with 50 search-rubric assertions, expect to pay $0.50-2.50 per run depending on provider.

To reduce costs during development:

```bash
promptfoo eval --cache
```

## Provider Configuration

```yaml title="Provider setup examples"
providers:
  # Anthropic Claude 4.5 Opus (Nov 2024 checkpoint)
  - id: anthropic:messages:claude-opus-4-5-20251101
    config:
      tools:
        - type: web_search_20250305
          name: web_search
          max_uses: 5

  # OpenAI GPT-5.1 with web search
  - id: openai:responses:gpt-5.1
    config:
      tools:
        - type: web_search_preview

  # Google Gemini 3 Pro Preview
  - id: google:gemini-3-pro-preview
    config:
      tools:
        - googleSearch: {}

  # xAI Grok 4.1 Fast Reasoning with live search
  - id: xai:grok-4-1-fast-reasoning
    config:
      search_parameters:
        mode: 'on'

  # Perplexity Sonar Pro - built-in search
  - perplexity:sonar-pro
```

## Best Practices

**Write clear rubrics like llm-rubric:**

```yaml
# Good - specific criteria
- type: search-rubric
  value: 'Names Satya Nadella as the current CEO of Microsoft'

# Too vague
- type: search-rubric
  value: 'talks about tech leadership'
```

**Set appropriate thresholds:**

```yaml
# Allow flexibility for volatile data
- type: search-rubric
  value: 'Provides Bitcoin price in USD within 10% of current market value'
  threshold: 0.8 # 80% score required
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
  - type: search-rubric
    value: 'complex query'
    timeout: 10000 # 10 seconds
```

## Try It Now

See the [documentation](/docs/configuration/expected-outputs/model-graded/search-rubric) for complete examples and provider configurations.

<script type="application/ld+json" dangerouslySetInnerHTML={{__html: `
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Real-Time Fact Checking for LLM Outputs",
  "datePublished": "2025-11-28",
  "author": {
    "@type": "Person",
    "name": "Steve"
  },
  "keywords": "LLM testing, web search, fact checking, real-time verification",
  "description": "Promptfoo now supports web search in assertions, allowing you to verify time-sensitive information like stock prices and weather during testing."
}
`}} />
