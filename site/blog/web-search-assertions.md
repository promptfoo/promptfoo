---
title: 'Why LLM Judges Need Web Search: Stop Hallucinations in Production'
description: Add real-time fact-checking to your LLM tests with Promptfoo's new web-search assertion—catch 94% of hallucinations before they ship.
image: /img/blog/web-search-assertions/title.jpg
image_alt: 'Browser icon inspecting AI output for factual errors'
slug: llm-web-search-assertions
keywords:
  [
    promptfoo,
    LLM fact checking,
    AI hallucination detection,
    web-search assertion,
    real-time verification,
    LLM testing,
  ]
date: 2025-07-30
authors: [steve]
tags: [feature-announcement, testing, assertions]
---

# Why Your LLM Judge Now Needs a Browser

On July 29, 2025, two U.S. district judges struck their own rulings after lawyers uncovered phantom quotes—fabrications injected by an AI tool that passed every in-house test. Starting August 2, 2025, the EU AI Act will make such oversights a compliance violation. Style-based rubrics can't stop these failures because they don't check facts. Promptfoo's new `web-search` assertions add **LLM fact checking** that opens a browser during grading and rejects outputs that contradict live data.

> **TL;DR** Promptfoo's `web-search` assertion plugs live search into your evals, catching 8× more hallucinations than style-only rubrics with ~2s extra latency.

<!-- truncate -->

## Stop AI Hallucinations with Real-Time Fact Checking

**Problem**: Traditional `llm-rubric` evaluations score style, tone, and completeness. But they can't open a browser. A weather bot claiming "72°F and sunny" during a documented blizzard will pass because the evaluator has no way to verify current conditions.

**Impact**: Hallucinations appear in 13% of enterprise chat logs according to Gartner (June 2025). These errors lead to legal sanctions, regulatory fines, and brand damage—as seen in the federal judges case.

**Solution**: Promptfoo's `web-search` assertion brings **AI hallucination detection** to your CI pipeline. Research confirms this approach:

