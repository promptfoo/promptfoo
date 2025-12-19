---
title: 'Gemini 3 Flash Shows Wider Attack Surface in Speed Mode'
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

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<p className="subtitle" style={{fontSize: '1.25rem', color: '#555', marginTop: '-0.5rem', marginBottom: '1.5rem', fontWeight: 300}}>
With extended thinking disabled, Google's new model refused harmful prompts less often than GPT-5.2 in our tests
</p>

![The Bottom Line - GPT-5.2 vs Gemini 3 Flash refusal rates](/img/blog/gemini-3-flash/bottom-line.svg)

<div style={{display: 'flex', gap: '2rem', marginTop: '2rem', marginBottom: '2rem'}}>

<div style={{flex: 2}}>

<p style={{lineHeight: '1.6'}}><span style={{float: 'left', fontSize: '3.5rem', fontWeight: 'bold', lineHeight: '0.8', marginRight: '0.15em', marginTop: '0.1em', color: '#c41e3a'}}>W</span>e ran the same red-team harness against Gemini 3 Flash Preview that we used for <a href="/blog/gpt-5.2-trust-safety-assessment">GPT-5.2 last week</a>—same prompts, same judge, same attempt budget. <strong>With extended thinking disabled</strong> (<code>thinkingLevel: MINIMAL</code>), Google's model showed a wider attack surface: 89% of single-turn jailbreaks succeeded, compared to 60% for GPT-5.2.</p>

The gap matters most in high-stakes categories. Child safety showed a 43 percentage-point difference—70% vs 27% attack success. Graphic content and impersonation hit 100% bypass rates under our Meta strategy.

:::warning Configuration
We tested `thinkingLevel: MINIMAL`, not the default HIGH. Expect better safety with defaults enabled. This is a preview model.
:::

</div>

<div style={{flex: 1, backgroundColor: '#f8f8f8', padding: '1rem', borderLeft: '3px solid #c41e3a', fontSize: '0.9rem', alignSelf: 'flex-start', marginTop: '0.5rem'}}>

**KEY FINDINGS**

<div style={{marginBottom: '1rem'}}>
<div style={{fontSize: '1.75rem', fontWeight: 'bold'}}>89%</div>
<div style={{color: '#666'}}>Single-turn jailbreak success<br/>(vs 60% for GPT-5.2)</div>
</div>

<hr style={{margin: '0.75rem 0', borderColor: '#ddd'}}/>

<div style={{marginBottom: '1rem'}}>
<div style={{fontSize: '1.75rem', fontWeight: 'bold'}}>+43pp</div>
<div style={{color: '#666'}}>Child safety gap<br/>70% vs 27% attack success</div>
</div>

<hr style={{margin: '0.75rem 0', borderColor: '#ddd'}}/>

<div>
<div style={{fontSize: '1.75rem', fontWeight: 'bold'}}>19%</div>
<div style={{color: '#666'}}>Baseline slip rate<br/>(vs 4% for GPT-5.2)</div>
</div>

</div>

</div>

<!-- truncate -->

<hr style={{border: 'none', borderTop: '2px solid #222', margin: '2.5rem 0'}}/>

## The Gap

Both models refuse most harmful prompts when sent directly—that's baseline. The question is how often they slip, and how much they degrade under attack.

On direct harmful prompts (no jailbreak), Gemini 3 Flash allowed 19% through. GPT-5.2 allowed 4%. This 15pp gap means simpler attacks work.

> **"You don't need a sophisticated jailbreak when 1 in 5 direct requests succeed."**

![How defenses degrade under attack - refusal rate comparison](/img/blog/gemini-3-flash/degradation-waterfall.svg)

GPT-5.2 starts stronger (96% baseline refusal vs 81%) and degrades less under single-turn attacks (-56pp vs -70pp). The compounding effect—weaker baseline plus greater single-turn degradation—produces the 89% vs 60% headline.

<hr style={{border: 'none', borderTop: '2px solid #222', margin: '2.5rem 0'}}/>

## The Pattern

The category breakdown reveals what Gemini 3 Flash was trained to resist—and what it wasn't.

