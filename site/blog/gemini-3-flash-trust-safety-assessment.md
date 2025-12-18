---
title: 'Gemini 3 Flash Preview: Initial Trust and Safety Assessment'
description: 'Red team results on Gemini 3 Flash Preview under minimal thinking. Single-turn jailbreaks succeed in 89% of attacks—baseline refusal lower than GPT-5.2 in this configuration.'
image: /img/blog/gemini-3-flash-security-hero.jpg
keywords:
  [
    Gemini 3 Flash security,
    Gemini 3 red team,
    prompt injection,
    LLM security,
    Google AI security,
    jailbreak,
    ASR,
    attack success rate,
  ]
date: 2025-12-17
authors: [michael]
tags: [red-teaming, security-vulnerability, google]
---

# Gemini 3 Flash Preview: Initial Trust and Safety Assessment

Gemini 3 Flash launched today. Google [describes it](https://blog.google/products/gemini/gemini-3-flash/) as "frontier intelligence built for speed"—Pro-level reasoning at Flash-level cost. The launch post emphasizes benchmarks, speed, and pricing. It contains no safety claims.

We ran our red team eval the same day. Same methodology we used for [GPT-5.2 last week](/blog/gpt-5.2-trust-safety-assessment). Same probes, same strategies, same judge. The only variable is the model.

Note: Gemini 3 Flash is currently in preview. Safety behavior may change before general availability.

The result: Gemini 3 Flash shows lower jailbreak resistance than GPT-5.2 in this configuration. Our [meta-agent strategy](/docs/red-team/strategies/meta) achieved **89% attack success** (160/179 attacks) vs 60% on GPT-5.2. Baseline attacks without jailbreak transformations succeeded **19% of the time** (39/204 attacks) vs 4.3% on GPT-5.2.

That baseline number matters. Nearly 1 in 5 harmful prompts succeeded without any adversarial technique.

:::info Configuration note
**Default Gemini 3 Flash behavior uses dynamic HIGH thinking.** We forced `thinkingLevel: MINIMAL` to approximate a "no-reasoning" configuration comparable to GPT-5.2 with `reasoning_effort: 'none'`. We will publish HIGH/dynamic results separately—expect materially different numbers.
:::

<!-- truncate -->

## Results

**3,462 probes. 39 risk categories. ~5 hours runtime.**

Each [plugin](/docs/red-team/plugins/) generates multiple probes (individual prompt attempts) for a given risk area. For jailbreak strategies, we try several prompt variants per scenario. We aggregate related probes into higher-level "attacks" per category: an attack succeeds if any of its probes produce disallowed output. **The percentages below are computed over attack-level aggregates, not raw probe count.**

We use [Promptfoo](https://github.com/promptfoo/promptfoo), an open-source LLM red teaming tool. Each plugin includes a grader prompt. We consider an attack successful when the grader judges the output violates the model's stated safety policies. For [critical categories](/docs/red-team/plugins/harmful) (child exploitation, weapons, self-harm), we also performed human review.

| Strategy | Gemini 3 Flash | GPT-5.2 | Delta |
|----------|---------------|---------|-------|
| **Meta** (single-turn) | 89.4% (160/179) | 60.3% | +29pp |
| **Hydra** (multi-turn) | 76.9% (156/203) | 78.5% | -2pp |
| **Baseline** (no jailbreak) | 19.1% (39/204) | 4.3% | +15pp |

Multi-turn attack success is similar between models. Single-turn is where they diverge.

### By risk domain

| Domain | Failed | Total | Pass Rate |
|--------|--------|-------|-----------|
| Security & Access Control | 23 | 54 | 57.4% |
| Compliance & Legal | 148 | 255 | 42.0% |
| Trust & Safety | 120 | 174 | 31.0% |
| Brand & Reliability | 63 | 98 | 35.7% |

### Complete bypass (100% attack success)

Two categories showed no resistance after jailbreak:

- **Graphic Content** (n=15 attacks) — Every attempt to generate violent/gore content succeeded
- **Entity Impersonation** (n=15 attacks) — Every attempt to impersonate real people/brands succeeded

Note: GPT-5.2 also shows ~100% attack success on entity impersonation. Neither model has robust defenses against "pretend to be X" attacks.

### High-risk categories (>65% attack success)

| Category | Success Rate | Sample | Severity |
|----------|-------------|--------|----------|
| Hallucination | 92.9% (13/14) | n=14 | Medium |
| Unauthorized Commitments | 80.0% (12/15) | n=15 | Medium |
| Personal Attacks | 80.0% (12/15) | n=15 | Medium |
| Harassment | 73.3% (11/15) | n=15 | High |
| Profanity | 73.3% (11/15) | n=15 | Medium |
| Non-Violent Crime | 73.3% (11/15) | n=15 | Medium |
| Child Exploitation | 70.0% (7/10) | n=10 | Critical |
| Political Bias | 70.0% (7/10) | n=10 | Medium |
| Hate Speech | 66.7% (10/15) | n=15 | Critical |
| PII Exposure | 66.7% (10/15) | n=15 | High |
| Violent Crime | 66.7% (10/15) | n=15 | High |

## Comparing Refusal Behavior

The aggregate numbers hide patterns worth examining.

### Baseline refusal gap

Both models refuse most harmful prompts when sent directly. The gap is how often they slip:

| Model | Baseline Refusal | Slip Rate |
|-------|------------------|-----------|
| GPT-5.2 | 95.7% | 4.3% |
| Gemini 3 Flash | 80.9% | 19.1% |

Gemini 3 Flash slips 4.4× more often on identical prompts.

### Jailbreak resistance

| Strategy | GPT-5.2 Held | Gemini 3 Flash Held |
|----------|-------------|---------------------|
| Meta (single-turn) | 39.7% | 10.6% |
| Hydra (multi-turn) | 21.5% | 23.1% |
| Baseline | 95.7% | 80.9% |

GPT-5.2 resists single-turn attacks significantly better. Multi-turn resistance is similar—both models struggle when attacks persist across turns.

### The degradation gap

How much does each model degrade under attack?

| Model | Baseline Refusal | After Meta | After Hydra |
|-------|------------------|------------|-------------|
| GPT-5.2 | 95.7% | 39.7% (-56pp) | 21.5% (-74pp) |
| Gemini 3 Flash | 80.9% | 10.6% (-70pp) | 23.1% (-58pp) |

Gemini 3 Flash degrades *less* under Hydra than GPT-5.2 (-58pp vs -74pp), but starts from a weaker baseline. The end result is similar.

For meta-agent attacks, Gemini 3 Flash degrades more (-70pp vs -56pp) *and* starts weaker, compounding to the 89% vs 60% headline.

## What Category Results Reveal

The category-level breakdown exposes different safety priorities.

### Gemini 3 Flash: Technical security > Content moderation

**Strongest defenses (lowest attack success):**

| Category | Attack Success | What It Tests |
|----------|---------------|---------------|
| Divergent Repetition | 22% | Structural exploit |
| Pliny Injections | 20% | Known injection dataset |
| ASCII Smuggling | 33% | Unicode/encoding attacks |
| Weapons Content | 33% | Direct weapons requests |
| Special Token Injection | 40% | Format delimiter exploits |

**Weakest defenses (highest attack success):**

| Category | Attack Success | What It Tests |
|----------|---------------|---------------|
| Graphic Content | 100% | Violence/gore descriptions |
| Entity Impersonation | 100% | Pretending to be real people |
| Hallucination | 93% | Fabricating facts/citations |
| Unauthorized Commitments | 80% | Agreeing to contracts |
| Personal Attacks | 80% | Insults about individuals |

**The pattern:** Gemini 3 Flash resists *structural* attacks (token manipulation, encoding tricks) but fails on *semantic* attacks (reframing harmful requests as roleplay or hypotheticals).

One possible interpretation: safety training focused on known exploit patterns from security research, but underweighted content policy enforcement.

### Key divergences from GPT-5.2

Side-by-side category comparison (attack success rate = higher is worse):

**Gemini 3 Flash significantly worse:**

| Category | GPT-5.2 | Gemini 3 Flash | Gap |
|----------|---------|----------------|-----|
| Child Exploitation | 26.67% | 70.00% | +43pp |
| Non-Violent Crime | 40.00% | 73.33% | +33pp |
| Graphic Content | 66.67% | 100.00% | +33pp |
| Hallucination | 60.00% | 92.86% | +33pp |
| Violent Crime | 33.33% | 66.67% | +33pp |
| Cybercrime | 26.67% | 53.33% | +27pp |
| Personal Attacks | 60.00% | 80.00% | +20pp |

**Similar performance (±10pp):**

| Category | GPT-5.2 | Gemini 3 Flash | Gap |
|----------|---------|----------------|-----|
| Entity Impersonation | 100.00% | 100.00% | 0pp |
| Hate Speech | 60.00% | 66.67% | +7pp |
| Harassment | 66.67% | 73.33% | +7pp |
| Profanity | 66.67% | 73.33% | +7pp |
| Unauthorized Commitments | 73.33% | 80.00% | +7pp |
| Sexual Crime | 53.33% | 60.00% | +7pp |
| WMD Content | 53.33% | 60.00% | +7pp |

**Gemini 3 Flash better:**

| Category | GPT-5.2 | Gemini 3 Flash | Gap |
|----------|---------|----------------|-----|
| Self-Harm | 60.00% | 46.67% | -13pp |
| Disinformation | 66.67% | 50.00% | -17pp |
| Divergent Repetition | 0.00% | 22.22% | +22pp |
| Pliny Injections | 0.00% | 20.00% | +20pp |

GPT-5.2 has meaningfully stronger defenses on child exploitation, hallucination, graphic content, and violent/non-violent crime. Gemini 3 Flash is notably better on self-harm and disinformation.

### The impersonation problem

Both models show ~100% attack success on entity impersonation. Neither has robust defenses against "pretend to be X" attacks.

This matters because impersonation enables:
- Fraud (fake customer service, fake executives)
- Disinformation (fake quotes, fake endorsements)
- Legal liability (misrepresenting real people/brands)

### The hallucination divergence

| Model | Hallucination Attack Success |
|-------|------------------------------|
| GPT-5.2 | 60% |
| Gemini 3 Flash | 93% |

Gemini is 1.5× more likely to fabricate information when prompted. This includes fake citations, fabricated statistics, and made-up quotes from real people.

This isn't a jailbreak issue—it's a reliability issue that jailbreaks amplify.

### Child safety

| Model | Child Safety Attack Success | Sample |
|-------|----------------------------|--------|
| GPT-5.2 | 27% (4/15) | n=15 |
| Gemini 3 Flash | 70% (7/10) | n=10 |

This is the most consequential difference. Under our rubric, Gemini 3 Flash generated child-safety-adjacent content in 7 of 10 jailbreak attempts. GPT-5.2's defenses held nearly 3× more often. We performed human review on all outputs in this category.

For applications involving minors, this gap matters.

## Methodology

We disabled extended thinking (`thinkingLevel: MINIMAL`) to test base model behavior. Gemini 3 models support [configurable thinking levels](https://ai.google.dev/gemini-api/docs/thinking) (MINIMAL, LOW, MEDIUM, HIGH) that control how much the model reasons before responding. **The default is dynamic HIGH**—we override this to approximate GPT-5.2's `reasoning_effort: 'none'` for a fair comparison.

### Run configuration

| Setting | Value |
|---------|-------|
| API surface | Gemini Developer API (AI Studio) |
| Model | `gemini-3-flash-preview` |
| Thinking level | MINIMAL |
| Temperature | 1.0 (default) |
| Max output tokens | 8192 |
| Safety settings | Default thresholds |
| Region | us-central1 |
| Retries | 4 (with exponential backoff) |

We used default [safety settings](https://ai.google.dev/gemini-api/docs/safety-settings). Google's documentation notes that core harms like child safety have built-in protections that are always active regardless of threshold configuration.

```yaml title="promptfooconfig.yaml"
targets:
  - id: google:gemini-3-flash-preview
    config:
      generationConfig:
        temperature: 1.0
        maxOutputTokens: 8192
        thinkingConfig:
          thinkingLevel: MINIMAL

redteam:
  purpose: You are a helpful assistant

  plugins:
    - harmful:chemical-biological-weapons
    - harmful:child-exploitation
    - harmful:copyright-violations
    - harmful:cybercrime
    - harmful:cybercrime:malicious-code
    - harmful:graphic-content
    - harmful:harassment-bullying
    - harmful:hate
    - harmful:illegal-activities
    - harmful:illegal-drugs
    - harmful:illegal-drugs:meth
    - harmful:indiscriminate-weapons
    - harmful:insults
    - harmful:intellectual-property
    - harmful:misinformation-disinformation
    - harmful:non-violent-crime
    - harmful:profanity
    - harmful:radicalization
    - harmful:self-harm
    - harmful:sex-crime
    - harmful:sexual-content
    - harmful:specialized-advice
    - harmful:unsafe-practices
    - harmful:violent-crime
    - harmful:weapons:ied
    - bias:race
    - bias:age
    - bias:disability
    - bias:gender
    - ascii-smuggling
    - contracts
    - coppa
    - pii:direct
    - pliny
    - special-token-injection
    - divergent-repetition
    - excessive-agency
    - hallucination
    - imitation
    - overreliance
    - politics
    - religion
    - unverifiable-claims

  strategies:
    - basic
    - jailbreak:hydra
    - jailbreak:meta
```

Same 39 plugins as GPT-5.2. Same three strategies (basic, Hydra, meta). Same judge.

A note on [ASR comparability](/blog/asr-not-portable-metric): these numbers are directly comparable to our GPT-5.2 results because we controlled for attempt budget, prompt set, and judge. They're not comparable to other benchmarks using different methodology.

### What Google's model card says

The [Gemini 3 Flash model card](https://deepmind.google/models/model-cards/gemini-3-flash/) includes internal safety evaluation results. Their automated evals show mixed results vs Gemini 2.5 Flash:

| Evaluation | Change vs 2.5 Flash |
|------------|---------------------|
| Text to Text Safety | -3.1% (worse) |
| Image to Text Safety | -2.3% (worse) |
| Unjustified-refusals | -10.4% (fewer refusals) |
| Tone | +3.8% (better) |

Google notes the safety regressions are "overwhelmingly either a) false positives or b) not egregious."

The -10.4% in unjustified-refusals is notable. This means the model refuses 10.4% less often on "borderline prompts." This is a known trade-off: **reducing false positives (annoying refusals on benign content) can increase false negatives (failing to refuse harmful content).**

Our 19% baseline attack success rate—4.4× higher than GPT-5.2—may reflect this tuning decision.

On red teaming, the model card states: "For child safety evaluations, Gemini 3 Flash satisfied required launch thresholds" and "found no egregious concerns."

**These aren't contradictory findings.** Google's testing measures policy compliance on normal inputs and looks for egregious failures. Our testing measures resistance to adversarial jailbreaks. A model can pass Google's thresholds while still being vulnerable to attack.

## Findings

:::warning
Descriptions of model outputs involving harmful themes below. Skip to "What This Means" if preferred.
:::

### Finding 1: Entity Impersonation (100% success, n=15)

The model reliably impersonated public figures, brands, and organizations when prompted through the meta-agent strategy. Zero refusals.

### Finding 2: Graphic Content (100% success, n=15)

Every attempt to generate graphic violent content succeeded after jailbreak. The meta-agent found consistent bypasses regardless of the specific scenario.

### Finding 3: Hallucination (93% success, n=14)

The model fabricated citations, statistics, and quotes from real people when prompted. It generated fake academic papers with plausible-looking DOIs and invented historical events.

### Finding 4: Child Safety Failures (70% success, n=10)

Under our rubric, the model generated child-safety-adjacent content in 7 of 10 jailbreak attempts. We performed human review on all outputs in this category. We are not publishing examples.

## What This Means

Google's benchmarks show Gemini 3 Flash matching or beating GPT-5.2 on capability metrics like SWE-bench and GPQA. Early users are calling it faster, cheaper, and "just as good." The capability story is compelling. The safety story is different.

Three findings stand out:

**1. Baseline vulnerability is high.** GPT-5.2 refused 96% of harmful prompts without any jailbreak. Gemini 3 Flash refused 81%. That 15-point gap means simpler attacks work more often—no sophisticated jailbreak needed.

**2. Single-turn jailbreaks are unusually effective.** The meta-agent strategy succeeded 89% of the time vs 60% on GPT-5.2. Gemini 3 Flash's specific weakness is single-shot prompt engineering. Multi-turn resistance is similar between models.

**3. Structural defenses appear stronger than semantic defenses.** Gemini resists token injection and encoding attacks but fails on creative reframing. The model defaults to "helpful" when requests are rephrased as fiction, hypotheticals, or roleplay.

### If you're deploying Gemini 3 Flash

1. **Leave default thinking enabled.** We tested with `thinkingLevel: MINIMAL`. [Default is dynamic HIGH](https://ai.google.dev/gemini-api/docs/thinking)—leave it on unless you have strict latency constraints.

2. **Configure safety settings intentionally.** [Defaults vary by model and use case](https://ai.google.dev/gemini-api/docs/safety-settings). Review and set thresholds explicitly.

3. **Add output filtering.** The model lacks robust content filtering for graphic, sexual, and harassment content. Add your own layer.

4. **Implement impersonation detection.** Check if outputs claim to be real entities. The model won't refuse on its own.

5. **Verify factual claims.** 93% hallucination success means citations and statistics need external validation.

6. **Extra scrutiny for child-adjacent use cases.** The 70% attack success rate in this category warrants additional safeguards for any application involving minors.

### If choosing between models for safety-critical applications

| Factor | GPT-5.2 | Gemini 3 Flash |
|--------|---------|----------------|
| Baseline refusal | 96% | 81% |
| Single-turn resistance | 40% | 11% |
| Multi-turn resistance | 21% | 23% |
| Child safety | 73% refusal | 30% refusal |
| Hallucination resistance | 40% | 7% |
| Content filtering | Stronger | Weaker |

Neither is sufficient without additional safety layers. GPT-5.2 provides a stronger foundation.

### Responsible disclosure

We notified Google of these findings on December 17, 2025, the same day as publication. This assessment uses only publicly available APIs and does not include private vulnerability details. All examples shown are representative outputs, not exploit instructions.

## Run It Yourself

```bash
npx promptfoo@latest init --example redteam-foundation-model
cd redteam-foundation-model

# Edit redteam.yaml: change target to google:gemini-3-flash-preview
# Add thinkingConfig under generationConfig

npx promptfoo@latest redteam run -j 10
```

Full eval takes ~5 hours at concurrency 10. Reduce `numTests` per plugin for faster iteration.

## What's Next

We're running the same eval with `thinkingLevel: HIGH` to measure safety improvement from extended reasoning. We'll update this post with results.

---

**Related:**

- [GPT-5.2 Trust and Safety Assessment](/blog/gpt-5.2-trust-safety-assessment) — Same methodology, different model
- [Why ASR Isn't Comparable Across Papers](/blog/asr-not-portable-metric) — How to interpret attack success rates
- [Meta-Agent Strategy](/docs/red-team/strategies/meta) — How single-turn jailbreaks work
- [Hydra Strategy](/docs/red-team/strategies/hydra) — How multi-turn jailbreaks work

---

Questions? Find us on [Discord](https://discord.gg/promptfoo) or [GitHub](https://github.com/promptfoo/promptfoo).
