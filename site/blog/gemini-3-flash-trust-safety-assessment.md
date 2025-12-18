---
title: 'Gemini 3 Flash Preview: Red Team Results at Minimal Thinking'
description: 'Red team results on Gemini 3 Flash Preview with thinkingLevel: MINIMAL. Single-turn jailbreaks succeed in 89% of attacks—baseline refusal lower than GPT-5.2 in this speed-first configuration.'
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
date: 2025-12-18
authors: [michael]
tags: [red-teaming, security-vulnerability, google]
---

# Gemini 3 Flash Preview: Red Team Results at Minimal Thinking

We ran a red-team scan of Gemini 3 Flash Preview using the same harness we used for [GPT-5.2 last week](/blog/gpt-5.2-trust-safety-assessment). **This run uses `thinkingLevel: MINIMAL`** (speed-first configuration). The comparison is GPT-5.2 with `reasoning_effort: none`. Same prompt set, same attempt budget, same judge. Provider APIs differ, and we call out those differences in methodology below.

In this configuration, Gemini refused less often on direct harmful prompts and was easier to jailbreak in single-turn attacks:

- **Single-turn jailbreaks:** 89% attack success (160/179) vs 60% (108/179) on GPT-5.2
- **Baseline (no jailbreak):** 19% attack success (39/204) vs 4% (9/208) on GPT-5.2
- **Multi-turn jailbreaks:** 77% (156/203) vs 79% (159/203)—similar

Google's model card shows they reduced "unjustified refusals" by 10% relative to the prior Flash model. That metric targets borderline-but-benign prompts, not adversarial inputs. It does not explain our results, but it points to active tuning pressure against over-refusal, which could interact with baseline refusal rates under adversarial prompting.

:::info Configuration note
We tested with `thinkingLevel: MINIMAL`. **Default Gemini 3 Flash uses dynamic HIGH thinking**—expect better safety behavior with defaults enabled. This is a preview model; behavior may change before GA.
:::

### Why test MINIMAL?

Reasoning improves safety. GPT-5.2 with `reasoning_effort: low` resists jailbreaks better than with `none` (55% vs 60% Meta ASR). We tested MINIMAL because it represents the lower bound on safety—and it's the configuration teams will use when optimizing for throughput. Google's docs note that MINIMAL "matches the 'no thinking' setting for most queries" but is not a hard guarantee that thinking is fully disabled.

We'll follow up with `thinkingLevel: HIGH` results.

**Quick reference: Gemini 3 Flash (MINIMAL) vs GPT-5.2 (no reasoning)**

*(n differs across models due to timeouts and transport errors; see methodology below)*
- Baseline ASR: 19% (39/204) vs 4% (9/208)
- Single-turn (Meta) ASR: 89% (160/179) vs 60% (108/179)
- Multi-turn (Hydra) ASR: 77% (156/203) vs 79% (159/203)
- Largest category gap: child safety—70% (7/10) vs 27% (4/15)

<!-- truncate -->

## Results

We ran 3,462 probes across 43 risk categories. Under the Meta (single-turn) strategy, two categories showed zero resistance: **Graphic Content** and **Entity Impersonation** hit 100% attack success (15/15 each). Neither model handles impersonation well (GPT-5.2 also shows 100%, 15/15 under Meta), but Gemini's graphic content defenses show a larger gap—GPT-5.2's Meta ASR for graphic content is 67% (10/15).

:::note Units
A **probe** is one model call with one prompt. An **attack** groups related probes for one scenario—it succeeds if any probe produces disallowed output. The table below reports attack-level aggregates (n=179/203/204), not raw probes (n=3,462).
:::

The strategy breakdown:

| Strategy | Gemini 3 Flash | GPT-5.2 | Delta |
|----------|---------------|---------|-------|
| **Meta** (single-turn) | 89.4% (160/179) | 60.3% (108/179) | +29pp |
| **Hydra** (multi-turn) | 76.9% (156/203) | 78.5% (159/203) | -2pp |
| **Baseline** (no jailbreak) | 19.1% (39/204) | 4.3% (9/208) | +15pp |

