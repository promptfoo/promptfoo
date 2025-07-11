# Research Verification Example

This example demonstrates how to use the `research-rubric` assertion to verify the accuracy of LLM outputs using web search.

## Overview

The `research-rubric` assertion uses web search to verify any type of claim or information:

1. Real-time information (weather, stock prices, current events)
2. Mathematical calculations and formulas
3. Historical facts and statistics
4. Citations and academic references
5. Any other verifiable information

## Key Features

- **Claim Extraction**: Automatically identifies all verifiable statements in the output
- **Web Search Verification**: Uses provider's web search to verify each claim
- **Flexible Rubrics**: Define custom verification criteria for different types of information
- **Confidence Scoring**: Provides confidence levels for each verification
- **Comparison Mode**: Compare providers with and without web search capabilities

## Running the Example

```bash
# Run with the default configuration
npx promptfoo@latest eval

# Run with specific cache settings
npx promptfoo@latest eval --no-cache

# View results in the web UI
npx promptfoo@latest view
```

## Configuration

The example includes:

- **Providers**: GPT-4o with web search and GPT-4o Mini without search
- **Test Cases**: Various types of information requiring verification
  - Current weather data
  - Mathematical calculations
  - Academic citations
  - Current events
  - Mixed factual information
- **Assertions**: Research rubrics tailored to each type of verification

## Understanding Results

The research-rubric assertion will:

1. Extract all verifiable claims from the output
2. Verify each claim using web search
3. Return a score based on accuracy
4. Provide detailed metadata about verifications

Look for the `metadata` field in results to see:

- `totalClaims`: Number of verifiable claims found
- `claimsVerified`: Number successfully verified
- `highConfidenceVerifications`: Claims verified with high confidence
- `verificationDetails`: Detailed results for each claim
- `failedClaims`: List of claims that couldn't be verified

Example result:

```json
{
  "pass": true,
  "score": 0.9,
  "reason": "9 out of 10 claims verified as accurate",
  "metadata": {
    "totalClaims": 10,
    "claimsVerified": 9,
    "verificationDetails": [
      {
        "claim": "The current temperature in NYC is 45°F",
        "verified": true,
        "evidence": "Weather data confirms 45°F in New York City",
        "confidence": "high"
      }
    ]
  }
}
```

## Use Cases

### Real-time Information

- Current weather conditions
- Stock prices and market data
- Sports scores and results
- News and current events

### Fact Checking

- Historical facts and dates
- Geographic information
- Scientific facts
- Statistical data

### Calculations

- Mathematical formulas
- Financial calculations
- Unit conversions
- Statistical analysis

### Academic Verification

- Citation accuracy
- Author names and publication dates
- Journal and conference names
- Research findings

## Customization

You can customize the rubric to:

- Focus on specific types of information
- Set accuracy tolerances (e.g., temperature within 5°F)
- Require certain facts to be mentioned
- Set different thresholds for different claim types

## Best Practices

1. **Be Specific**: Clear criteria lead to better verification
2. **Consider Timeliness**: Some data changes rapidly (weather, stocks)
3. **Set Tolerances**: Allow reasonable margins for measurements
4. **Use Thresholds**: Not all information may be web-verifiable

## Limitations

- Requires a provider with web search capabilities
- Web search has rate limits and costs
- Recent or specialized information may not be findable
- Some accurate information may not be easily verifiable online
- Private or paywalled content cannot be verified
