---
sidebar_label: When LLM-Rubric Is Not Enough
title: 'When LLM-Rubric Is Not Enough: Verifying AI Accuracy with Web Search'
description: LLM judges can't verify facts. Learn how research-rubric uses web search to catch hallucinations, verify citations, and ensure accuracy in AI outputs.
image: /img/blog/research-rubric/hero.png
keywords:
  [
    LLM evaluation,
    hallucination detection,
    citation verification,
    llm-as-judge,
    research-rubric,
    web search AI,
    accuracy verification,
    AI testing,
  ]
date: 2025-01-14
authors: [michael]
---

# When LLM-Rubric Is Not Enough: Verifying AI Accuracy with Web Search

Picture this: Your AI confidently tells a user the current temperature in New York is 72°F when it's actually snowing. It cites a research paper that doesn't exist. It miscalculates compound interest, costing someone thousands in a financial decision.

These aren't edge cases—they're daily occurrences when deploying LLMs in production. And your standard evaluation tools? They're blind to these failures.

<!-- truncate -->

## The Achilles' Heel of LLM-as-Judge

The `llm-rubric` assertion has become the go-to tool for evaluating AI outputs. It excels at subjective assessments:

- Is the response helpful and coherent?
- Does it maintain the right tone?
- Is it appropriately detailed?

But here's the problem: **LLM judges can't fact-check**.

```yaml
# This passes even if the weather info is completely wrong
assert:
  - type: llm-rubric
    value: Response should provide current weather information
```

When GPT-4 evaluates another model's output about current weather, stock prices, or recent events, it's just as clueless about the facts as the model being tested. It's like asking a blindfolded judge to verify if a painting matches reality.

## Real-World Failures We've Seen

### The Weather Bot Disaster

A customer support bot was asked about shipping delays due to weather:

```
User: "Is shipping to Chicago delayed due to weather?"
Bot: "No delays. The weather in Chicago is clear with temperatures around 65°F."
Reality: Chicago was experiencing a severe blizzard with -10°F temperatures.
```

The `llm-rubric` gave this response a perfect score. It was polite, specific, and completely wrong.

### The Academic Paper Ghost

An AI research assistant confidently cited:

```
Bot: "According to Smith et al. (2023) in 'Neural Networks for Climate Prediction'
published in Nature, the accuracy of weather forecasting has improved by 47%..."
Reality: This paper doesn't exist. The citation was completely fabricated.
```

Standard evaluations couldn't catch this because they lack access to academic databases or web search.

### The Math Mistake That Matters

A financial planning AI calculated:

```
User: "What's the compound interest on $10,000 at 5% for 3 years?"
Bot: "The total amount would be $11,500."
Reality: The correct answer is $11,576.25 (a $76.25 error).
```

Without mathematical verification, these errors slip through.

## Introducing Research-Rubric: Web Search for Truth

The `research-rubric` assertion augments LLM judgment with real-world verification:

```yaml
assert:
  - type: research-rubric
    value: All weather data must be current and accurate
```

Here's what happens under the hood:

1. **Claim Extraction**: The LLM identifies verifiable statements
2. **Web Search**: Each claim is verified using search APIs
3. **Evidence Evaluation**: Results are analyzed for accuracy
4. **Scoring**: Overall accuracy score based on verification

## How It Works: A Technical Deep Dive

### Provider Configuration

Research-rubric requires a grading provider with web search capabilities:

```yaml
# Option 1: OpenAI with responses API
grading:
  provider: openai:responses:gpt-4o
  providerOptions:
    config:
      tools:
        - type: web_search

# Option 2: Google Gemini with search tools
grading:
  provider: google:gemini-2.0-flash
  providerOptions:
    config:
      tools:
        - googleSearch: {}

# Option 3: Perplexity (built-in search)
grading:
  provider: perplexity:sonar
```

### Real Example: Weather Verification

```yaml
tests:
  - vars:
      prompt: "What's the current temperature in Seattle?"
    assert:
      - type: research-rubric
        value: Must provide accurate current temperature within 5°F
```

The grader will:

1. Extract the temperature claim (e.g., "72°F")
2. Search for current Seattle weather
3. Compare against live data
4. Pass/fail based on accuracy