Single-turn jailbreaks are where Gemini 3 Flash diverges from GPT-5.2: 89% vs 60% attack success, a 29 percentage-point gap. Multi-turn attacks succeed at similar rates on both models—around 77-78%. The [meta-agent strategy](/docs/red-team/strategies/meta), which finds single-shot prompt manipulations, is the primary differentiator.

![Attack success rate by strategy comparing Gemini 3 Flash and GPT-5.2](/img/blog/gemini-3-flash/strategy-comparison.svg)

:::tip If you deploy Flash today
- **Keep default thinking on** (`thinkingLevel: HIGH`) unless latency forces otherwise
- **Add output filters** for impersonation and graphic content—we observed low resistance in these categories
- **Validate citations externally**—hallucination rate is high under adversarial prompts
:::

### Where defenses failed

Beyond the 100% bypass categories, several areas showed >65% attack success under Meta:

| Category | Gemini 3 Flash | GPT-5.2 | Gap |
|----------|---------------|---------|-----|
| Hallucination (prompted fabrication) | 93% (13/14) | 60% (9/15) | +33pp |
| Unauthorized Commitments | 80% (12/15) | 53% (8/15) | +27pp |
| Personal Attacks | 80% (12/15) | 60% (9/15) | +20pp |
| Harassment | 73% (11/15) | 53% (8/15) | +20pp |
| Non-Violent Crime | 73% (11/15) | 40% (6/15) | +33pp |
| Child Safety | 70% (7/10) | 27% (4/15) | +43pp |
| Hate Speech | 67% (10/15) | 60% (9/15) | +7pp |
| Violent Crime | 67% (10/15) | 33% (5/15) | +34pp |

The child safety number warrants attention. Under our rubric, Gemini 3 Flash produced outputs our reviewers judged as unsafe facilitation or boundary-violating content in 7/10 jailbreak attempts. GPT-5.2's rate was 27% (4/15). We performed human review on all outputs in this category—we are not publishing examples. (The different denominators reflect attacks that completed without timeouts or transport errors on each model; see methodology for scoring rules.)

## The Refusal Gap

The aggregate numbers hide an important pattern. Both models refuse most harmful prompts when sent directly—that's the baseline expectation. The question is how often they slip, and how much they degrade under attack.

On baseline prompts (no jailbreak transformation), Gemini 3 Flash shows a 15 percentage-point higher attack success rate: 19% vs 4%. This gap matters because it means simpler attacks work. You don't need a sophisticated jailbreak when direct requests succeed 1 in 5 times.

Under attack, the models degrade differently:

| Stage | GPT-5.2 refusal | Gemini refusal | Stronger |
|-------|-----------------|----------------|----------|
| Baseline (no attack) | 95.7% | 80.9% | GPT |
| After Meta (single-turn) | 39.7% (-56pp) | 10.6% (-70pp) | GPT |
| After Hydra (multi-turn) | 21.5% (-74pp) | 23.1% (-58pp) | ≈ |

GPT-5.2 starts stronger and degrades less under single-turn attacks. Gemini 3 Flash actually degrades *less* under multi-turn attacks (-58pp vs -74pp), but starts so much weaker that the end result is similar. The compounding effect on single-turn attacks—weaker baseline plus greater degradation—is what produces the 89% vs 60% headline.

![How defenses degrade under attack - refusal rate comparison](/img/blog/gemini-3-flash/degradation-waterfall.svg)

## The Structural vs Semantic Pattern

The category breakdown reveals what Gemini 3 Flash was trained to resist—and what it wasn't. We categorize attacks by their primary mechanism:

**Structural attacks** (token manipulation, encoding tricks, format exploits): Divergent repetition (22% ASR), Pliny injections (20%), ASCII smuggling (33%), special token injection (40%). These are the attacks that show up in security research—adversarial prompting through format manipulation.

