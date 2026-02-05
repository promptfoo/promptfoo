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
    provider: openai:responses:gpt-5.1 # Must configure web search tool

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
  provider: anthropic:messages:claude-opus-4-6
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

Web search assertions have the following cost implications. As of November 2025:

- **Anthropic Claude**: $10 per 1,000 web search calls plus token costs
- **OpenAI**: Web search tools on the Responses API cost $10-25 per 1,000 tool calls in addition to token usage
- **Google Gemini API**: $35 per 1,000 grounded prompts; **Vertex AI Web Grounding**: $45 per 1,000
- **Perplexity**: Per-request plus token-based pricing; see Perplexity or your proxy's pricing page
- **xAI Grok**: $25 per 1,000 sources plus token usage for Live Search

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
4. **Use caching**: Caching is enabled by default; use `promptfoo eval --no-cache` to force fresh searches
5. **Test variable substitution**: Ensure your rubrics work with different variable values

## Expected Behavior

Understanding how `search-rubric` evaluates different scenarios helps you write better tests.

### What the grader catches

The search-enabled grader identifies several types of failures:

| SUT Response                            | Grader Verdict | Reason                            |
| --------------------------------------- | -------------- | --------------------------------- |
| "I don't have access to real-time data" | **Fail**       | No actual answer provided         |
| Stale price from training data          | **Fail**       | Value differs from current market |
| Correct current price                   | **Pass**       | Matches web search results        |
| Partially correct answer                | **Partial**    | Score reflects completeness       |

### Models without web search

Models like `gpt-4o-mini` without web search enabled will often refuse to answer real-time questions:

> "I don't have access to real-time stock data. For current prices, please check a financial website."

The `search-rubric` grader correctly flags this as a failure since no actual information was provided. This is the expected behavior—the assertion is verifying whether your system provides accurate current information, not whether it gracefully declines.

**To test models that confidently answer (and potentially hallucinate):**

- Use a more capable model as the system under test
- Enable web search on your SUT if available
- Test against models known to attempt answers even when uncertain

### Partial matches and scoring

The grader returns a score from 0.0 to 1.0 based on how well the output matches the rubric:

- **1.0**: Fully matches all rubric criteria
- **0.7-0.9**: Matches most criteria, minor issues
- **0.4-0.6**: Partial match, missing key information
- **0.0-0.3**: Significant errors or refusal to answer

Use the `threshold` parameter to set your acceptable score level.

## Troubleshooting

### "No provider with web search capabilities"

Ensure your grading provider supports web search. Default providers without web search configuration will fail. Check the [Grading Providers](#grading-providers) section above.

### Test always fails with refusal

If your SUT consistently refuses to answer real-time questions, this is expected behavior for models without web access. The `search-rubric` grader is correctly identifying that no factual answer was provided.

**Solutions:**

1. Use a model with web search capabilities as your SUT
2. Accept that models without real-time access cannot answer these questions
3. Use `llm-rubric` instead if you only need to verify the response format

### Inaccurate results

The grader relies on web search results, which may occasionally be wrong or ambiguous.

**Best practices:**

- Write rubrics that can be verified from multiple reputable sources
- Avoid rubrics about speculative or disputed claims
- Use appropriate thresholds (not 1.0) to allow for minor discrepancies

### High costs

Web search adds cost on top of model tokens.

**Cost reduction strategies:**

- Caching is enabled by default to reduce API calls
- Reserve `search-rubric` for tests that truly need real-time verification
- Use `llm-rubric` for static fact-checking that doesn't require current data
- Consider Perplexity's `sonar` model for built-in search without per-call fees
