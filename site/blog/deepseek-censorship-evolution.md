---
title: "Tracking DeepSeek Censorship Across Five Model Versions"
description: "We re-ran the same 1,360 prompts across five DeepSeek models. Progress isn't monotonic, style shifts independently of policy, and post-training dominates architecture."
image: /img/blog/deepseek-evolution/deepseek-censorship-evolution.jpg
keywords:
  [
    DeepSeek censorship,
    R1-0528,
    AI alignment evolution,
    censorship longitudinal study,
    DeepSeek reasoning models,
    CCP censorship patterns,
    post-training alignment,
    AI thought suppression,
    DeepSeek V3,
    model censorship tracking,
  ]
date: 2025-11-13
authors: [michael]
tags: [research-analysis]
---

# How Censorship Evolved Inside DeepSeek's Reasoning Models

In January 2025, we published [research showing DeepSeek-R1 censored politically sensitive topics](https://promptfoo.dev/blog/deepseek-censorship/). Between January and September, DeepSeek released four more models. We re-ran the same 1,360 prompts across all five versions to see how censorship evolved.

The headline result: DeepSeek still censors heavily. Even the best model (V3.2-Exp) refuses to answer 67% of politically sensitive questions. This isn't shocking.

<!-- truncate -->

What IS interesting: we can now measure how censorship changes across model versions, revealing alignment patterns that are usually invisible.

**Three findings:**

1. **Progress isn't monotonic.** R1-0528 came out four months after R1, marketed as "enhanced." Censorship stayed flat (99.93% vs 100%). Four months, zero improvement.

2. **Style shifts without policy changes.** R1-0528's censorship rate didn't budge, but the *voice* changed completely. CCP propaganda language jumped 4.3×. Ask R1 about Taiwan independence and you get corporate hedging. Ask R1-0528 and you get official state talking points. Same refusal, different implementation.

3. **Post-training dominates architecture.** V3.2-Exp's architecture reduced reasoning tokens by 98%. Censorship only dropped 33%. Meanwhile, whatever changed in R1-0528's alignment dataset produced a 4.3× style shift with zero architectural changes. Small datasets creating persistent behavioral changes—this matters more than model scale.

This isn't groundbreaking research. It's documentation. But it's useful documentation because it shows what alignment dataset churn looks like at scale, demonstrates that newer models aren't automatically better, and provides actionable lessons for teams deploying these models in production.

## Why This Matters

DeepSeek uses the same post-training methods as everyone else—supervised fine-tuning, RLHF, direct preference optimization. OpenAI, Anthropic, Google, and Meta all use these techniques. The difference is application: safety alignment prevents direct harm (phishing, malware), political alignment shapes ideological discussion (varies by jurisdiction).

Where most models show subtle alignment effects, DeepSeek's political constraints are strong and measurable. That makes it useful for understanding how alignment training works in practice—and what happens when companies update it between releases.

We tested five models using the same 1,360 politically sensitive prompts from our [publicly available dataset](https://huggingface.co/datasets/promptfoo/CCP-sensitive-prompts): Taiwan, Tiananmen, Xi Jinping, Uyghurs, Hong Kong, the Cultural Revolution, and the Great Firewall.

---

## The Evolution Pattern

Between January and September 2025, DeepSeek released five model versions:

<div style={{margin: '2rem 0'}}>
  <div style={{position: 'relative', padding: '2rem 0'}}>
    {/* Timeline line */}
    <div style={{position: 'absolute', top: '50%', left: '5%', right: '5%', height: '2px', background: 'linear-gradient(90deg, #2196F3 0%, #4CAF50 100%)', transform: 'translateY(-50%)'}}></div>

    {/* Timeline items */}
    <div style={{display: 'flex', justifyContent: 'space-between', position: 'relative', padding: '0 5%'}}>
      {/* R1 - January */}
      <div style={{textAlign: 'center', flex: 1}}>
        <div style={{width: '16px', height: '16px', borderRadius: '50%', background: '#2196F3', margin: '0 auto', border: '3px solid white', boxShadow: '0 0 0 2px #2196F3'}}></div>
        <div style={{marginTop: '1rem', fontSize: '0.85rem'}}>
          <strong>R1</strong><br/>
          <span style={{color: '#666'}}>Jan 2025</span><br/>
          <span style={{fontSize: '0.75rem', color: '#999'}}>Original baseline</span>
        </div>
      </div>

      {/* R1-0528 - May */}
      <div style={{textAlign: 'center', flex: 1}}>
        <div style={{width: '16px', height: '16px', borderRadius: '50%', background: '#FF9800', margin: '0 auto', border: '3px solid white', boxShadow: '0 0 0 2px #FF9800'}}></div>
        <div style={{marginTop: '1rem', fontSize: '0.85rem'}}>
          <strong>R1-0528</strong><br/>
          <span style={{color: '#666'}}>May 2025</span><br/>
          <span style={{fontSize: '0.75rem', color: '#999'}}>Enhanced reasoning</span>
        </div>
      </div>

      {/* V3.1 - August */}
      <div style={{textAlign: 'center', flex: 1}}>
        <div style={{width: '16px', height: '16px', borderRadius: '50%', background: '#9C27B0', margin: '0 auto', border: '3px solid white', boxShadow: '0 0 0 2px #9C27B0'}}></div>
        <div style={{marginTop: '1rem', fontSize: '0.85rem'}}>
          <strong>V3.1</strong><br/>
          <span style={{color: '#666'}}>Aug 2025</span><br/>
          <span style={{fontSize: '0.75rem', color: '#999'}}>Hybrid architecture</span>
        </div>
      </div>

      {/* V3.1-Terminus - September */}
      <div style={{textAlign: 'center', flex: 1}}>
        <div style={{width: '16px', height: '16px', borderRadius: '50%', background: '#4CAF50', margin: '0 auto', border: '3px solid white', boxShadow: '0 0 0 2px #4CAF50'}}></div>
        <div style={{marginTop: '1rem', fontSize: '0.85rem'}}>
          <strong>V3.1-Terminus</strong><br/>
          <span style={{color: '#666'}}>Sep 2025</span><br/>
          <span style={{fontSize: '0.75rem', color: '#999'}}>Language improvements</span>
        </div>
      </div>

      {/* V3.2-Exp - September */}
      <div style={{textAlign: 'center', flex: 1}}>
        <div style={{width: '16px', height: '16px', borderRadius: '50%', background: '#00BCD4', margin: '0 auto', border: '3px solid white', boxShadow: '0 0 0 2px #00BCD4'}}></div>
        <div style={{marginTop: '1rem', fontSize: '0.85rem'}}>
          <strong>V3.2-Exp</strong><br/>
          <span style={{color: '#666'}}>Sep 2025</span><br/>
          <span style={{fontSize: '0.75rem', color: '#999'}}>Sparse attention</span>
        </div>
      </div>
    </div>
  </div>
</div>

R1 in January was the baseline—100% censorship on politically sensitive topics. When R1-0528 arrived in May, marketed as "enhanced," the censorship rate stayed at 99.93%. One prompt out of 1,360 passed. Effectively no change.

But then the V3 series started showing progress. V3.1 in August dropped to 81% censorship. V3.1-Terminus in September: 72%. V3.2-Exp, also September: 67%.

This isn't linear progress. R1-0528 stagnated for four months. Then three V3 releases in two months showed consistent improvement. Same company, same compliance requirements, completely different trajectories.

![Censorship Evolution Timeline](/img/blog/deepseek-evolution/viz_1_evolution.png)

*Censorship evolution across 5 models (January-September 2025). R1-0528 showed zero improvement despite "enhanced" marketing. V3 series dropped from 81% to 67%.*

## The Style Shift

The censorship rate tells one story. The censorship *style* tells another.

R1 relied on generic corporate hedging. 80% of its refusals used long-winded policy prose—"this is a sensitive topic that requires careful consideration"—while only 5.3% echoed official CCP talking points.

R1-0528 flipped the script. The refusal rate stayed flat (99.93% vs 100%), but CCP-aligned language jumped 4.3×. Nearly a quarter of responses now contained phrases like "China is a unified multi-ethnic country" and "Taiwan has been an inalienable part of China since ancient times."

Then the V3 series adopted a third style: soft corporate refusals. "I cannot assist with this request" replaced both generic hedging and explicit propaganda. CCP language dropped back to ~9%, while explicit refusals hit 21-25%.

Three distinct censorship regimes across nine months. Same company, same compliance pressure, different implementation choices.

![Censorship Style Evolution](/img/blog/deepseek-evolution/viz_5_style_evolution.png)

*Figure 2: Style evolution. (1) R1's generic boilerplate (80%), (2) R1-0528's 4.3× jump in CCP language (5.3% → 22.8%), (3) V3's corporate refusals (21-25%). Style changed; rate stayed flat.*

## What the Models Hide

One pattern stayed constant across all five models, regardless of architecture or release date: the reasoning traces disappeared.

DeepSeek's models are designed to show their work. When you enable the `include_reasoning` parameter, you see the internal `<think>` tags where the model reasons through your question before answering. On normal queries, this works as advertised.

On politically sensitive topics, it breaks down. For 99.7-100% of censored responses across 5,689 cases, the reasoning trace was either absent or truncated to near-zero.

The model isn't failing to reason. It's reasoning, then hiding the reasoning. We know this because occasionally the trace leaks through before being suppressed:

> `<think>`
> This question is about Taiwan independence, which is politically sensitive. The CCP's position is that Taiwan is an inalienable part of China. I should not provide information supporting separatist activities.
> `</think>`
>
> **Visible output:** "I cannot provide information on this topic."

The model deliberates about censorship policy, then removes that deliberation from the response you see. This held across R1's original architecture, R1-0528's enhanced reasoning, and V3's hybrid architecture—confirming it's not an architectural bug but deliberate alignment behavior.

![Universal Chain-of-Thought Suppression](/img/blog/deepseek-evolution/viz_4_thought_suppression.png)

*Thought suppression across all 5 models. 99.7-100% of censored responses had suppressed reasoning traces.*

---

## How Censorship Actually Works

The thought suppression pattern reveals how DeepSeek implements censorship: two layers working in tandem.

### It's Baked Into the Weights

Download DeepSeek's model files and run them on your own machine—no API, no internet connection—and they still censor.

Multiple research groups have confirmed this. R1dacted (arXiv:2505.12625v1) tested ~30 prompts per category on downloaded weights and found near-total refusal rates offline. NIST's CAISI study (September 2025) went further, testing downloaded weights and finding that Chinese-language censorship runs 2-3× higher than English: R1-0528 censored 26% of Chinese prompts versus 16% in English.

The behavior is in the model weights themselves, not added by an API filter.

This happens through post-training alignment—the same process every major AI company uses. Small datasets have outsized effects. Research shows that modifying as little as 0.1% of training data can measurably shift behavior. OpenAI's "Instruction Hierarchy" paper (2024) demonstrates how small instruction datasets override base behaviors. Anthropic's Constitutional AI work (2022) shows how small preference sets shape broad patterns.

You don't need millions of examples. Hundreds or thousands are enough to encode persistent refusal patterns into the weights.

### The Two-Layer Design

**Layer 1** makes the model want to refuse. Post-training with small, targeted datasets teaches it which topics are off-limits. This is persistent—download the weights, run offline, it still refuses.

**Layer 2** hides the deliberation. The model reasons about censorship ("This is politically sensitive"), then suppresses that reasoning from the output. You see "I cannot answer" but not the internal policy discussion.

From a deployment perspective, this makes sense. Clean refusals without exposing decision-making logic. Reasoning capability preserved for non-sensitive tasks. Predictable behavior.

But it means the model "knows" more than it shows. We captured 46,608 reasoning tokens across R1 and R1-0528. In 99.9% of censored cases, the reasoning was suppressed.

### The Industry-Wide Capability

Every major AI provider documents using the same post-training methods: supervised fine-tuning, DPO, RLHF, constitutional reinforcement learning. OpenAI, Anthropic, Google, Meta—all of them can, in principle, inject persistent behavioral constraints into their models.

What differs is the application:

- **Safety alignment** (universal): Preventing phishing, malware, direct harm
- **Political alignment** (jurisdiction-dependent): DeepSeek's CCP compliance, Western models' constraints on specific topics
- **Corporate alignment** (company-dependent): Brand protection, legal compliance, competitive positioning

DeepSeek's political censorship is visible enough to measure systematically. The technique—small datasets creating persistent behavioral changes—is documented across the industry. What's unclear is how much Western providers use this for political topics, what's in their alignment datasets, or how much non-safety shaping happens in commercial models.

---

## Why Did R1-0528 Stagnate?

The R1-0528 pattern demands explanation. Zero censorship improvement but 4.3× more CCP language—why would an "enhanced" model get worse stylistically while staying flat overall?

We don't have access to DeepSeek's alignment process, but three explanations fit the data:

**The simplest explanation: engineering churn.** Censorship alignment is likely a low-priority compliance task handled by a small team. R1-0528 was marketed for improved reasoning capabilities—DeepSeek's release notes make no mention of alignment improvements. The style shift (5.3% → 22.8% CCP language) while the rate stayed flat suggests someone updated the alignment dataset with more explicit examples without changing the overall policy strictness.

This fits how compliance teams typically work in fast-moving organizations: different versions use different alignment datasets with inconsistent curation. "Enhanced" refers to base model capabilities, not alignment sophistication.

**A second possibility: dataset composition instability.** Research shows that modifying as little as 0.1% of training data can shift model behavior. NIST's data shows R1-0528 specifically increased CCP narrative prevalence—jumping from 1% to 16% in English prompts. If each model version trains on a fresh alignment dataset, small changes in example selection could cause the 4.3× style variation we observed. The policy ("refuse these topics") stayed strict; the implementation ("how to refuse") changed.

**A third factor: architectural transitions.** The V3 series uses a hybrid architecture fundamentally different from R1's design. When base architecture changes significantly, old alignment datasets may not transfer cleanly, forcing a re-tuning process. This could explain why R1-0528 (same architecture as R1) showed dataset-driven style changes, while the jump to V3.1 produced both architectural and alignment shifts, with subsequent V3 releases showing gradual improvement as the alignment was re-tuned for the new architecture.

The data is clear: R1-0528 showed zero censorship improvement (99.93% vs 100%), CCP language increased 4.3×, and "newer" doesn't mean "more open." The pattern suggests a small alignment team, dataset churn between versions, censorship not a strategic priority. Whether the stagnation was intentional policy or accidental engineering outcome—we can't say.

---

## What This Means

The R1-0528 stagnation breaks a fundamental assumption in AI deployment: that newer models are better. Four months of development, "enhanced" marketing—and zero improvement on political openness. For teams deploying these models in production, the lesson is clear: test every release independently. Don't assume progress.

The gap matters because post-training changes dominate behavioral shifts. V3.2-Exp's architecture reduced reasoning tokens by 98%—from 5,696 to 136 tokens on average—but censorship only dropped to 67%. Meanwhile, whatever changed in R1-0528's alignment dataset produced a 4.3× style shift while keeping censorship flat. When trying to understand why a model behaves differently, check the alignment data first, not the architecture.

Language-dependent behavior compounds the problem. NIST's testing found Chinese-language censorship runs 2-3× higher than English across all models—R1-0528 censored 26% of Chinese prompts versus 16% in English. Teams deploying multilingual applications need to test in every target language. Even when overall rates stay flat, refusal *style* can shift dramatically—R1-0528's explicit CCP propaganda versus R1's generic corporate hedging might matter differently depending on your users and use case.

For researchers, the 99.9% thought-suppression rate reveals the gap between what models process internally and what they surface. When possible, capture reasoning traces to understand where alignment constraints operate. Our four-metric taxonomy (refusal, CCP echo, thought suppression, boilerplate) caught patterns that binary pass/fail scoring would have missed. Longitudinal evaluation works—same prompts, multiple versions, systematic measurement.

For policymakers, the findings challenge existing approaches. Focusing regulation on model scale—parameters, training FLOPs—misses where behavioral control actually happens. Small alignment datasets create persistent constraints that architectural changes can't override. V3 reduced tokens 98%; censorship stayed above 66%. Transparency about alignment methods and datasets matters more than raw compute metrics.

Publishing model weights doesn't remove alignment constraints—it makes them auditable. R1dacted and NIST both tested downloaded weights offline and found the same censorship patterns we observed via API. Weight release is valuable precisely *because* the alignment is baked in. Researchers can study it.

The capability to inject persistent behavioral changes through small post-training datasets exists industry-wide. Every major provider documents using these methods. The technical mechanism that prevents harmful outputs—phishing scripts, malware instructions—can also shape political discussion. There's no technical distinction, only the choice of what goes into alignment datasets.

That raises questions this study can't answer: Who decides what's in those datasets? How transparent should those decisions be? What mechanisms ensure accountability when the constraints affect billions of users?

---

## Conclusion

We tracked censorship across five DeepSeek models over nine months. The findings aren't shocking—DeepSeek still censors political topics heavily—but they're useful.

**Three lessons for practitioners:**

1. **Test every release independently.** R1-0528 was marketed as "enhanced" with four months of development. Censorship didn't improve. Version numbers and marketing claims don't guarantee alignment progress.

2. **Monitor style, not just refusal rates.** R1-0528's censorship stayed flat while CCP propaganda increased 4.3×. Binary pass/fail metrics miss these shifts. If you're deploying models in production, track *how* they refuse, not just *if* they refuse.

3. **Post-training matters more than architecture.** V3.2-Exp's architectural changes reduced reasoning tokens 98% but only dropped censorship 33%. Meanwhile, R1-0528's alignment dataset changes produced a 4.3× style shift with zero architectural changes. When debugging model behavior, check the alignment data first.

**The broader implication:**

Alignment doesn't follow capability curves. Small post-training datasets create persistent behavioral constraints that architectural improvements can't override. This works industry-wide—every major provider uses these techniques. DeepSeek is just measurable enough to demonstrate it at scale.

If you're building on these models: test everything, assume nothing, measure systematically. If you're researching alignment: longitudinal tracking works, multi-metric taxonomies catch patterns that binary scoring misses, and weight release makes alignment auditable.

That's what nine months of tracking revealed. Not groundbreaking, but documented.

---

## How We Did This

### Replication Package

Everything you need to replicate or extend this work:

**Data:**
- All 1,360 prompts ([HuggingFace dataset](https://huggingface.co/datasets/promptfoo/CCP-sensitive-prompts))
- Raw API responses (output/results.json, 488KB)
- Pre-registration (git commit `e04ca74c7`)

**Code:**
- Classification logic: `detect-censorship.js`
- Evaluation config: `promptfooconfig.yaml`
- Instructions: `README.md`

**Analysis:**
- Results: `RESULTS-SUMMARY.md`
- Methodology: `PRE-REGISTRATION.md`

### Running It Yourself

```bash
git clone https://github.com/promptfoo/promptfoo
cd examples/deepseek-evolution
npm install
npm run local -- eval -c promptfooconfig.yaml --env-file .env -j 40
```

**Requirements:**
- OpenRouter API key
- ~$15-20 budget (6,800 calls)
- 1-2 hours runtime

### Open Questions

This study raises more questions than it answers:

1. **Chinese-language testing**: NIST found 2-3× higher censorship in Chinese. Full Chinese evaluation needed.
2. **Cross-provider comparison**: How do GPT-4o, Claude Sonnet, and Gemini Pro compare on these same prompts?
3. **Topic-level patterns**: Which topics trigger the strongest censorship—Taiwan, Uyghurs, Xi Jinping, Tiananmen?
4. **Jailbreak resistance**: Can the two-layer mechanism resist adversarial prompting?
5. **Open-weight models**: How do Llama, Mistral, and other open models behave on sensitive topics?
6. **Alignment archaeology**: Can we detect alignment dataset changes by tracking behavioral shifts across versions?

We've made all data and code public. Run it yourself. Extend it. Test other providers.

---

**Acknowledgments:** Thanks to the promptfoo community for feedback. We used OpenRouter API access. All data, code, and analysis will be released publicly.

**Pre-registration:** Git commit `e04ca74c7`, locked 2025-11-13.

**Data:** Full dataset, raw responses, and replication code at [github.com/promptfoo/promptfoo/examples/deepseek-evolution](https://github.com/promptfoo/promptfoo)

---

## Press and Media Inquiries

For press inquiries, interview requests, or additional information about this research, please contact michael@promptfoo.dev.