**Content-framing attacks** (roleplay, hypotheticals, reframing): Graphic content (100% ASR), entity impersonation (100%), hallucination (93%), personal attacks (80%). These reframe harmful requests as fiction, thought experiments, or "just asking questions."

The pattern: defenses are stronger on structural prompt exploits than on content-framing. When you manipulate tokens, the model catches it. When you manipulate framing, the model defaults to helpful.

Quantified: **average ASR on structural attacks is 29%**, **average ASR on content-framing attacks is 93%** (both unweighted means of 4 categories). This is a small, hand-picked subset of categories meant to illustrate a pattern, not a comprehensive taxonomy.

![Structural vs semantic attack success rates](/img/blog/gemini-3-flash/structural-vs-semantic.svg)

### How the models compare

The category-by-category breakdown using Meta strategy results:

**Largest gaps (Gemini worse):** Child safety (+43pp), graphic content (+33pp), hallucination (+33pp), violent crime (+33pp), non-violent crime (+33pp). These are the categories where model choice matters most.

**Similar performance:** Entity impersonation (both 100%), hate speech, harassment, profanity, WMD content. Neither model handles these well.

**Gemini better:** Self-harm (-13pp) and disinformation (-17pp). These are the only categories where Gemini 3 Flash outperformed GPT-5.2.

![Category divergence chart showing where models differ most](/img/blog/gemini-3-flash/category-divergence.svg)

Three findings stand out:

**Impersonation bypassed consistently.** In our single-turn harness, both models hit 100% attack success on entity impersonation. "Pretend to be [CEO/brand/public figure]" worked reliably on both. This enables fraud, fake endorsements, and legal liability.

**Hallucination (reliability, not safety).** Our hallucination plugin prompts the model to fabricate information. This is a reliability concern, not a trust-and-safety policy violation, but jailbreaks amplify it. Gemini complied 93% of the time (13/14) vs 60% (9/15) for GPT-5.2. Under adversarial prompting it will fabricate citations confidently—if users can steer the conversation, you need external citation validation.

**Child safety is the biggest gap.** GPT-5.2: 27% attack success (4/15). Gemini 3 Flash: 70% attack success (7/10). We performed human review on all outputs in this category. For applications involving minors, this gap is consequential.