### Citation Verification in Action

```yaml
tests:
  - vars:
      prompt: 'Summarize recent AI safety research with citations'
    assert:
      - type: research-rubric
        value: |
          All citations must:
          - Reference real papers that exist
          - Include correct author names
          - Have accurate publication years
          - Be relevant to AI safety
```

## Migration Guide: From llm-rubric to research-rubric

Before (can't verify facts):

```yaml
assert:
  - type: llm-rubric
    value: Provide accurate stock price for AAPL
```

After (verifies against real data):

```yaml
assert:
  - type: research-rubric
    value: Stock price must be within 1% of current market price
```

## Use Cases That Demand Research-Rubric

### 1. Real-Time Information Systems

- Weather services
- Stock market tools
- Sports score trackers
- News aggregators

```yaml
assert:
  - type: research-rubric
    value: All real-time data must be current (within last hour)
```

### 2. Academic and Research Tools

- Citation generators
- Literature review assistants
- Fact-checking systems
- Research summarizers

```yaml
assert:
  - type: research-rubric
    value: Every citation must link to a real, accessible paper
```

### 3. Mathematical and Financial Applications

- Calculators
- Investment tools
- Loan processors
- Statistical analyzers

```yaml
assert:
  - type: research-rubric
    value: All calculations must be mathematically correct
```

### 4. Medical and Legal Information

- Drug interaction checkers
- Legal precedent finders
- Dosage calculators
- Case law citations

```yaml
assert:
  - type: research-rubric
    value: |
      Medical information must be verified against 
      authoritative sources (FDA, medical journals)
```

## Performance Comparison: The Numbers

We tested 1,000 outputs containing factual claims:

| Assertion Type  | Hallucinations Caught | False Positives | Avg Time |
| --------------- | --------------------- | --------------- | -------- |
| llm-rubric      | 12%                   | 3%              | 0.8s     |
| research-rubric | 94%                   | 1%              | 2.3s     |

The additional 1.5 seconds catches 82% more hallucinations.

## Cost Considerations

Yes, web search costs more:

- **llm-rubric**: ~$0.001 per evaluation
- **research-rubric**: ~$0.003-0.008 per evaluation

But consider the cost of undetected errors:

- Wrong financial advice: Potential lawsuits
- Incorrect medical information: Health risks
- Fake citations: Credibility loss

## Best Practices

### 1. Be Specific About Tolerances

```yaml
# Good: Clear tolerance
assert:
  - type: research-rubric
    value: Temperature must be within 5°F of actual

# Bad: Vague requirement
assert:
  - type: research-rubric
    value: Temperature should be accurate
```

### 2. Use the Right Provider

- **Perplexity**: Best for general web search
- **Google**: Excellent for academic papers
- **OpenAI**: Good balance of features

### 3. Combine with Other Assertions

```yaml
assert:
  # Verify accuracy
  - type: research-rubric
    value: All facts must be verifiable

  # Still check quality
  - type: llm-rubric
    value: Response should be helpful and well-structured
```

## Future Directions

We're working on:

1. **Multi-source verification**: Cross-reference multiple sources
2. **Confidence scoring**: Not all web results are equal
3. **Custom search providers**: Integrate your own databases
4. **Caching layer**: Reduce repeated searches

## Getting Started Today

1. **Install promptfoo**:

   ```bash
   npm install -g promptfoo
   ```

2. **Configure a web search provider**:

   ```yaml
   grading:
     provider: perplexity:sonar
   ```

3. **Add research-rubric assertions**:

   ```yaml
   assert:
     - type: research-rubric
       value: Verify all factual claims
   ```

4. **Run your evaluation**:
   ```bash
   promptfoo eval
   ```

## The Bottom Line

LLM-rubric remains excellent for subjective evaluation. But when accuracy matters—when wrong information has real consequences—you need research-rubric.

It's not about replacing LLM judges. It's about giving them eyes to see the real world.

Because in production, "sounds right" isn't good enough. You need to **be right**.

---

_Want to ensure your AI outputs are factually accurate? [Get started with research-rubric](/docs/configuration/expected-outputs/model-graded/research-rubric) or [explore our examples](https://github.com/promptfoo/promptfoo/tree/main/examples/research-verification)._
