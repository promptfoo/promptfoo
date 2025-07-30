---
title: 'Introducing Web Search Assertions: Real-Time Fact Verification for LLMs'
description: Promptfoo now supports web search assertions to automatically verify LLM outputs against current information from the internet.
image: /img/blog/web-search-assertions/title.jpg
keywords: [promptfoo, LLM testing, fact checking, web search, AI accuracy, real-time verification]
date: 2025-07-30
authors: [steve]
tags: [feature-announcement, testing, assertions]
---

# Introducing Web Search Assertions: Real-Time Fact Verification for LLMs

LLMs often struggle with current events, recent updates, and factual accuracy. Even with retrieval-augmented generation (RAG), outputs can contain outdated information or subtle inaccuracies. Today we're announcing web search assertions in Promptfoo - a lightweight way to verify LLM outputs against real-time web information.

<!-- truncate -->

## The Problem with Static Knowledge

LLMs are trained on static datasets with knowledge cutoffs. When your application needs to provide current information - stock prices, news events, product availability, or recent policy changes - traditional testing approaches fall short:

- **Model-graded assertions** can't verify facts the evaluator model doesn't know
- **Exact match assertions** are too rigid for dynamic information
- **Manual verification** doesn't scale

## How Web Search Assertions Work

Web search assertions automatically verify claims in LLM outputs by searching the web and comparing results:

```yaml
# promptfooconfig.yaml
prompts:
  - "What is the current CEO of {{company}}?"

providers:
  - openai:gpt-4

tests:
  - vars:
      company: "OpenAI"
    assert:
      - type: web-search
        value: "Sam Altman is the current CEO of OpenAI"
```

When this test runs, Promptfoo will:
1. Extract the LLM's response
2. Search the web for verification
3. Use an evaluation model to determine if the web results support the claim
4. Return pass/fail with explanation

## Multiple Provider Support

Web search assertions work with any provider that has web search capabilities:

```yaml
providers:
  # Anthropic - built-in web search
  - anthropic:claude-sonnet-4
  
  # OpenAI - requires web_search_preview tool
  - id: openai:o4-mini
    config:
      tools:
        - type: web_search_preview
  
  # Google - uses googleSearch tool
  - id: google:gemini-2.5-flash
    config:
      tools:
        - googleSearch
  
  # Perplexity - built-in web search
  - perplexity:sonar-large
```

## Real-World Use Cases

### 1. News and Current Events
```yaml
tests:
  - vars:
      topic: "2025 AI regulations"
    assert:
      - type: web-search
        value: "EU AI Act enforcement began in 2025"
```

### 2. Product Information
```yaml
tests:
  - vars:
      product: "iPhone 16"
    assert:
      - type: web-search
        value: "iPhone 16 starting price is $799"
```

### 3. Company Facts
```yaml
tests:
  - vars:
      company: "Anthropic"
    assert:
      - type: web-search
        value: "Anthropic raised funding at $60 billion valuation"
```

### 4. Technical Documentation
```yaml
tests:
  - vars:
      library: "React"
    assert:
      - type: web-search
        value: "React 19 supports automatic batching"
```

## Configuring Web Search Preferences

You can customize which provider performs the web search verification:

```yaml
defaultTest:
  options:
    provider:
      id: anthropic:claude-sonnet-4  # Prefer Anthropic for search
```

Or use a specific provider for individual assertions:

```yaml
assert:
  - type: web-search
    value: "claim to verify"
    provider: perplexity:sonar-large
```

## Performance Considerations

Web search assertions make external API calls, which impacts performance:

- **Latency**: Each assertion adds 2-5 seconds
- **Cost**: Web search API calls may incur charges
- **Rate limits**: Consider provider limits when running many tests

For faster iteration during development, you can disable web search assertions:

```bash
promptfoo eval --filter-failing '!web-search'
```

## Integration with CI/CD

Web search assertions are particularly valuable in continuous integration:

```yaml
# .github/workflows/test.yml
- name: Run Promptfoo Tests
  run: |
    promptfoo eval
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

This ensures your LLM outputs remain accurate even as real-world information changes.

## Best Practices

1. **Be specific**: Vague claims are harder to verify
   ```yaml
   # Good
   - type: web-search
     value: "Python 3.13 was released in October 2024"
   
   # Less effective
   - type: web-search
     value: "Python has a new version"
   ```

2. **Consider temporality**: Some facts change frequently
   ```yaml
   # May fail as prices fluctuate
   - type: web-search
     value: "Bitcoin price is exactly $67,432"
   
   # More robust
   - type: web-search
     value: "Bitcoin price is above $60,000"
   ```

3. **Use for critical facts**: Focus on information that must be accurate
   ```yaml
   # Critical medical information
   - type: web-search
     value: "FDA approved drug for condition in 2025"
   ```

## Getting Started

1. Update to the latest version of Promptfoo:
   ```bash
   npm install -g promptfoo@latest
   ```

2. Add web search assertions to your test configuration:
   ```yaml
   assert:
     - type: web-search
       value: "Your claim to verify"
   ```

3. Run your evaluation:
   ```bash
   promptfoo eval
   ```

## Technical Implementation

Under the hood, web search assertions use a two-step process:

1. **Search**: Query the web using the provider's search capabilities
2. **Evaluate**: Compare search results against the claimed output

The evaluation prompt is carefully crafted to handle edge cases:
- Conflicting information from multiple sources
- Outdated cached results
- Ambiguous or partial matches

## What's Next

Web search assertions are part of our broader mission to make LLM testing more robust and automated. We're exploring:

- **Caching**: Reduce API calls for repeated searches
- **Source filtering**: Restrict searches to trusted domains
- **Temporal awareness**: Better handling of time-sensitive information

## Conclusion

Web search assertions provide a lightweight but powerful way to verify factual accuracy in LLM outputs. By automatically checking claims against current web information, you can catch errors before they reach production.

Try web search assertions today and let us know what you think. We're excited to see how you use this feature to build more reliable AI applications.

[Get started with web search assertions →](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/web-search)