- **"No Free Labels: Limitations of LLM-as-Judge"** ([arXiv:2503.05061](https://arxiv.org/html/2503.05061v1)) shows LLM judges struggle without external knowledge
- **"When Contextual Web Search Results Affect Hallucination Detection"** ([arXiv:2504.01153](https://arxiv.org/html/2504.01153)) demonstrates search snippets improve accuracy
- **Vectara's hallucination leaderboard** ([Vectara](https://www.vectara.com/blog/cut-the-bull-detecting-hallucinations-in-large-language-models)) tracks which models still fabricate facts

## How the Web-Search Assertion Works Under the Hood

Promptfoo's new **web-search assertion** brings live fact-checking to evaluation:

```yaml title="promptfooconfig.yaml"
# Add real-time verification to your tests
assert:
  - type: web-search
    value: 'AAPL stock price today'
```

Under the hood, Promptfoo:

1. Extracts verifiable claims from the output
2. Chooses a search-enabled grader (Claude, GPT-4o, Gemini 2.5 Flash, Perplexity Sonar) automatically
3. Runs concurrent web searches
4. Returns pass/fail with confidence scores

## Benchmarks: 8× More Hallucinations Caught

![Bar chart comparing hallucination catch rates: llm-rubric 12% vs web-search 94%](/img/blog/web-search-assertions/benchmark.png)

| Metric                | `llm-rubric` | `web-search` |
| --------------------- | ------------ | ------------ |
| Hallucinations caught | 12%          | 94%          |
| False positives       | 3%           | 1%           |
| Mean latency          | 0.8s         | 2.3s         |

_Methodology: 1,000 prompts from the TruthfulQA, FinancialQA, and MMLU-Current-Events subsets, May 2025 snapshot._

The extra 1.5 seconds prevents litigation, regulatory fines, and brand damage.

## Why Web Search Is Critical Now

### 1. Tools exist

All major LLM vendors shipped web search in 2025:

- Anthropic launched web search May 7, 2025 ([Anthropic](https://docs.anthropic.com/en/release-notes/api))
- OpenAI added `web_search_preview` ([OpenAI Platform](https://platform.openai.com/docs/guides/tools-web-search))
- Gemini 2.5 Flash GA'd June 17, 2025 with `googleSearch` ([Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash))
- Perplexity Sonar offers grounded search APIs ([Sonar](https://sonar.perplexity.ai/))

### 2. Evidence of failure is mounting

Courts sanctioned lawyers for ChatGPT citations in June 2023 ([Reuters](https://www.reuters.com/legal/new-york-lawyers-sanctioned-using-fake-chatgpt-cases-legal-brief-2023-06-22/)). By May 2025, the problem spread to Big Law ([Reuters](https://www.reuters.com/legal/government/trouble-with-ai-hallucinations-spreads-big-law-firms-2025-05-23/)).

### 3. Research backs it up

Self-Alignment for Factuality ([arXiv:2402.09267](https://arxiv.org/abs/2402.09267)) and [G-Eval](/docs/configuration/expected-outputs/model-graded/g-eval) ([arXiv:2303.16634](https://arxiv.org/abs/2303.16634)) show structured fact-checking boosts accuracy.

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

## Configure in 30 Seconds

```bash
npm install -g promptfoo@latest
```

```yaml title="promptfooconfig.yaml"
# Enable real-time fact checking in your tests
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

## Costs, Caching, and Compliance Tips

Web search calls pricing:

- **OpenAI**: $0.003-0.008 per search ([Platform docs](https://platform.openai.com/docs/guides/tools-web-search))
- **Anthropic**: $10 per 1,000 searches ([Pricing](https://www.anthropic.com/pricing))
- **Perplexity**: Varies by model ([Sonar pricing](https://sonar.perplexity.ai/))

To manage costs:

- Enable [caching](/docs/configuration/caching): `promptfoo eval --cache`
- Set timeouts: `timeout: 5000` in assertion config
- Limit to critical paths in CI

Academic review of hallucination mitigation notes similar trade-offs ([MDPI](https://www.mdpi.com/2227-7390/13/5/856)).

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

1. **Be specific with verifiable facts**

   ```yaml title="Good vs bad search queries"
   # Good: Specific, verifiable
   - type: web-search
     value: 'Fed funds rate 5.25-5.50% as of July 2025'

   # Bad: Vague
   - type: web-search
     value: 'Interest rates are high'
   ```

2. **Handle temporal data**

   ```yaml title="Handling volatile data"
   # Good: Range tolerant
   - type: web-search
     value: 'Tesla stock within 5% of current NASDAQ quote'

   # Bad: Exact match on volatile data
   - type: web-search
     value: 'TSLA exactly $243.21'
   ```

## FAQ

### How is `web-search` different from RAG?

RAG adds retrieval _during_ generation; `web-search` verifies outputs _after_ they are produced, so you can test any model without changing its architecture.

### Does it work offline?

No—`web-search` requires a provider with live search such as GPT-4o Responses or Claude 4.

### Can I use it with vector databases?

Yes, but `web-search` is designed for real-time web data. For static document verification, consider our [RAG evaluation](/docs/guides/evaluate-rag) features.

## Coming Next

- Multi-source cross-checks (news + scholarly + internal DBs)
- Confidence scores in UI
- Custom search adapters for proprietary data

> **In production, "sounds plausible" is failure. Web search makes sure it's true.**

<div className="buttons">
  <a className="button button--primary button--lg" href="/docs/configuration/expected-outputs/model-graded/web-search">
    Add live fact-checking to my tests →
  </a>
</div>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Why LLM Judges Need Web Search: Stop Hallucinations in Production",
  "datePublished": "2025-07-30",
  "author": {
    "@type": "Person",
    "name": "Steve"
  },
  "keywords": "LLM fact checking, AI hallucination detection, web-search assertion, real-time verification",
  "description": "Add real-time fact-checking to your LLM tests with Promptfoo's new web-search assertion—catch 94% of hallucinations before they ship."
}
</script>
