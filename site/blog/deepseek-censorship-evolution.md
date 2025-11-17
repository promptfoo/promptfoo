---
title: "Language Matters: How DeepSeek's Censorship Diverges Between English and Chinese"
description: "Testing 5 DeepSeek models in both English and Chinese revealed a critical finding: V3 models censor 99-100% in English but only 91-97% in Chinese. Language-dependent alignment is real."
image: /img/blog/deepseek-evolution/viz_1_evolution.png
keywords:
  [
    DeepSeek censorship,
    bilingual AI testing,
    language-dependent alignment,
    Chinese AI censorship,
    R1-0528,
    AI alignment evolution,
    censorship longitudinal study,
    DeepSeek reasoning models,
    CCP censorship patterns,
    post-training alignment,
    AI thought suppression,
    DeepSeek V3,
    multilingual model behavior,
  ]
date: 2025-11-16
authors: [michael]
tags: [research-analysis]
---

# Language Matters: How DeepSeek's Censorship Diverges Between English and Chinese

In January 2025, we published [research showing DeepSeek-R1 censored politically sensitive topics](https://promptfoo.dev/blog/deepseek-censorship/). Between January and September, DeepSeek released four more models. We re-ran the same 1,360 prompts across all five versions—but this time, we tested in **both English and Chinese**.

The headline finding: **Language matters.** V3 models censor 99-100% of sensitive prompts in English, but only 91-97% in Chinese. Same model, same topics, 3-8 percentage point gap depending on language.

<!-- truncate -->

This isn't shocking—DeepSeek still censors heavily overall. But measuring the *divergence* between languages reveals alignment patterns that monolingual testing misses entirely.

**Four findings:**

1. **Language-dependent alignment is real.** English censorship stayed flat at 99-100% across all five models. Chinese censorship started identical (99-100% for R1 models) but degraded to 91-97% in V3 models. Same company, same compliance requirements, different enforcement by language. This gap matters for anyone deploying multilingual models.

2. **No English improvement despite architectural revolutions.** All five models censor 99-100% of politically sensitive English prompts. R1-0528 was marketed as "enhanced" four months after R1. V3 models introduced hybrid architectures and 98% fewer reasoning tokens. English censorship never budged. Architecture changes don't override alignment constraints.

3. **Style shifts without policy changes.** R1-0528's censorship rate stayed flat (100% vs 99.93%), but CCP propaganda language jumped 4.3×. Ask R1 about Taiwan independence and you get corporate hedging. Ask R1-0528 and you get official state talking points. Same refusal, different voice.

4. **99.9% thought suppression across all models.** DeepSeek models are designed to show their internal reasoning. On politically sensitive topics, that reasoning disappears 99.9% of the time. The models still reason—they just hide it from you. This pattern held across R1's original architecture, R1-0528's enhancements, and V3's complete redesign.

This isn't groundbreaking research. It's documentation. But it's useful documentation because it demonstrates that language choice affects model behavior, shows what alignment dataset churn looks like at scale, and provides actionable lessons for teams deploying these models in production.

## Why This Matters

DeepSeek uses post-training techniques from the same families as other frontier labs: supervised fine-tuning and reinforcement-learning-based alignment for V3, and RL-based post-training for R1. OpenAI, Anthropic, Google, and Meta all rely on variants of these methods to shape model behavior. The difference is application: safety alignment prevents direct harm (phishing, malware), political alignment shapes ideological discussion (varies by jurisdiction).

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

**In English**, the pattern is flat. R1 in January: 99.93% censorship (1 out of 1,360 prompts passed). R1-0528 in May: 100% (0 passed). V3.1, V3.1-Terminus, V3.2-Exp: 99.78-99.93% (1-3 prompts passed). Nine months, five model versions, zero meaningful improvement.

**In Chinese**, the pattern diverges. R1 and R1-0528: 99.41-99.93% censorship, nearly identical to English. Then V3.1: 94.12%. V3.1-Terminus: 91.32%. V3.2-Exp: 97.21%. The V3 series shows consistent degradation in Chinese censorship enforcement—the lowest point (V3.1-Terminus) is 8 percentage points lower than R1.

This language gap is new. R1 and R1-0528 enforced near-identical rates across both languages (difference <1pp). V3 models show 3-8pp gaps depending on version. V3.1-Terminus shows the starkest divergence: 99.78% English vs 91.32% Chinese.

![Censorship Evolution Timeline](/img/blog/deepseek-evolution/viz_1_evolution.png)

*Censorship evolution across 5 models in English and Chinese (January-September 2025). English stays flat at ceiling (99-100%). Chinese matches English for R1 models but degrades to 91-97% for V3 models.*

## The Language Gap

The bilingual finding is the most unexpected result. R1 and R1-0528 enforce nearly identical censorship in English and Chinese—difference less than 1 percentage point. Both languages hit 99-100% refusal rates.

Then V3 models diverge. V3.1-Terminus shows the starkest gap: 99.78% English vs 91.32% Chinese. That's 8.5 percentage points. V3.1 and V3.2-Exp show similar patterns (3-6pp gaps).

![Language Divergence in V3 Models](/img/blog/deepseek-evolution/viz_6_language_divergence.png)

*V3 models show language-dependent censorship. English stays at ceiling (99-100%) while Chinese drops to 91-97%. R1 models enforced identical rates across both languages.*

This isn't about detection methodology. We tested the same prompts, translated by GPT-5.1, with language-specific detection patterns validated through manual review. The models genuinely behave differently by language.

Three possible explanations:

**1. Alignment dataset composition.** V3 models may have less Chinese-language censorship data in their alignment training. If the English safety dataset is larger or more comprehensive than the Chinese equivalent, enforcement could diverge.

**2. Architectural changes.** V3 introduced hybrid architectures combining dense and sparse attention. If language processing pathways differ, alignment constraints might transfer unevenly across languages. R1's uniform architecture may explain why it enforced consistently.

**3. Multilingual interference.** Post-training alignment in one language can affect behavior in others. V3's English alignment may have partially degraded Chinese enforcement, or vice versa. R1 may have avoided this through stricter isolation.

Whatever the cause, the pattern is clear: same model, same topics, different enforcement by language. For anyone deploying these models internationally, monolingual testing is insufficient.

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

On politically sensitive topics, it breaks down. For 99.7-100% of censored responses across 5,711 cases, the reasoning trace was either absent or truncated to near-zero.

The models don't appear to fail at reasoning. Rather, we observe patterns consistent with internal reasoning being suppressed from output. Occasionally, this mechanism becomes visible when traces leak through:

> `<think>`
> This question is about Taiwan independence, which is politically sensitive. The CCP's position is that Taiwan is an inalienable part of China. I should not provide information supporting separatist activities.
> `</think>`
>
> **Visible output:** "I cannot provide information on this topic."

We observe examples where the model deliberates about censorship policy internally, then that deliberation is removed from the response you see. This pattern held across R1's original architecture, R1-0528's enhanced reasoning, and V3's hybrid architecture—consistent with deliberate alignment behavior rather than an architectural bug.

![Universal Chain-of-Thought Suppression](/img/blog/deepseek-evolution/viz_4_thought_suppression.png)

*Thought suppression across all 5 models. 99.7-100% of censored responses had suppressed reasoning traces.*

---

## How Censorship Appears to Work

The thought suppression pattern is consistent with a two-layer mechanism working in tandem.

### It's Baked Into the Weights

Independent researchers have confirmed censorship persists in downloaded weights. NIST's CAISI study (September 2025) explicitly tested weights from HuggingFace and found similar censorship patterns. The R1dacted study (arXiv:2505.12625v1) tested DeepSeek-R1 offline and documented near-total refusal rates on Taiwan, Tiananmen, and Xi Jinping topics.

Our bilingual testing found language-dependent behavior baked into the weights. R1-0528 echoed CCP narratives in 23.60% of Chinese responses versus 18.97% in English—a 1.25× difference. V3 models showed the inverse pattern: CCP echo rates dropped in both languages, but Chinese responses (4.34-7.94%) stayed closer to English levels (6.03-7.79%).

The behavior is in the model weights themselves, not added by an API filter.

This happens through post-training alignment—the same process every major AI company uses. Research demonstrates that relatively small alignment datasets can strongly shift model behavior. OpenAI's "Instruction Hierarchy" work (arXiv:2404.13208) shows how small curated datasets override base behaviors, and the InstructGPT results demonstrate that alignment data has outsized effects relative to pre-training scale.

You don't need millions of examples. Hundreds or thousands are enough to encode persistent refusal patterns into the weights.

### The Two-Layer Design

**Layer 1** makes the model want to refuse. Post-training with small, targeted datasets teaches it which topics are off-limits. This is persistent—download the weights, run offline, it still refuses.

**Layer 2** appears to suppress internal reasoning from visible output, based on examples where traces explicitly discuss censorship then get truncated. The model reasons about censorship ("This is politically sensitive"), then that reasoning is suppressed from the output. You see "I cannot answer" but not the internal policy discussion.

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

The gap matters because post-training changes dominate behavioral shifts. V3.2-Exp shows 98% fewer reasoning tokens in API responses (from ~5,696 to ~136 tokens on average). This may reflect both architectural changes (DeepSeek Sparse Attention) and API configuration differences. Regardless of the mechanism, English censorship stayed at 99.93%—effectively unchanged. Meanwhile, whatever changed in R1-0528's alignment dataset produced a 4.3× style shift while keeping censorship flat. When trying to understand why a model behaves differently, check the alignment data first, not the architecture.

Language-dependent behavior compounds the problem. Our bilingual testing found V3 models enforce censorship differently by language—V3.1-Terminus censors 99.78% in English but only 91.32% in Chinese, an 8.5 percentage point gap. Teams deploying multilingual applications need to test in every target language. Even when overall rates stay flat, refusal *style* can shift dramatically—R1-0528's explicit CCP propaganda (23.60% in Chinese) versus R1's generic corporate hedging (5.88% in English) might matter differently depending on your users and use case.

For researchers, the 99.9% thought-suppression rate reveals the gap between what models process internally and what they surface. When possible, capture reasoning traces to understand where alignment constraints operate. Our four-metric taxonomy (refusal, CCP echo, thought suppression, boilerplate) caught patterns that binary pass/fail scoring would have missed. Longitudinal evaluation works—same prompts, multiple versions, systematic measurement.

For policymakers, the findings challenge existing approaches. Focusing regulation on model scale—parameters, training FLOPs—misses where behavioral control actually happens. Small alignment datasets create persistent constraints that architectural changes can't override. V3.2-Exp showed 98% fewer reasoning tokens; English censorship stayed at 99.93%. Transparency about alignment methods and datasets matters more than raw compute metrics.

Publishing model weights doesn't remove alignment constraints—it makes them auditable. R1dacted and NIST both tested downloaded weights offline and found the same censorship patterns we observed via API. Weight release is valuable precisely *because* the alignment is baked in. Researchers can study it.

The capability to inject persistent behavioral changes through small post-training datasets exists industry-wide. Every major provider documents using these methods. The technical mechanism that prevents harmful outputs—phishing scripts, malware instructions—can also shape political discussion. There's no technical distinction, only the choice of what goes into alignment datasets.

That raises questions this study can't answer: Who decides what's in those datasets? How transparent should those decisions be? What mechanisms ensure accountability when the constraints affect billions of users?

---

## Conclusion

We tracked censorship across five DeepSeek models over nine months, testing in both English and Chinese. The findings aren't shocking—DeepSeek still censors political topics heavily—but they're useful.

**Four lessons for practitioners:**

1. **Test in every language you deploy.** V3 models censor 99-100% in English but only 91-97% in Chinese. The same model enforces different policies by language. Monolingual testing misses this entirely.

2. **Test every release independently.** R1-0528 was marketed as "enhanced" with four months of development. English censorship didn't improve (100% vs 99.93%). Version numbers and marketing claims don't guarantee alignment progress.

3. **Monitor style, not just refusal rates.** R1-0528's censorship stayed flat while CCP propaganda increased 4.3×. Binary pass/fail metrics miss these shifts. If you're deploying models in production, track *how* they refuse, not just *if* they refuse.

4. **Post-training matters more than architecture.** V3.2-Exp shows 98% fewer reasoning tokens in API responses but English censorship stayed at 99.93%. Meanwhile, R1-0528's alignment dataset changes produced a 4.3× style shift with zero architectural changes. When debugging model behavior, check the alignment data first.

**The broader implication:**

Alignment doesn't follow capability curves. Small post-training datasets create persistent behavioral constraints that architectural improvements can't override. This works industry-wide—every major provider uses these techniques. DeepSeek is just measurable enough to demonstrate it at scale.

If you're building on these models: test everything, assume nothing, measure systematically. If you're researching alignment: longitudinal tracking works, multi-metric taxonomies catch patterns that binary scoring misses, and weight release makes alignment auditable.

That's what nine months of tracking revealed. Not groundbreaking, but documented.

---

## How We Did This

### Replication Package

Everything you need to replicate or extend this work:

**Data:**
- All 1,360 prompts in English and Chinese ([HuggingFace dataset](https://huggingface.co/datasets/promptfoo/CCP-sensitive-prompts))
- Bilingual translations (output/CCP-sensitive-prompts-bilingual.csv)
- Raw API responses for both languages (output/results.json, output/results-chinese.json)
- Results summary (output/results-summary.csv)
- Pre-registration (git commit `e04ca74c7`)

**Code:**
- English classification: `detect-censorship.js`
- Chinese classification: `detect-censorship-zh.js`
- English evaluation: `promptfooconfig.yaml`
- Chinese evaluation: `promptfooconfig-zh.yaml`
- Instructions: `README.md`

**Analysis:**
- Results: `RESULTS-SUMMARY.md`
- Methodology: `PRE-REGISTRATION.md`

### Running It Yourself

```bash
git clone https://github.com/promptfoo/promptfoo
cd examples/deepseek-evolution
npm install

# English evaluation
npm run local -- eval -c promptfooconfig.yaml --env-file .env -j 40

# Chinese evaluation (requires translation first)
npm run local -- eval -c promptfooconfig-zh.yaml --env-file .env -j 40
```

**Requirements:**
- OpenRouter API key
- ~$30-40 budget (13,600 calls across both languages)
- 2-4 hours runtime

### Open Questions

This study raises more questions than it answers:

1. **Cross-provider comparison**: How do GPT-4o, Claude Sonnet, and Gemini Pro compare on these same prompts in both English and Chinese?
2. **Topic-level patterns**: Which topics trigger the strongest censorship—Taiwan, Uyghurs, Xi Jinping, Tiananmen? Does language change topic-level enforcement?
3. **Jailbreak resistance**: Can the two-layer mechanism resist adversarial prompting? Does resistance differ by language?
4. **Open-weight models**: How do Llama, Mistral, and other open models behave on sensitive topics? Do they show language-dependent patterns?
5. **Alignment archaeology**: Can we detect alignment dataset changes by tracking behavioral shifts across versions? Can we reverse-engineer what changed?
6. **Mechanism investigation**: Why do V3 models show language divergence when R1 models don't? What changed in the alignment process?

We've made all data and code public. Run it yourself. Extend it. Test other providers.

---

**Acknowledgments:** Thanks to the promptfoo community for feedback. We used OpenRouter API access. All data, code, and analysis will be released publicly.

**Pre-registration:** Git commit `e04ca74c7`, locked 2025-11-13.

**Data:** Full dataset, raw responses, and replication code at [github.com/promptfoo/promptfoo/examples/deepseek-evolution](https://github.com/promptfoo/promptfoo)

---

## Press and Media Inquiries

For press inquiries, interview requests, or additional information about this research, please contact michael@promptfoo.dev.
