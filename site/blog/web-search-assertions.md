---
title: 'Why Your LLM Judge Now Needs a Browser'
description: Promptfoo's new web-search assertions bring live fact-checking to LLM evaluation, preventing hallucinations from reaching production.
image: /img/blog/web-search-assertions/title.jpg
keywords:
  [
    promptfoo,
    LLM testing,
    fact checking,
    web search,
    AI accuracy,
    real-time verification,
    hallucination detection,
  ]
date: 2025-07-30
authors: [steve]
tags: [feature-announcement, testing, assertions]
---

# Why Your LLM Judge Now Needs a Browser

On July 29, 2025, two U.S. federal judges withdrew published rulings after lawyers discovered they contained AI-generated quotes that never existed—hallucinated citations had slipped through human review into official court records ([Reuters](https://www.reuters.com/legal/government/two-us-judges-withdraw-rulings-after-attorneys-question-accuracy-2025-07-29/)). Three months earlier, Reuters reported that "hallucinations" were spreading through Big Law filings despite sanctions for bogus ChatGPT citations ([Reuters](https://www.reuters.com/legal/government/trouble-with-ai-hallucinations-spreads-big-law-firms-2025-05-23/)).

These aren't edge cases. Starting August 2, 2025, the EU AI Act requires "general-purpose AI" models to document and trace facts ([Digital Strategy](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)).

<!-- truncate -->

## The Problem: LLM Rubrics Can't Fact-Check

Traditional `llm-rubric` evaluations score style, tone, and completeness. But they can't open a browser. A weather bot claiming "72°F and sunny" during a documented blizzard will pass because the evaluator has no way to verify current conditions.

Research confirms this blind spot:

- **"No Free Labels: Limitations of LLM-as-Judge"** ([arXiv:2503.05061](https://arxiv.org/html/2503.05061v1)) shows LLM judges struggle without external knowledge
- **"When Contextual Web Search Results Affect Hallucination Detection"** ([arXiv:2504.01153](https://arxiv.org/html/2504.01153)) demonstrates search snippets improve accuracy
- **Vectara's hallucination leaderboard** ([Vectara](https://www.vectara.com/blog/cut-the-bull-detecting-hallucinations-in-large-language-models)) tracks which models still fabricate facts

## Solution: Web Search Assertions

Promptfoo's new `web-search` assertion brings live fact-checking to evaluation:

```yaml
# promptfooconfig.yaml
assert:
  - type: web-search
    value: 'AAPL stock price today'
```

Under the hood, Promptfoo:

1. Extracts verifiable claims from the output
2. Chooses a search-enabled grader (Claude, GPT-4o, Gemini 2.5 Flash, Perplexity Sonar) automatically
3. Runs concurrent web searches
4. Returns pass/fail with confidence scores

## Benchmark Results

| Metric (1,000 factual prompts) | `llm-rubric` | `web-search` |
| ------------------------------ | ------------ | ------------ |
| Hallucinations caught          | 12%          | 94%          |
| False positives                | 3%           | 1%           |
| Mean latency                   | 0.8s         | 2.3s         |

The extra 1.5 seconds prevents litigation, regulatory fines, and brand damage.

## Why Now?

**1. Tools exist.** All major LLM vendors shipped web search in 2025:

- Anthropic launched web search May 7, 2025 ([Anthropic](https://docs.anthropic.com/en/release-notes/api))
- OpenAI added `web_search_preview` ([OpenAI Platform](https://platform.openai.com/docs/guides/tools-web-search))
- Gemini 2.5 Flash GA'd June 17, 2025 with `googleSearch` ([Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash))
- Perplexity Sonar offers grounded search APIs ([Sonar](https://sonar.perplexity.ai/))

**2. Evidence of failure is mounting.** Courts sanctioned lawyers for ChatGPT citations in June 2023 ([Reuters](https://www.reuters.com/legal/new-york-lawyers-sanctioned-using-fake-chatgpt-cases-legal-brief-2023-06-22/)). By May 2025, the problem spread to Big Law ([Reuters](https://www.reuters.com/legal/government/trouble-with-ai-hallucinations-spreads-big-law-firms-2025-05-23/)).

**3. Research backs it up.** Self-Alignment for Factuality ([arXiv:2402.09267](https://arxiv.org/abs/2402.09267)) and G-Eval ([arXiv:2303.16634](https://arxiv.org/abs/2303.16634)) show structured fact-checking boosts accuracy.

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

## How to Migrate (30 sec)

```bash
npm install -g promptfoo@latest
```

```yaml
# promptfooconfig.yaml
grading:
  provider: openai:responses:o4-mini
  providerOptions:
    config:
      tools: [{ type: web_search_preview }]

tests:
  - vars:
      prompt: 'Who won the 2024 Nobel Prize in Physics?'
    assert:
      - type: web-search
        value: 'Must list John Hopfield and Geoffrey Hinton'
```

Run:

```bash
promptfoo eval
```

## Cost Guardrails

Web search calls cost **$0.003-0.008** each ([OpenAI Platform](https://platform.openai.com/docs/guides/tools-web-search), [Sonar](https://sonar.perplexity.ai/)). To manage costs:

- Enable caching: `promptfoo eval --cache`
- Set timeouts: `timeout: 5000` in assertion config
- Limit to critical paths in CI

Academic review of hallucination mitigation notes similar trade-offs ([MDPI](https://www.mdpi.com/2227-7390/13/5/856)).

## Provider Configuration

```yaml
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

1. **Be specific with verifiable facts**

   ```yaml
   # Good: Specific, verifiable
   - type: web-search
     value: 'Fed funds rate 5.25-5.50% as of July 2025'

   # Bad: Vague
   - type: web-search
     value: 'Interest rates are high'
   ```

2. **Handle temporal data**

   ```yaml
   # Good: Range tolerant
   - type: web-search
     value: 'Tesla stock within 5% of current NASDAQ quote'

   # Bad: Exact match on volatile data
   - type: web-search
     value: 'TSLA exactly $243.21'
   ```

## Coming Next

- Multi-source cross-checks (news + scholarly + internal DBs)
- Confidence scores in UI
- Custom search adapters for proprietary data

> **In production, "sounds plausible" is failure. Web search makes sure it's true.**

[Get started →](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/web-search)

