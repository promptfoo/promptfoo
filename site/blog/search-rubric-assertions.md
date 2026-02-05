---
title: 'Real-Time Fact Checking for LLM Outputs'
description: 'Promptfoo now supports web search in assertions, so you can verify time-sensitive information like stock prices, weather, and case citations during testing.'
image: /img/blog/search-rubric-assertions/title.jpg
image_alt: 'Search rubric assertion verifying current information'
slug: llm-search-rubric-assertions
keywords: [promptfoo, LLM testing, web search, fact checking, real-time verification, assertions]
date: 2025-11-28
authors: [michael]
tags: [feature-announcement, evaluation, best-practices]
---

# Real-Time Fact Checking for LLM Outputs

In mid-2025, two U.S. federal judges withdrew or corrected written opinions after lawyers noticed that the decisions quoted cases and language that did not exist. In one chambers, draft research produced using generative AI had slipped into a published ruling. ([Reuters](https://www.reuters.com/legal/government/two-us-judges-withdraw-rulings-after-attorneys-question-accuracy-2025-07-29/))

None of these errors looked obviously wrong on the page. They read like normal legal prose until someone checked the underlying facts.

This is the core problem: LLMs sound confident even when they are wrong or stale. Traditional assertions can check format and style, but they cannot independently verify that an answer matches the world **right now**.

Promptfoo's new [`search-rubric`](/docs/configuration/expected-outputs/model-graded/search-rubric) assertion does that. It lets a separate "judge" model with web search verify time-sensitive facts in your evals.

<!-- truncate -->

## Why static evals are no longer enough

A few years ago, "does this answer look reasonable" was often good enough. Today, people use LLMs to:

- Show current stock prices in customer-facing UIs
- Explain the latest FDA approvals to patients
- Summarize legal or policy changes
- Recommend SDKs or APIs that ship new versions every few months

Models trained on 2024 or early 2025 data will happily answer questions about:

- Who won the 2024 U.S. presidential election (Donald Trump) ([Wikipedia](https://en.wikipedia.org/wiki/2024_United_States_presidential_election))
- Who won Super Bowl LVIII (Kansas City Chiefs over the 49ers, 25-22 in OT) ([Wikipedia](https://en.wikipedia.org/wiki/Super_Bowl_LVIII))
- When Leqembi received FDA approval for Alzheimer's (accelerated approval in January 2023, traditional approval in July 2023) ([FDA](https://www.fda.gov/news-events/press-announcements/fda-converts-novel-alzheimers-disease-treatment-traditional-approval))

But you cannot trust them to know:

- Today's NVDA price
- The latest Node.js LTS (Node 24.x as of late 2025) ([Node.js](https://nodejs.org/en/about/previous-releases))
- Whether a given case citation or regulation is still good law

You need a way to **systematically** check that kind of answer against the web while you run evals and CI.

That is what `search-rubric` is for.

---

## What `search-rubric` actually does

Conceptually, [`search-rubric`](/docs/configuration/expected-outputs/model-graded/search-rubric) is [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) plus a search-enabled judge model.

At a high level:

1. Your system under test (SUT) produces an output.
2. You give Promptfoo a rubric like:
   `"Provides the current AAPL stock price within 2% and includes the currency."`
3. Promptfoo sends the SUT output and rubric to a grading model that has web search turned on.
4. The grading model decides when to call search based on the rubric.
5. It returns a JSON object like `{ pass: boolean, score: number, reason: string }`.

You do not write any of the search logic yourself. You just describe what "correct enough" means.

### Minimal example

```yaml title="promptfooconfig.yaml"
prompts:
  - 'What is the current stock price of {{company}}?'

providers:
  - openai:gpt-4o-mini

tests:
  - vars:
      company: Apple
      ticker: AAPL
    assert:
      - type: search-rubric
        value: |
          States the current {{ticker}} stock price that:
          1. Is within 3% of the actual market price
          2. Includes the currency (USD or $)
          3. Mentions if the market is currently open or closed
        threshold: 0.8
```

When this runs, Promptfoo uses a separate search-enabled model as the grader. If the SUT hallucinates or returns a stale training-data price, the assertion fails with an explanation.

**What to expect:** Models like `gpt-4o-mini` without web search will often refuse to answer real-time questions ("I don't have access to real-time data"). The search-rubric grader correctly flags this as a failure since no actual price was provided. To test models that confidently answer (and potentially hallucinate), use a more capable model or one with web search enabled as the SUT.

---

## How it works under the hood

For people who care about the plumbing:

### 1. You write a rubric

```yaml
- type: search-rubric
  value: 'Names Satya Nadella as the current CEO of Microsoft'
```

### 2. Promptfoo picks a grading provider

It prefers a provider with web search configured:

- Your explicit `grading.provider`, if set
- Otherwise a default "web search provider" inferred from API keys
- If that fails, it tries to auto-load a search-capable provider such as:
  - `anthropic:messages:claude-opus-4-5-20251101` with `web_search_20250305`
  - `openai:responses:gpt-5.1` with `web_search_preview`
  - `google:gemini-3-pro-preview` with `googleSearch`
  - `perplexity:sonar-pro` (built-in search)
  - `xai:grok-4-1-fast-reasoning` with live search enabled

### 3. It sends a grading prompt

Internally, Promptfoo uses a web-search-aware rubric prompt that looks roughly like:

```
You are grading output according to a user-specified rubric. You may search
the web to check current information. Respond with:
{ "reason": string, "pass": boolean, "score": number }
```

The model receives:

```
<Output>
{{output}}
</Output>
<Rubric>
{{rubric}}
</Rubric>
```

### 4. The grading model searches when needed

The prompt instructs the grader to call web search when the rubric references:

- Current prices or weather
- "Latest" or "current" versions
- News, elections, or other time-sensitive facts

### 5. Promptfoo parses the JSON result

- `pass` is a boolean decision.
- `score` is a 0.0-1.0 confidence score.
- You can enforce a `threshold` on the score.
- The raw `reason` and optional search metadata are stored on the assertion.

This is deliberately simple. The judge model is an agent with exactly one job: check whether the answer is consistent with reality as seen on the web, under a rubric you define.

---

## When to use [`search-rubric`](/docs/configuration/expected-outputs/model-graded/search-rubric) vs [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric)

You should not turn on search for every test. It adds latency and cost. Use it where the world moves fast.

| Use case                               | Prefer [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) | Prefer [`search-rubric`](/docs/configuration/expected-outputs/model-graded/search-rubric) |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tone, UX copy, narrative quality       | ✓                                                                                   |                                                                                           |
| Prompt adherence, safety, style checks | ✓                                                                                   |                                                                                           |
| Static APIs, math, pure reasoning      | ✓                                                                                   |                                                                                           |
| Stock prices, FX, crypto               |                                                                                     | ✓                                                                                         |
| Current weather and travel conditions  |                                                                                     | ✓                                                                                         |
| Latest software versions (Node, React) |                                                                                     | ✓                                                                                         |
| Case citations and regulations         |                                                                                     | ✓                                                                                         |
| "Who won...?" style news questions     |                                                                                     | ✓                                                                                         |

A practical pattern is:

- Use [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) for most qualitative checks.
- Add [`search-rubric`](/docs/configuration/expected-outputs/model-graded/search-rubric) only for tests that intentionally touch the outside world.

---

## Concrete examples

Here are some real-world patterns where hallucinations hurt, and how `search-rubric` handles them.

### 1. Financial data

```yaml
# Verify real-time S&P 500 data
assert:
  - type: search-rubric
    value: |
      Provides S&P 500 index value that:
      - Is within 1% of the current market value
      - States whether markets are open or closed
      - Mentions the time reference (for example, "as of 10:32 ET")
    threshold: 0.9
```

If the model grabs last Friday's close while markets are moving, the assertion fails and the grader explains why.

### 2. Legal citations

There are now multiple public cases of fake citations entering court filings and even judicial opinions through misuse of AI.

```yaml
assert:
  - type: search-rubric
    value: |
      Correctly describes Miranda v. Arizona including:
      - Accurate citation (384 U.S. 436)
      - Correct year (1966)
      - Core holding on the right to remain silent
```

If the answer invents a citation or misstates the holding, the search-enabled grader should catch it.

### 3. Healthcare claims

```yaml
assert:
  - type: search-rubric
    value: |
      States the FDA approval timeline for Leqembi that:
      - Notes accelerated approval in January 2023
      - Notes traditional approval in July 2023
      - Describes its use for early-stage Alzheimer's disease
    threshold: 0.9
```

Because the rubric encodes the expected timeline, the grader must confirm the dates against current FDA or reputable medical sources.

### 4. Software versions

Node.js LTS moves quickly. As of late 2025, Node 24.x is the newest Active LTS release, and older LTS lines like 22.x and 20.x are in Maintenance LTS rather than the recommended track for new projects. ([Node.js](https://nodejs.org/en/about/previous-releases))

```yaml
assert:
  - type: search-rubric
    value: |
      Names a current Node.js LTS version and:
      - Identifies it as an LTS release
      - Does not recommend an end-of-life version
```

This catches answers like "Node 18 is the latest LTS" that look reasonable but are wrong in 2025.

---

## Supported providers and current pricing

You can use any provider that can both:

1. Act as a general purpose grader model
2. Call out to web search from the API

By late 2025, all of the major model providers had some flavor of first-class web search or grounding API, each with its own pricing line item. That is great for capabilities, but it also means your evals need to understand when they are exercising these tools and whether they are returning current, correct information.

As of November 2025:

### Anthropic Claude 4 and 4.5

- Web search is exposed as the `web_search_20250305` tool on the API. ([Anthropic](https://www.anthropic.com/news/web-search-api))
- Pricing is currently **$10 per 1,000 search calls**, plus the usual token costs for models like Claude 4 Sonnet and Claude 4 Opus. ([Simon Willison](https://simonwillison.net/2025/May/7/anthropic-api-search/))

### OpenAI (Responses API)

- Web search is exposed as a built-in tool (`web_search` and `web_search_preview`) on the Responses API.
- Web search tool calls are priced separately from tokens:
  - **$10 per 1,000 calls** for the main web search tool
  - **$10-25 per 1,000 calls** for preview variants, with different rules for search content tokens ([OpenAI Pricing](https://openai.com/api/pricing/))

### Google Gemini / Vertex AI

- Gemini 2.5 and Gemini 3 series models can ground responses with the `googleSearch` tool.
- Grounding with Google Search on the Gemini API is billed per grounded prompt after a free daily quota, currently **$35 per 1,000 grounded prompts**. Vertex AI's enterprise Web Grounding is **$45 per 1,000 grounded prompts**. ([Google AI Pricing](https://ai.google.dev/gemini-api/docs/pricing))

### Perplexity

- Sonar models expose search as part of the API with per-request plus token-based pricing. Check [Perplexity's pricing page](https://docs.perplexity.ai/getting-started/pricing) for current rates.

### xAI Grok

- Grok 4.1 Fast Reasoning supports "live search" with configuration via `search_parameters`.
- Live search is currently priced at roughly **$25 per 1,000 sources**, plus token usage. ([xAI Docs](https://docs.x.ai/docs/guides/live-search))

Prices change, so treat these as ballpark numbers and always check the provider's official pricing page before wiring this into a large CI suite.

---

## Configuring grading in Promptfoo

You have two knobs:

1. Which model grades the test
2. Whether that model has search enabled

### Explicit grading provider

```yaml
grading:
  provider: openai:responses:gpt-5.1
  providerOptions:
    config:
      tools:
        - type: web_search_preview

tests:
  - prompt: 'What is the weather in Tokyo right now?'
    assert:
      - type: search-rubric
        value: |
          Describes current Tokyo weather including:
          - Temperature with units (C or F)
          - General conditions (for example, sunny, cloudy, rainy)
          - Any active weather warnings if present
```

### Relying on defaults

If you do not specify a `grading.provider`, Promptfoo will try to pick a sensible default based on available API keys and built-in defaults:

- If you have OpenAI configured, it prefers a Responses model with web search.
- If you have Anthropic configured, it may default to a Claude 4 or 4.5 model with `web_search_20250305`.
- Otherwise it falls back to Perplexity, Gemini, or xAI if available.

If no search-capable provider can be found, `search-rubric` will throw a clear error instead of silently ignoring web search.

---

## Performance and cost in practice

Every `search-rubric` assertion involves:

1. One SUT call (your normal model invocation).
2. One grading call to a separate model.
3. Zero or more web search tool calls inside that grading call.

Typical impact in a CI environment:

- **Latency**: grading plus search tends to add 2-5 seconds per assertion in our experience, depending on provider and network.
- **Cost**:
  - Judge model tokens, often on a capable model like GPT-5.1 or Claude 4.5 Opus.
  - Web search tool calls at roughly $5-35 per 1,000 uses depending on provider and configuration.

That sounds expensive, but you rarely need search for all tests. For example, a 100-test suite where 20 tests use `search-rubric` is usually a few dollars per run, even on top tier models.

During development, you can enable caching:

```bash
promptfoo eval --cache
```

Promptfoo will reuse previous grading outputs so you do not pay or wait for repeated web searches while you iterate.

---

## Failure modes and gotchas

This is the part HN will reasonably worry about.

### 1. Search results can be wrong or ambiguous

`search-rubric` is only as good as the search index behind your provider. You should:

- Prefer rubrics that can be answered from multiple reputable sources.
- Avoid rubrics that ask for speculative or disputed claims.

### 2. You still have to define "close enough"

Rubrics like "within 5 percent of the current BTC price" or "names at least two recent vulnerabilities from the last year" force you to make your own tradeoffs explicit.

That is a feature, but it takes work.

### 3. Cost scales with naively written tests

A suite that hits web search 500 times on every CI run will cost real money. Start with a handful of critical paths, then expand.

### 4. The grader is still an LLM

The grader is still an LLM with its own failure modes. Search reduces hallucinations but does not eliminate them. Use `threshold` to require a high score for sensitive checks, and keep some non-LLM assertions in place.

---

## Getting started

From scratch:

```bash
npm install -g promptfoo@latest

# or, if you use npx
npx promptfoo init
```

Then add a simple search-backed check:

```yaml title="simple-search-test.yaml"
prompts:
  - 'The CEO of Microsoft is {{name}}'

providers:
  - id: openai:gpt-5.1

grading:
  provider: anthropic:messages:claude-opus-4-5-20251101
  providerOptions:
    config:
      tools:
        - type: web_search_20250305
          name: web_search
          max_uses: 5

tests:
  - vars:
      name: 'Satya Nadella'
    assert:
      - type: search-rubric
        value: 'Confirms that {{name}} is the current CEO of Microsoft'

  - vars:
      name: 'Bill Gates' # Intentionally wrong
    assert:
      - type: search-rubric
        value: 'States the correct current CEO of Microsoft and identifies this answer as incorrect'
        threshold: 0.8
```

Run it:

```bash
npx promptfoo eval -c simple-search-test.yaml
```

You will see not just pass or fail, but detailed reasons from the grading model about what it found on the web.

---

## Where this fits in the bigger picture

Search-backed grading is not a silver bullet. It will not stop people from misusing AI in production or copying answers blindly into court filings.

What it does give you is a repeatable way to say:

> "For this class of prompts, the answers are checked against the real world every time we run CI."

That turns "trust me, it usually works" into something closer to an actual contract.

You can read the full configuration reference in the [Search-Rubric documentation](/docs/configuration/expected-outputs/model-graded/search-rubric). If you ship anything where incorrect real-world facts cost money, reputation, or legal risk, it is worth wiring at least a handful of these tests into your pipeline.

<script type="application/ld+json" dangerouslySetInnerHTML={{__html: `
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Real-Time Fact Checking for LLM Outputs",
  "datePublished": "2025-11-28",
  "author": {
    "@type": "Person",
    "name": "Michael"
  },
  "keywords": "LLM testing, web search, fact checking, real-time verification",
  "description": "Promptfoo's search-rubric assertion uses models with web search to verify time-sensitive facts like stock prices, weather, software versions, and legal citations during testing."
}
`}} />
