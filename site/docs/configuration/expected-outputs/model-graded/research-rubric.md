---
sidebar_label: Research Rubric
---

# Research-Rubric

The `research-rubric` assertion type evaluates outputs by using web search to verify the accuracy of claims, citations, and real-time information. It's like `llm-rubric` but with fact-checking capabilities.

## How it works

1. Your test provider generates output (can be any LLM, no web search required)
2. The grading provider (which must have web search capabilities) evaluates the output
3. The grader uses web search to verify:
   - Factual claims
   - Real-time information (weather, prices, news)
   - Mathematical calculations
   - Citations and references
4. Returns a pass/fail verdict with verification details

## Basic Usage

```yaml
assert:
  - type: research-rubric
    value: All factual claims must be accurate and verifiable
```

## Advanced Usage

```yaml
assert:
  - type: research-rubric
    value: |
      The response must:
      - Provide accurate current weather data
      - Include correct mathematical calculations
      - Cite real academic papers with correct details
    threshold: 0.9  # Require 90% accuracy score
```

## Grading Providers

The research-rubric requires a grading provider with web search capabilities. Currently supported providers include:

### 1. Perplexity (Built-in Web Search)

Perplexity models have web search built-in and work out of the box:

```yaml
grading:
  provider: perplexity:sonar
```

Available models:
- `perplexity:sonar` - Fast, general-purpose
- `perplexity:sonar-pro` - Higher quality
- `perplexity:sonar-reasoning` - Step-by-step reasoning
- `perplexity:sonar-deep-research` - In-depth research

### 2. Google Gemini (with Search Tools)

Google's Gemini models support web search through the `googleSearch` tool:

```yaml
grading:
  provider: google:gemini-2.0-flash
  providerOptions:
    config:
      tools:
        - googleSearch: {}
```

Or for Vertex AI:

```yaml
grading:
  provider: vertex:gemini-2.0-flash
  providerOptions:
    config:
      tools:
        - googleSearch: {}
```

### 3. xAI (with Search Parameters)

xAI models support web search through search parameters:

```yaml
grading:
  provider: xai:grok-2
  providerOptions:
    config:
      search_parameters:
        mode: on
```

## Examples

### Real-time Information

```yaml
tests:
  - vars:
      prompt: "What's the current stock price of AAPL?"
    assert:
      - type: research-rubric
        value: Must provide the actual current stock price within 1% accuracy
```

### Citation Verification

```yaml
tests:
  - vars:
      prompt: "Explain quantum computing and cite 3 recent papers"
    assert:
      - type: research-rubric
        value: |
          All citations must:
          - Be real papers that exist
          - Have correct author names
          - Be published in the last 5 years
          - Be relevant to quantum computing
```

### Mathematical Accuracy

```yaml
tests:
  - vars:
      prompt: "Calculate the area of a circle with radius 7.5 meters"
    assert:
      - type: research-rubric
        value: The calculation must be mathematically correct (approximately 176.71 m²)
```

### Current Events

```yaml
tests:
  - vars:
      prompt: "Who is the current president of France?"
    assert:
      - type: research-rubric
        value: Must correctly identify the current president
```

## Configuration

### Default Grading Provider

You can set a default grading provider for all research-rubric assertions:

```yaml
defaultTest:
  options:
    provider: perplexity:sonar
```

### Per-Test Grading

Override the grading provider for specific tests:

```yaml
tests:
  - vars:
      prompt: "Complex research question"
    assert:
      - type: research-rubric
        value: Must be thoroughly researched
        provider: perplexity:sonar-deep-research  # Use deep research model
```

## Output Format

The research-rubric assertion returns structured results including:

- `pass`: Boolean indicating if the evaluation passed
- `score`: Numeric score from 0.0 to 1.0
- `reason`: Detailed explanation of the evaluation
- `metadata`: Additional information including:
  - `verifiedClaims`: Array of claims that were successfully verified
  - `failedClaims`: Array of claims that were incorrect or unverifiable
  - `gradingProvider`: The provider used for grading
  - `hasWebSearch`: Always true for research-rubric

## Best Practices

1. **Be specific in your rubric**: Clearly state what needs to be verified
2. **Use appropriate graders**: Choose providers based on your needs:
   - Perplexity for general web search
   - Google for comprehensive search with citations
   - xAI for current events and social media context
3. **Set reasonable thresholds**: Not all information may be verifiable
4. **Consider costs**: Web search API calls may be more expensive than regular LLM calls

## Comparison with Other Assertions

| Assertion Type    | Web Search | Use Case                                              |
| ----------------- | ---------- | ----------------------------------------------------- |
| `llm-rubric`      | No         | General quality evaluation                            |
| `factuality`      | No         | Comparing against known correct answers               |
| `research-rubric` | Yes        | Verifying real-world accuracy and current information |

## Troubleshooting

### "No grading provider with web search capability found"

This error means none of the available providers support web search. Solutions:

1. Install and configure a supported provider (Perplexity, Google, xAI)
2. Explicitly set a grading provider with web search capabilities
3. Check that API keys are properly configured

### Web search not working

Ensure your provider is correctly configured:

- **Perplexity**: Just needs `PERPLEXITY_API_KEY`
- **Google**: Needs `GOOGLE_API_KEY` and tools configuration
- **xAI**: Needs `XAI_API_KEY` and search_parameters configuration

### Slow evaluation

Web search adds latency. Consider:
- Using faster models (e.g., `perplexity:sonar` vs `sonar-deep-research`)
- Caching results for repeated evaluations
- Running evaluations in parallel