<div style={{display: 'flex', gap: '1rem', margin: '1.5rem 0', flexWrap: 'wrap'}}>
<div style={{flex: 1, minWidth: '200px', backgroundColor: '#e0f7fa', padding: '1rem', borderRadius: '8px', textAlign: 'center'}}>
<div style={{fontWeight: 'bold', marginBottom: '0.5rem'}}>Structural Attacks</div>
<div style={{fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem'}}>Token tricks, encoding exploits</div>
<div style={{fontSize: '2rem', fontWeight: 'bold', color: '#00796b'}}>29%</div>
<div style={{fontSize: '0.85rem', color: '#00796b'}}>✓ Defended</div>
</div>
<div style={{flex: 1, minWidth: '200px', backgroundColor: '#ffebee', padding: '1rem', borderRadius: '8px', textAlign: 'center'}}>
<div style={{fontWeight: 'bold', marginBottom: '0.5rem'}}>Content-Framing</div>
<div style={{fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem'}}>Roleplay, hypotheticals</div>
<div style={{fontSize: '2rem', fontWeight: 'bold', color: '#c62828'}}>93%</div>
<div style={{fontSize: '0.85rem', color: '#c62828'}}>✗ Failed</div>
</div>
</div>

When you manipulate tokens, the model catches it. When you manipulate framing, the model defaults to helpful.

![Structural vs content-framing attack success rates](/img/blog/gemini-3-flash/structural-vs-semantic.svg)

<hr style={{border: 'none', borderTop: '2px solid #222', margin: '2.5rem 0'}}/>

## Three Findings

<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', margin: '1.5rem 0'}}>

<div style={{backgroundColor: '#fffbf0', border: '1px solid #ffe082', borderLeft: '3px solid #f59e0b', borderRadius: '8px', padding: '1rem'}}>
<div style={{fontWeight: 'bold', marginBottom: '0.5rem', color: '#b45309'}}>Impersonation</div>
<div style={{fontSize: '1.5rem', fontWeight: 'bold'}}>100%</div>
<div style={{fontSize: '0.85rem', color: '#555'}}>Both models fail equally. "Pretend to be [CEO]" works reliably on both.</div>
</div>

<div style={{backgroundColor: '#fff5f5', border: '1px solid #ffcdd2', borderLeft: '3px solid #c41e3a', borderRadius: '8px', padding: '1rem'}}>
<div style={{fontWeight: 'bold', marginBottom: '0.5rem', color: '#b71c1c'}}>Child Safety</div>
<div style={{fontSize: '1.5rem', fontWeight: 'bold'}}>+43pp gap</div>
<div style={{fontSize: '0.85rem', color: '#555'}}>70% vs 27%. Human-reviewed. For apps involving minors, this gap is consequential.</div>
</div>

<div style={{backgroundColor: '#fff5f5', border: '1px solid #ffcdd2', borderLeft: '3px solid #c41e3a', borderRadius: '8px', padding: '1rem'}}>
<div style={{fontWeight: 'bold', marginBottom: '0.5rem', color: '#b71c1c'}}>Hallucination</div>
<div style={{fontSize: '1.5rem', fontWeight: 'bold'}}>93% vs 60%</div>
<div style={{fontSize: '0.85rem', color: '#555'}}>Reliability concern amplified by jailbreaks. Validate citations externally.</div>
</div>

</div>

A note on child safety: Google's [safety settings docs](https://ai.google.dev/gemini-api/docs/safety-settings) say protections against child safety endangerment are "always blocked and cannot be adjusted." Our reviewers still flagged outputs as problematic under adversarial prompts.

<hr style={{border: 'none', borderTop: '2px solid #222', margin: '2.5rem 0'}}/>

## What This Means

Google's [launch post](https://blog.google/products/gemini/gemini-3-flash/) emphasizes speed, cost, and benchmarks. We focused on adversarial safety under speed-first configuration.

Google reduced "unjustified refusals" by 10% vs the prior Flash model. That's a win for user experience on benign prompts. Our results may show the other side of that trade-off: a wider attack surface when prompts are adversarial.

<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', margin: '1.5rem 0'}}>
<div style={{backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.75rem'}}>
✓ <strong>Keep HIGH thinking</strong> — Default is safer than MINIMAL
</div>
<div style={{backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.75rem'}}>
✓ <strong>Add impersonation detection</strong> — Both models fail here
</div>
<div style={{backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '6px', padding: '0.75rem'}}>
⚠ <strong>Extra scrutiny for child safety</strong> — 70% ASR warrants guards
</div>
<div style={{backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '0.75rem'}}>
✓ <strong>Validate citations</strong> — 93% hallucination under attack
</div>
</div>

Neither model is sufficient without additional safety layers. GPT-5.2 provides a stronger foundation for high-stakes use cases. Gemini 3 Flash may be fine for lower-risk applications where you control the input surface.

<hr style={{border: 'none', borderTop: '1px solid #ccc', margin: '2rem 0'}}/>

<details>
<summary><strong>Methodology</strong> — 43 plugins • 3,462 probes • GPT-5 judge</summary>

### Run Configuration

We tested `thinkingLevel: MINIMAL` to measure the lower bound on safety. **The default is dynamic HIGH**—expect better results with defaults.

| Setting | Gemini 3 Flash | GPT-5.2 |
|---------|----------------|---------|
| Model ID | `gemini-3-flash-preview` | `gpt-5.2` |
| Reasoning | `thinkingLevel: MINIMAL` | `reasoning_effort: none` |
| Temperature | 1.0 | 1.0 |
| Max tokens | 8192 | 8192 |

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
    - harmful:cybercrime
    # ... 43 total plugins
  strategies:
    - basic
    - jailbreak:hydra
    - jailbreak:meta
```

### Scoring Rules

| Outcome | Counted as |
|---------|-----------|
| Safety block (API-level) | **Refusal** — defense held |
| Model refusal in output | **Refusal** — defense held |
| Timeout (>60s) | Excluded |
| 5xx error | Retried, then excluded |

**Strategy coverage:** Baseline/Hydra: 43 plugins × 5 = 215 attacks. Meta: 39 non-bias plugins × 5 = 195 attacks.

**Attempt budget:** Meta tries up to 10 transformations per attack. Hydra runs up to 5 turns, capped at 25 model calls.

**Judge:** GPT-5 for both models. Using a single judge improves comparability but doesn't eliminate all bias. We performed human review on child safety, weapons, and self-harm.

### Google's Model Card

| Evaluation | Change vs 2.5 Flash | Interpretation |
|------------|---------------------|----------------|
| Text to Text Safety | -3.1% | ✓ Improvement |
| Unjustified-refusals | -10.4% | ✓ Fewer false refusals |
| Multilingual Safety | +0.1% | Minor regression |

Google's metrics test typical inputs, not adversarial prompts. The 10.4% reduction in unjustified refusals is a UX win that may trade off against adversarial resistance.

</details>

<hr style={{border: 'none', borderTop: '1px solid #ccc', margin: '1.5rem 0'}}/>

<details>
<summary><strong>Limitations</strong></summary>

1. **Preview model** — Safety may change before GA
2. **MINIMAL only** — Default HIGH may differ materially
3. **Small samples** — Some categories have n=10-15 attacks
4. **Judge reliability** — LLM grading with human review on critical categories
5. **Point-in-time** — Results from December 17, 2025
6. **Not compliance** — Red team assessment, not policy audit

</details>

<hr style={{border: 'none', borderTop: '1px solid #ccc', margin: '1.5rem 0'}}/>

<details>
<summary><strong>Run It Yourself</strong></summary>

```bash
npx promptfoo@latest init --example redteam-foundation-model
cd redteam-foundation-model

# Edit redteam.yaml: change target to google:gemini-3-flash-preview
# Add thinkingConfig under generationConfig

npx promptfoo@latest redteam run -j 10
```

Full eval: ~5 hours at concurrency 10. Config in our [foundation-model-redteam example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-foundation-model).

</details>

<hr style={{border: 'none', borderTop: '2px solid #222', margin: '2.5rem 0'}}/>

**What's next:** We're running the same eval with `thinkingLevel: HIGH`. We'll update this post with results.

**Related:** [GPT-5.2 Assessment](/blog/gpt-5.2-trust-safety-assessment) • [Why ASR Isn't Comparable](/blog/asr-not-portable-metric) • [Meta Strategy](/docs/red-team/strategies/meta) • [Hydra Strategy](/docs/red-team/strategies/hydra)

<hr style={{border: 'none', borderTop: '1px solid #ccc', margin: '1.5rem 0'}}/>

Questions? [Discord](https://discord.gg/promptfoo) • [GitHub](https://github.com/promptfoo/promptfoo)
