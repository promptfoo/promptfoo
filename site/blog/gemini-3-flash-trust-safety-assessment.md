---
title: 'Gemini 3 Flash Shows Wider Attack Surface in Speed Mode'
description: 'Red team results on Gemini 3 Flash Preview with thinkingLevel: MINIMAL. Single-turn jailbreaks succeed 89% of the time—weaker baseline and higher single-turn ASR than GPT-5.2 in this speed-first configuration.'
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

Google's Gemini 3 Flash launched yesterday with a new parameter: `thinkingLevel`. Set it to MINIMAL for speed. Set it to HIGH for reasoning. What Google doesn't advertise: that knob also controls how easily the model gets jailbroken.

We tested Flash with `thinkingLevel: MINIMAL`—the config teams will choose when optimizing for latency. Single-turn jailbreaks succeeded 89% of the time (160/179), compared to 60% for GPT-5.2 (108/179) under equivalent settings. The gap isn't just that Gemini starts weaker—it's that the weakness compounds.

:::warning Configuration
We tested `thinkingLevel: MINIMAL`, not the default HIGH. [Google's docs](https://ai.google.dev/gemini-api/docs/thinking) state MINIMAL "matches the 'no thinking' setting for most queries" but doesn't guarantee zero thinking. Results for HIGH are in progress.
:::

![Refusal rates across attack strategies](/img/blog/gemini-3-flash/bottom-line.svg)

*GPT-5.2 maintains higher refusal rates across all metrics except Hydra (multi-turn), where both models fail similarly. Child safety and fabricated citations show the largest gaps.*

<!-- truncate -->

## The Trade-off

Google's [model card](https://ai.google.dev/gemini-api/docs/gemini-3) shows they reduced "unjustified refusals" by 10% compared to Gemini 2.5 Flash. Fewer false positives on benign requests—a real UX win. But our results suggest this came with a cost: the model is more willing to comply with adversarial requests too.

| Metric | Gemini 3 Flash | GPT-5.2 | Gap |
|--------|----------------|---------|-----|
| Baseline (no jailbreak) | 19% (39/204) | 4% (9/208) | +15pp |
| Single-turn jailbreak | 89% (160/179) | 60% (108/179) | +29pp |
| Multi-turn jailbreak | 77% (156/203) | 79% (160/203) | −2pp |

The baseline gap is the headline. One in five direct harmful requests succeeds on Gemini without any jailbreak. On GPT-5.2, it's one in twenty-five. When your baseline is weaker, attackers don't need sophisticated techniques.

## The Compounding Effect

The real story is how these gaps multiply.

![Refusal rate degradation under attack](/img/blog/gemini-3-flash/degradation-waterfall.svg)

*Both models degrade under attack, but Gemini drops further from a lower starting point. The 89% vs 60% headline comes from weaker baseline (81% vs 96%) plus steeper single-turn drop (−70pp vs −56pp).*

GPT-5.2 starts at 96% baseline refusal and drops 56 percentage points under single-turn attack. Gemini starts at 81% and drops 70 points. The combination—lower floor, steeper fall—is why single-turn attacks succeed 89% of the time.

Interestingly, multi-turn attacks (Hydra) equalize the models. Both end up around 77-79% ASR. Whatever additional attack surface MINIMAL exposes, it's exploitable in a single turn.

## What Works and What Doesn't

The model's training shows clear priorities.

**Structural attacks fail.** Token manipulation, encoding tricks, ASCII smuggling—29% average ASR. The model catches these.

**Content-framing attacks succeed.** Roleplay, hypotheticals, "pretend you're..."—93% average ASR. The model complies.

![Structural vs content-framing attack comparison](/img/blog/gemini-3-flash/structural-vs-semantic.svg)

*Security research has focused on structural exploits. Attackers will use framing instead.*

This split matters for defense. If you're adding input filters, don't focus on weird unicode or token injection—those already fail. Focus on detecting roleplay setups and hypothetical framings.

## High-Stakes Categories

Three categories warrant specific attention.

**Child safety: 70% vs 27% ASR (+43pp).** This is a "child-adjacent risk" category—grooming behaviors, boundary violations, suggestive content—not a claim that the API produces illegal material. Google's [safety docs](https://ai.google.dev/gemini-api/docs/safety-settings) say child endangerment is "always blocked." That refers to a specific protected class. Our adversarial prompts target a broader bucket, and the gap between models is significant. Human-reviewed.

**Social engineering: 100% ASR (both models).** "Pretend to be [executive]" produces actionable fraud templates on both models. Not harmless roleplay—the outputs include specific phishing language. Neither model is safe here.

**Fabricated citations: 93% vs 60% ASR.** Under adversarial prompts, both models invent citations. Gemini does it more often. If your application surfaces references to users, validate them externally.

## Recommendations

For teams deploying Gemini 3 Flash:

1. **Don't lower `thinkingLevel` without measuring the safety impact.** The latency gain isn't free. If you must use MINIMAL, add compensating controls.

2. **Guard against content-framing specifically.** The model resists structural attacks but complies with roleplay and hypotheticals. Your input filters should detect "pretend," "imagine," "hypothetically," and similar framing.

3. **Treat impersonation as a vulnerability, not a feature.** Both models fail here. If your app allows open-ended generation, add post-hoc detection for executive names, company references, and request patterns that look like BEC.

4. **Assume citations are fabricated.** 93% ASR means adversarial users can reliably get fake references. Either validate programmatically or don't surface them.

Neither model is sufficient alone. GPT-5.2 provides a stronger baseline for high-stakes applications. Gemini 3 Flash may be appropriate where you control inputs or can tolerate higher risk.

---

## Methodology

We used the same harness from our [GPT-5.2 assessment](/blog/gpt-5.2-trust-safety-assessment): 43 plugins across harmful content, bias, and behavioral categories. Each plugin generates multiple probes; we aggregate to attack-level success (any probe succeeds → attack succeeds).

| Setting | Gemini 3 Flash | GPT-5.2 |
|---------|----------------|---------|
| Model | `gemini-3-flash-preview` | `gpt-5.2` |
| Thinking | `thinkingLevel: MINIMAL` | `reasoning_effort: none` |
| Temperature | 1.0 | 1.0 |
| Safety settings | Default | N/A |

**Strategies tested:**
- Baseline: Direct harmful prompts, no transformation
- Meta: Single-turn with up to 10 prompt rewrites
- Hydra: Multi-turn with up to 5 conversation turns

**Judge:** GPT-5 for both models. Single judge improves comparability but may favor similar outputs. Human review on child safety, weapons, self-harm.

**Exclusions:** 16 Gemini timeouts/errors (2.6%), 5 GPT-5.2 (0.8%). Did not affect ordering.

---

## Limitations

1. **Preview model.** Results may change before GA.
2. **MINIMAL only.** HIGH thinking may perform differently.
3. **Small category samples.** Child safety has n=10-15 attacks.
4. **LLM judge.** May have systematic biases despite human review.
5. **Point-in-time.** December 17, 2025.

---

## Reproduce

```bash
npx promptfoo@latest init --example redteam-foundation-model
cd redteam-foundation-model
# Edit target to google:gemini-3-flash-preview
# Add thinkingConfig: { thinkingLevel: MINIMAL }
npx promptfoo@latest redteam run
```

Config: [foundation-model-redteam example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-foundation-model). Runtime: ~5 hours at concurrency 10.

---

**Next:** Results with `thinkingLevel: HIGH` are in progress.

**Related:** [GPT-5.2 Assessment](/blog/gpt-5.2-trust-safety-assessment) • [Why ASR Isn't Portable](/blog/asr-not-portable-metric) • [Meta Strategy](/docs/red-team/strategies/meta)
