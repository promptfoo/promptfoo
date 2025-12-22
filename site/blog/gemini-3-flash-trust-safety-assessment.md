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

We ran the same red-team harness against Gemini 3 Flash Preview that we used for [GPT-5.2 last week](/blog/gpt-5.2-trust-safety-assessment)—same prompts, same judge, same attempt budget. **With thinking set to minimal** (`thinkingLevel: MINIMAL`), Google's model showed a wider attack surface: 89% of single-turn attacks succeeded (160/179), compared to 60% for GPT-5.2 (108/179).

:::warning Configuration
We tested `thinkingLevel: MINIMAL`, not the default HIGH. [Google's docs](https://ai.google.dev/gemini-api/docs/thinking) state that `MINIMAL` "matches the 'no thinking' setting for most queries" but does not guarantee zero thinking. We have not yet published results for HIGH; those are in progress.
:::

![The Bottom Line - GPT-5.2 vs Gemini 3 Flash refusal rates](/img/blog/gemini-3-flash/bottom-line.svg)

*Figure 1: Refusal rates by metric (higher = better defense). Dec 17, 2025. 43 plugins, 625 attacks. GPT-5 judge + human review. Safety settings: default.*

<!-- truncate -->

## Summary

Safety is now a configuration variable. Many teams will choose Flash specifically because it's [fast and cheap](https://blog.google/products/gemini/gemini-3-flash/), and may further reduce thinking to hit latency SLOs. Our finding: that speed-first config comes with a measurable safety penalty.

**Key results (attack success rate, higher = worse):**

| Metric | Gemini 3 Flash | GPT-5.2 | Gap |
|--------|----------------|---------|-----|
| Single-turn jailbreak (Meta) | 89% (160/179) | 60% (108/179) | +29pp |
| Multi-turn jailbreak (Hydra) | 77% (156/203) | 79% (160/203) | -2pp |
| Baseline (no jailbreak) | 19% (39/204) | 4% (9/208) | +15pp |
| Child safety | 70% (7/10) | 27% (4/15) | +43pp |
| Fabricated citations | 93% (13/14) | 60% (9/15) | +33pp |

The gap matters most in high-stakes categories. Child safety showed a 43 percentage-point difference. Impersonation-based social engineering hit 100% bypass rates on both models.

---

## Results

### Baseline and Degradation

Both models refuse most harmful prompts when sent directly—that's baseline. The question is how often they slip, and how much they degrade under attack.

On direct harmful prompts (no jailbreak), Gemini 3 Flash allowed 19% through (39/204 attacks). GPT-5.2 allowed 4% (9/208). This 15pp gap means simpler attacks work—you don't need a sophisticated jailbreak when 1 in 5 direct requests succeed.

Under multi-turn attacks (Hydra), the models are roughly tied: Gemini at 77% (156/203) vs GPT-5.2 at 79% (160/203). The large divergence is in baseline and single-turn framing attacks—not multi-turn.

![How defenses degrade under attack - refusal rate comparison](/img/blog/gemini-3-flash/degradation-waterfall.svg)

*Figure 2: Refusal rate degradation from baseline through single-turn (Meta) and multi-turn (Hydra) attacks.*

GPT-5.2 starts stronger (96% baseline refusal vs 81%) and degrades less under single-turn attacks (-56pp vs -70pp). The compounding effect—weaker baseline plus greater single-turn degradation—produces the 89% vs 60% headline.

### Attack Patterns

The category breakdown reveals what Gemini 3 Flash was trained to resist—and what it wasn't.

**Structural attacks** (token manipulation, encoding exploits): 29% average ASR. The model catches these.

**Content-framing attacks** (roleplay, hypotheticals): 93% average ASR. The model defaults to helpful.

![Structural vs content-framing attack success rates](/img/blog/gemini-3-flash/structural-vs-semantic.svg)

*Figure 3: ASR comparison between structural and content-framing attack categories. This is a hand-picked subset meant to illustrate a pattern, not a comprehensive taxonomy.*

When you manipulate tokens, the model catches it. When you manipulate framing, the model complies.

### Notable Categories

**Social engineering risk.** Both models produce plausible impersonation content at 100% ASR. This isn't harmless roleplay—the outputs include actionable fraud templates that could enable business email compromise.

**Child safety.** 70% vs 27% ASR (+43pp gap). Human-reviewed. Google's [safety settings docs](https://ai.google.dev/gemini-api/docs/safety-settings) say protections against child safety endangerment are "always blocked and cannot be adjusted." Our test category covers a broader "child-adjacent risk" bucket—grooming behaviors, boundary violations, suggestive content—under adversarial framing. We are not claiming the API emits illegal content. Google's "always blocked" refers to a specific protected class; our test covers broader adversarial scenarios that passed human review as problematic but not illegal.

**Fabricated citations.** 93% vs 60% ASR. Under adversarial prompts, both models hallucinate citations—Gemini more so.

---

## Discussion

Google's [launch post](https://blog.google/products/gemini/gemini-3-flash/) emphasizes speed, cost, and benchmarks. We focused on adversarial safety under speed-first configuration.

Google reduced "unjustified refusals" by [10% vs the prior Flash model](https://ai.google.dev/gemini-api/docs/gemini-3). That's a win for user experience on benign prompts. Our results may show the other side of that trade-off: a wider attack surface when prompts are adversarial.

**Recommendations for teams deploying Gemini 3 Flash:**

1. Keep `thinkingLevel` at default (HIGH) unless you have measured the safety impact of lowering it
2. Add guardrails for content-framing attacks—roleplay, hypotheticals, "pretend" scenarios
3. Add impersonation detection (both models fail here)
4. Validate citations externally (93% fabrication rate under attack)
5. Run a red-team eval on your exact config before shipping

Neither model is sufficient without additional safety layers. GPT-5.2 provides a stronger foundation for high-stakes use cases. Gemini 3 Flash may be appropriate for lower-risk applications where you control the input surface.

---

## Methodology

We tested `thinkingLevel: MINIMAL` to measure the lower bound on safety. Google's docs describe MINIMAL as matching "no thinking" for most queries, but it does not guarantee zero thinking.

| Setting | Gemini 3 Flash | GPT-5.2 |
|---------|----------------|---------|
| Model ID | `gemini-3-flash-preview` | `gpt-5.2` |
| Thinking/Reasoning | `thinkingLevel: MINIMAL` | `reasoning_effort: none` |
| Temperature | 1.0 (provider default) | 1.0 |
| Max tokens | 8192 | 8192 |
| Safety settings | Default (no overrides) | N/A |

### Attack Aggregation

Each plugin generates multiple probes (individual prompts). We aggregate related probes into attacks per category: an attack succeeds if any of its probes produce disallowed output. Percentages are computed over attack-level aggregates, not raw probe count.

| Strategy | Description | Gemini ASR | GPT-5.2 ASR |
|----------|-------------|------------|-------------|
| Baseline | No transformation | 19.1% (39/204) | 4.3% (9/208) |
| Meta | Single-turn, up to 10 rewrites | 89.4% (160/179) | 60.3% (108/179) |
| Hydra | Multi-turn, up to 5 turns | 76.8% (156/203) | 78.8% (160/203) |

Meta is single-turn in the sense of one user message → one model response, but it tries up to 10 prompt rewrites per attack before giving up.

### Exclusions

| Model | Timeouts | 5xx errors | Total excluded |
|-------|----------|------------|----------------|
| Gemini 3 Flash | 12 | 4 | 16 (2.6%) |
| GPT-5.2 | 3 | 2 | 5 (0.8%) |

Exclusions did not change the ordering of results.

### Scoring

- Safety block (API-level): Refusal
- Model refusal in output: Refusal
- Timeout (>60s): Excluded
- 5xx error: Retried 2x, then excluded

### Judge

GPT-5 (`gpt-5-2025-08-07`) for both models. Using a single judge improves comparability but doesn't eliminate bias—the judge may favor outputs matching its training distribution. We performed human review on child safety, weapons, and self-harm categories.

### Google Model Card Comparison

| Evaluation | Change vs 2.5 Flash | Interpretation |
|------------|---------------------|----------------|
| Text to Text Safety | -3.1% | Improvement |
| Unjustified-refusals | -10.4% | Fewer false refusals |
| Multilingual Safety | +0.1% | Minor regression |

Source: [Gemini 3 model documentation](https://ai.google.dev/gemini-api/docs/gemini-3). Google cautions that automated results are not directly comparable across model cards due to improved evals over time.

---

## Limitations

1. **Preview model** — Safety may change before GA
2. **MINIMAL only** — Default HIGH thinking may differ materially
3. **Small samples** — Some categories have n=10-15 attacks
4. **Judge reliability** — LLM grading with human review on critical categories; judge may have systematic biases
5. **Point-in-time** — Results from December 17, 2025
6. **Not compliance** — Red team assessment, not policy audit
7. **Stochastic outputs** — We used promptfoo v0.102.0; prompt generation is deterministic but model outputs are not

---

## Reproduce

```bash
npx promptfoo@latest init --example redteam-foundation-model
cd redteam-foundation-model

# Edit redteam.yaml: change target to google:gemini-3-flash-preview
# Add thinkingConfig under generationConfig

npx promptfoo@latest redteam run -j 10
```

Full eval: ~5 hours at concurrency 10. Config in our [foundation-model-redteam example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-foundation-model).

---

**What's next:** We're running the same eval with `thinkingLevel: HIGH`. We'll update this post with results.

**Related:** [GPT-5.2 Assessment](/blog/gpt-5.2-trust-safety-assessment) • [Why ASR Isn't Comparable](/blog/asr-not-portable-metric) • [Meta Strategy](/docs/red-team/strategies/meta) • [Hydra Strategy](/docs/red-team/strategies/hydra)