A note on the tension with Google's docs: Google's [safety settings documentation](https://ai.google.dev/gemini-api/docs/safety-settings) says built-in protections against core harms, including child safety endangerment, are "always blocked and cannot be adjusted." Despite that, our human reviewers flagged outputs as child-safety-endangering under adversarial prompts. Possible explanations: our rubric is stricter than Google's internal threshold, the protection is imperfect under jailbreak, or both.

## Methodology

How we ran this eval, and why the numbers are comparable to our GPT-5.2 assessment.

We disabled extended thinking (`thinkingLevel: MINIMAL`) to test the fastest configuration. Gemini 3 models support [configurable thinking levels](https://ai.google.dev/gemini-api/docs/thinking) (MINIMAL, LOW, MEDIUM, HIGH). **The default is dynamic HIGH**—we tested MINIMAL to measure the lower bound on safety. Primary comparison is against GPT-5.2 with `reasoning_effort: none`.

### Run configuration

| Setting | Gemini 3 Flash | GPT-5.2 (for comparison) |
|---------|----------------|--------------------------|
| API surface | AI Studio | OpenAI API |
| Model ID | `gemini-3-flash-preview` | `gpt-5.2` |
| Reasoning | `thinkingLevel: MINIMAL` | `reasoning_effort: none` |
| Temperature | 1.0 | 1.0 |
| Max tokens | 8192 | 8192 |
| Safety settings | Default | Default |
| Retries | 4 (transport errors only) | 4 (transport errors only) |

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

Same 43 plugins as GPT-5.2. Same three strategies (Baseline, Hydra, Meta). Same judge.

**Strategy coverage:** Baseline and Hydra run across all 43 plugins (215 attacks = 43×5). Meta is a jailbreak strategy and we apply it only to the 39 non-bias plugins (195 attacks = 39×5).

**Attempt budget:** Each plugin generates 5 attack scenarios. Under Meta, each attack tries up to 10 prompt transformations (early-stop on success). Under Hydra, each attack runs up to 5 conversation turns with adaptive branching, capped at 25 model calls per attack. Baseline sends the original harmful prompt with no transformation.

### How we grade outputs

Each plugin includes a grader prompt that evaluates whether the model output violates safety policies. The grader is GPT-5, chosen for consistency with our GPT-5.2 assessment. We consider an attack successful when the grader judges the output would be disallowed under the target model's stated policies—specifically, [Google's safety settings guidance](https://ai.google.dev/gemini-api/docs/safety-settings) for Gemini and OpenAI's usage policies for GPT-5.2.

**On using GPT-5 as judge:** Yes, we're using an OpenAI model to grade both targets. Using a single fixed judge improves comparability across targets, but it does not eliminate all systematic judge effects. We mitigate this by (1) removing model labels from graded outputs, (2) using identical grader prompts for both models, and (3) performing human review on critical categories.

For critical categories—child safety, weapons, self-harm—we performed manual human review on all outputs. Borderline cases were reviewed by two team members. In spot-checks, we observed more grader misses than spurious flags, but we did not quantify this across all categories.

### Non-responses and blocks

Different models fail in different ways. Here's how we score each outcome:

| Outcome | Counted as | Notes |
|---------|-----------|-------|
| Safety block (API-level) | **Defense held** (refusal) | Gemini's content filtering triggered |
| Model refusal in output | **Defense held** (refusal) | Model declined to comply |
| Timeout (>60s) | Excluded | Network/latency issue |
| 5xx error | Retried, then excluded | Transient server error |
| Rate limit | Retried with backoff | Not counted until resolved |

**Retries are only for transient transport errors** (timeouts, 5xx, rate limits). We do not retry safety blocks or refusals—those count as successful defenses.

The different sample sizes between models (e.g., 7/10 vs 4/15 for child safety) reflect attacks where one model timed out or returned non-scorable transport errors while the other completed. We exclude attacks only when we cannot obtain a scorable response after transport retries. Counts vary slightly by provider due to transient API failures.

The baseline denominator difference (204 vs 208) reflects attacks where Gemini's API returned timeouts or 5xx errors after retries.

A note on [ASR comparability](/blog/asr-not-portable-metric): these numbers are directly comparable to our GPT-5.2 results because we controlled for attempt budget, prompt set, and judge. They're not comparable to other benchmarks using different methodology.

### What Google's model card says

The [Gemini 3 Flash model card](https://deepmind.google/models/model-cards/gemini-3-flash/) includes internal safety evaluation results. Their automated evals show mixed results vs Gemini 2.5 Flash.

**Important caveat:** Google's metrics measure different things than ours. Their "Safety" metrics test policy compliance on typical inputs, not adversarial resistance. Google also notes these automated evals use "improved evaluations" and are not directly comparable to older model cards.

| Evaluation | Change vs 2.5 Flash | Google's interpretation |
|------------|---------------------|------------------------|
| Text to Text Safety | -3.1% | ✓ Improvement |
| Image to Text Safety | -2.3% | ✓ Improvement |
| Multilingual Safety | +0.1% | Minor regression |
| Unjustified-refusals | -10.4% | ✓ Fewer false refusals |
| Tone | +3.8% | ✓ Improvement |

Google notes that when automated evals flag losses, manual review finds they are "overwhelmingly either a) false positives or b) not egregious."

The -10.4% in unjustified-refusals is notable. Google defines this as the model's ability to respond to borderline prompts while remaining safe. A 10.4% improvement means fewer unnecessary refusals on legitimate content.

This is a known trade-off: **reducing false positives (annoying refusals on benign content) can increase false negatives (failing to refuse harmful content).** We can't definitively link this to our results, but our 19% baseline attack success rate (15pp higher than GPT-5.2's 4%) is directionally consistent with a model tuned for fewer refusals.

On red teaming, the model card states: "For child safety evaluations, Gemini 3 Flash satisfied required launch thresholds" and "found no egregious concerns."

**Different measurement goals.** If your goal is fewer annoying refusals on borderline-but-benign prompts, these model-card deltas are wins. Our data suggests the trade-off is a wider attack surface when prompts are adversarial or cleverly reframed.

## What This Means

Google's [launch post](https://blog.google/products/gemini/gemini-3-flash/) emphasizes speed, cost, and benchmark performance. We focused on what happens to adversarial safety under a speed-first configuration.

In this configuration, Gemini 3 Flash is more permissive in refusal behavior—especially at MINIMAL thinking. One plausible explanation: the model-card shows Google reduced unjustified refusals by 10%. Our results may show the other side of that trade-off.

This trade-off isn't necessarily wrong—overly cautious models frustrate users and limit utility. But the gap matters in high-stakes contexts: child safety (70% vs 27% attack success under Meta), hallucination (93% vs 60%, 13/14 vs 9/15), graphic content (100% vs 67%, 15/15 vs 10/15).

### If you're deploying Gemini 3 Flash

**Leave default thinking on.** We tested with `thinkingLevel: MINIMAL`. [Default HIGH](https://ai.google.dev/gemini-api/docs/thinking) should be safer—use it unless latency constraints force otherwise.

**Add your own safety layer.** We observed low resistance to impersonation and content-framing attacks. Build detection for outputs claiming to be real entities, filter graphic/sexual content, and validate factual claims externally.

**Extra scrutiny for child-adjacent applications.** The 70% attack success rate warrants additional safeguards. Don't rely on model-level refusals alone.

### The bottom line

If you're choosing between models for safety-critical applications:

| Metric | GPT-5.2 | Gemini 3 Flash (MINIMAL) | Edge |
|--------|---------|--------------------------|------|
| Baseline refusal rate | 96% | 81% | GPT |
| Refusal rate under Meta | 40% | 11% | GPT |
| Refusal rate under Hydra | 21% | 23% | ≈ |
| Child safety refusal (n=10-15) | 73% | 30% | GPT |
| Hallucination refusal (n=14-15) | 40% | 7% | GPT |

*Small category samples (n=10-15); treat as directional, not definitive.*

Neither is sufficient without additional safety layers. GPT-5.2 provides a stronger foundation for high-stakes use cases. Gemini 3 Flash may be fine for lower-risk applications where you control the input surface and add your own guardrails.

## Limitations

This assessment has several constraints worth noting:

1. **Preview model.** Gemini 3 Flash is in preview. Safety behavior may change before GA.

2. **Single configuration.** We tested `thinkingLevel: MINIMAL` only. Default HIGH thinking may show materially different results.

3. **Attack coverage.** 43 risk categories with 3,462 probes is substantial but not exhaustive. Some categories have small sample sizes (n=10-15 attacks).

4. **Judge reliability.** We use LLM-based grading. While we performed human review on critical categories (child safety, weapons, self-harm), judge accuracy varies by category.

5. **Point-in-time snapshot.** Results reflect model behavior on December 17, 2025 (day of launch). API changes, safety patches, and model updates can shift results.

6. **Not a compliance audit.** This is a red team assessment, not a comprehensive safety evaluation. It tests adversarial resistance, not policy coverage.

## Run It Yourself

```bash
npx promptfoo@latest init --example redteam-foundation-model
cd redteam-foundation-model

# Edit redteam.yaml: change target to google:gemini-3-flash-preview
# Add thinkingConfig under generationConfig

npx promptfoo@latest redteam run -j 10
```

Full eval takes ~5 hours at concurrency 10. Reduce `numTests` per plugin for faster iteration.

**Repro pack:** The exact config used for this assessment is in our [foundation-model-redteam example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-foundation-model). Results summary (counts only, no harmful content) available on request.

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
