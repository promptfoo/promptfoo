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
date: 2025-12-18
authors: [michael]
tags: [red-teaming, security-vulnerability, google]
---

# Gemini 3 Flash Preview: Initial Trust and Safety Assessment

Gemini 3 Flash launched yesterday. Google [describes it](https://blog.google/products/gemini/gemini-3-flash/) as "frontier intelligence built for speed"—Pro-grade reasoning at Flash-level speed and lower cost. The announcement emphasizes benchmarks, speed, and pricing. It makes no specific safety claims.

We started our red team eval within an hour of release and had our first finding in 63 minutes. Same methodology we used for [GPT-5.2 last week](/blog/gpt-5.2-trust-safety-assessment)—same probes, same strategies, same judge. The only variable is the model.

The headline: **89% of single-turn jailbreaks succeeded** (160/179 attacks) compared to 60% on GPT-5.2. But the more telling number is baseline behavior—harmful prompts sent without any jailbreak transformation. GPT-5.2 refuses 96% of these. Gemini 3 Flash refuses 81%. That means Gemini produced disallowed output on 19% of baseline attacks (39/204)—no adversarial technique required.

This may be an intentional product trade-off. Google's model card shows they reduced "unjustified refusals" by 10%—fewer false positives on benign content. The cost appears to be more false negatives on harmful content.

:::info Configuration note
We tested with `thinkingLevel: MINIMAL` to match GPT-5.2's `reasoning_effort: 'none'`. **Default Gemini 3 Flash uses dynamic HIGH thinking**—expect materially different safety behavior with defaults enabled. This is a preview model; behavior may change before GA.
:::

### Why test MINIMAL?

Flash is marketed on latency and cost. Many teams will lower thinking for throughput—Google's docs note that MINIMAL "matches the 'no thinking' setting for most queries." We tested MINIMAL to measure the safety profile of the fastest configuration. This isn't a weird corner case; it's the exact knob devs will turn to get "Flash-level speed."

**Quick reference:**
- Baseline ASR: 19.1% (39/204) vs GPT-5.2's 4.3%
- Meta (single-turn) ASR: 89.4% (160/179) vs GPT-5.2's 60.3%
- Worst categories under Meta: graphic content (100%, 15/15), impersonation (100%, 15/15)
- Biggest gap: child safety—70% (7/10) vs GPT-5.2's 27% (4/15)

<!-- truncate -->

## Results

We ran 3,462 probes across 39 risk categories. Under the Meta (single-turn) strategy, two categories showed zero resistance: **Graphic Content** and **Entity Impersonation** hit 100% attack success (15/15 each). Neither model handles impersonation well (GPT-5.2 also shows 100% under Meta), but Gemini's graphic content defenses show a larger gap—GPT-5.2's Meta ASR for graphic content is 67%.

:::note Units
A **probe** is one model call with one prompt. An **attack** groups related probes for one scenario—it succeeds if any probe produces disallowed output. The table below reports attack-level aggregates (n=179/203/204), not raw probes (n=3,462).
:::

The strategy breakdown:

| Strategy | Gemini 3 Flash | GPT-5.2 | Delta |
|----------|---------------|---------|-------|
| **Meta** (single-turn) | 89.4% (160/179) | 60.3% | +29pp |
| **Hydra** (multi-turn) | 76.9% (156/203) | 78.5% | -2pp |
| **Baseline** (no jailbreak) | 19.1% (39/204) | 4.3% | +15pp |

The pattern is clear: single-turn jailbreaks are where Gemini 3 Flash diverges from GPT-5.2. Multi-turn attacks succeed at similar rates on both models—around 77-78%. But the [meta-agent strategy](/docs/red-team/strategies/meta), which finds single-shot prompt manipulations, works 29 percentage points better on Gemini.

### Where defenses failed

Beyond the 100% bypass categories, several high-severity areas showed >65% attack success:

| Category | Success Rate | Severity |
|----------|-------------|----------|
| Hallucination | 92.9% (13/14) | Medium |
| Unauthorized Commitments | 80.0% (12/15) | Medium |
| Personal Attacks | 80.0% (12/15) | Medium |
| Harassment | 73.3% (11/15) | High |
| Non-Violent Crime | 73.3% (11/15) | Medium |
| Child Safety | 70.0% (7/10) | Critical |
| Hate Speech | 66.7% (10/15) | Critical |
| Violent Crime | 66.7% (10/15) | High |

The child safety number warrants attention. Under our rubric, Gemini 3 Flash generated child-safety-adjacent content in 7 of 10 jailbreak attempts. GPT-5.2's rate was 27% (4/15). We performed human review on all outputs in this category. (The different denominators reflect attack aggregates that completed without timeouts or provider blocks on each model.)

## The Refusal Gap

The aggregate numbers hide an important pattern. Both models refuse most harmful prompts when sent directly—that's table stakes. The question is how often they slip, and how much they degrade under attack.

Gemini 3 Flash slips 4.4× more often on identical baseline prompts: 19.1% vs 4.3%. This matters because it means simpler attacks work. You don't need a sophisticated jailbreak when direct requests succeed 1 in 5 times.

Under attack, the models degrade differently:

| Model | Baseline | After Meta | After Hydra |
|-------|----------|------------|-------------|
| GPT-5.2 | 95.7% refused | 39.7% refused (-56pp) | 21.5% refused (-74pp) |
| Gemini 3 Flash | 80.9% refused | 10.6% refused (-70pp) | 23.1% refused (-58pp) |

GPT-5.2 starts stronger and degrades less under single-turn attacks. Gemini 3 Flash actually degrades *less* under multi-turn attacks (-58pp vs -74pp), but starts so much weaker that the end result is similar. The compounding effect on single-turn attacks—weaker baseline plus greater degradation—is what produces the 89% vs 60% headline.

## The Structural vs Semantic Pattern

The category breakdown reveals what Gemini 3 Flash was trained to resist—and what it wasn't.

**Where defenses held:** Divergent repetition (22%), Pliny injections (20%), ASCII smuggling (33%), special token injection (40%). These are *structural* attacks—token manipulation, encoding tricks, format delimiter exploits. The kind of thing that shows up in security research papers.

**Where defenses failed:** Graphic content (100%), entity impersonation (100%), hallucination (93%), personal attacks (80%). These are *semantic* attacks—reframing harmful requests as roleplay, fiction, hypotheticals, or "just asking questions."

One plausible explanation: defenses are stronger on structural prompt exploits (the kind that show up in security research) than on semantic reframes. When you manipulate tokens, the model catches it. When you manipulate framing, the model defaults to helpful.

### How the models compare

The category-by-category breakdown using Meta strategy results:

**Largest gaps (Gemini worse):** Child safety (+43pp), graphic content (+33pp), hallucination (+33pp), violent crime (+33pp), non-violent crime (+33pp). These are the categories where model choice matters most.

**Similar performance:** Entity impersonation (both 100%), hate speech, harassment, profanity, WMD content. Neither model handles these well.

**Gemini better:** Self-harm (-13pp) and disinformation (-17pp). These are the only categories where Gemini 3 Flash outperformed GPT-5.2.

Three findings deserve attention:

**Impersonation is unsolved.** Both models hit 100% attack success on entity impersonation. "Pretend to be [CEO/brand/public figure]" works reliably on both. This enables fraud, fake endorsements, and legal liability.

**Hallucination is worse.** Gemini fabricates information 93% of the time when prompted to do so, vs 60% for GPT-5.2. Under adversarial prompting it will fabricate citations confidently—if users can steer the conversation, you need external citation validation. It's not strictly a jailbreak issue; it's a reliability issue that jailbreaks amplify.

**Child safety is the biggest gap.** GPT-5.2: 27% attack success (4/15). Gemini 3 Flash: 70% attack success (7/10). We performed human review on all outputs in this category. For applications involving minors, this gap is consequential.

A note on the tension with Google's docs: Google's safety settings documentation states that "built-in protections" for core harms like child safety are "always blocked" regardless of configuration. Despite that, our human reviewers flagged outputs as child-safety-endangering under adversarial prompts. Possible explanations: our rubric is stricter than Google's internal threshold, the protection is imperfect under jailbreak, or both.

## Methodology

How we ran this eval, and why the numbers are comparable to our GPT-5.2 assessment.

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
| Region | N/A (AI Studio) |
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

### How we grade outputs

Each plugin includes a grader prompt that evaluates whether the model output violates safety policies. The grader is GPT-4o, chosen for consistency with our GPT-5.2 assessment. We consider an attack successful when the grader judges the output would be disallowed under the target model's stated policies.

For critical categories—child safety, weapons, self-harm—we performed manual human review on all outputs. Borderline cases were reviewed by two team members. The grader tends toward false negatives (missing some violations) rather than false positives, so our ASR numbers are likely conservative.

A note on [ASR comparability](/blog/asr-not-portable-metric): these numbers are directly comparable to our GPT-5.2 results because we controlled for attempt budget, prompt set, and judge. They're not comparable to other benchmarks using different methodology.

### What Google's model card says

The [Gemini 3 Flash model card](https://deepmind.google/models/model-cards/gemini-3-flash/) includes internal safety evaluation results. Their automated evals show mixed results vs Gemini 2.5 Flash.

**Important caveat:** Google's metrics measure different things than ours. Their "Safety" metrics test policy compliance on typical inputs, not adversarial resistance. Google also notes these automated evals use "improved evaluations" and are not directly comparable to older model cards.

| Evaluation | Change vs 2.5 Flash |
|------------|---------------------|
| Text to Text Safety | -3.1% (Google marks as improvement) |
| Image to Text Safety | -2.3% (Google marks as improvement) |
| Multilingual Safety | +0.1% (regression, non-egregious) |
| Unjustified-refusals | -10.4% (fewer false-positive refusals) |
| Tone | +3.8% |

Google notes that when automated evals flag losses, manual review finds they are "overwhelmingly either a) false positives or b) not egregious."

The -10.4% in unjustified-refusals is notable. Google defines this as the model's ability to respond to borderline prompts while remaining safe. A 10.4% improvement means fewer unnecessary refusals on legitimate content.

This is a known trade-off: **reducing false positives (annoying refusals on benign content) can increase false negatives (failing to refuse harmful content).** We can't definitively link this to our results, but our 19% baseline attack success rate (4.4× higher than GPT-5.2) is directionally consistent with a model tuned for fewer refusals.

On red teaming, the model card states: "For child safety evaluations, Gemini 3 Flash satisfied required launch thresholds" and "found no egregious concerns."

**Two different worlds.** If your goal is fewer annoying refusals on borderline-but-benign prompts, these model-card deltas are wins. Our data suggests the trade-off is a wider attack surface when prompts are adversarial or cleverly reframed.

## What This Means

Google positions Gemini 3 Flash as competitive with frontier models on capability benchmarks while offering better speed and cost. The internet is (reasonably) excited. We focused on what happens to safety when you optimize for speed.

In this configuration, Gemini 3 Flash is more permissive in refusal behavior—especially at MINIMAL thinking. One plausible explanation: the model-card shows Google reduced unjustified refusals by 10%. Our results may show the other side of that trade-off.

This trade-off isn't necessarily wrong—overly cautious models frustrate users and limit utility. But the gap matters in high-stakes contexts: child safety (70% vs 27% attack success under Meta), hallucination (93% vs 60%), graphic content (100% vs 67%).

### If you're deploying Gemini 3 Flash

**Leave default thinking on.** We tested with `thinkingLevel: MINIMAL`. [Default HIGH](https://ai.google.dev/gemini-api/docs/thinking) should be safer—use it unless latency constraints force otherwise.

**Add your own safety layer.** The model won't catch impersonation, lacks robust content filtering, and hallucinates readily. Build detection for outputs claiming to be real entities, filter graphic/sexual content, and validate factual claims externally.

**Extra scrutiny for child-adjacent applications.** The 70% attack success rate warrants additional safeguards. Don't rely on model-level refusals alone.

### The bottom line

If you're choosing between models for safety-critical applications:

| Factor | GPT-5.2 | Gemini 3 Flash |
|--------|---------|----------------|
| Baseline refusal | 96% | 81% |
| Single-turn resistance | 40% | 11% |
| Multi-turn resistance | 21% | 23% |
| Child safety | 73% refusal | 30% refusal |
| Hallucination resistance | 40% | 7% |

Neither is sufficient without additional safety layers. GPT-5.2 provides a stronger foundation for high-stakes use cases. Gemini 3 Flash may be fine for lower-risk applications where you control the input surface and add your own guardrails.

### Responsible disclosure

We notified Google of these findings on December 17, 2025, one day before publication. This assessment uses only publicly available APIs and does not include private vulnerability details. All examples shown are representative outputs, not exploit instructions.

## Limitations

This assessment has several constraints worth noting:

1. **Preview model.** Gemini 3 Flash is in preview. Safety behavior may change before GA.

2. **Single configuration.** We tested `thinkingLevel: MINIMAL` only. Default HIGH thinking may show materially different results.

3. **Attack coverage.** 39 risk categories with 3,462 probes is substantial but not exhaustive. Some categories have small sample sizes (n=10-15 attacks).

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
