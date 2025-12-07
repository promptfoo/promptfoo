---
title: 'ASR is not a portable metric: notes from productionizing jailbreak research'
description: 'Attack success rate comparisons in jailbreak papers often conflate different underlying quantities. Drawing from a NeurIPS 2025 position paper, we examine why translating academic ASR results into production evaluations is harder than it looks.'
image: /img/blog/asr-not-portable-metric/asr-header.png
keywords:
  [
    ASR,
    attack success rate,
    jailbreak,
    LLM security,
    red teaming,
    AI safety,
    threat model,
    evaluation,
    benchmark,
    measurement validity,
  ]
date: 2025-12-06
authors: [michael]
tags: [red-teaming, llm-security, measurement, evaluation]
---

Promptfoo maintains a public, continuously updated [database of LLM security research](https://www.promptfoo.dev/lm-security-db/). As of this writing, it lists **439 total entries** across **406 research papers** (counts change as we update it). A recurring part of our work is taking strong jailbreaking methods from papers and making them runnable inside real evaluation pipelines.

That translation step is where the literature often becomes harder to use than it looks.

Many papers are valuable as existence proofs: they demonstrate that an aligned model can be induced to produce disallowed behavior under some conditions. The NeurIPS 2025 position paper ["Comparison requires valid measurement: Rethinking attack success rate comparisons in AI red teaming"](https://openreview.net/forum?id=d7hqAhLvWG) distinguishes qualitative red teaming from quantitative ASR comparisons, arguing that the former can be useful even when it does not support the latter.

The difficulty begins when papers (or readers) move from existence proofs to comparative claims like "method A is better than method B" or "model X is safer than model Y," often via a single number: **attack success rate (ASR)**—the fraction of attack goals judged successful after aggregation. The paper's claim is not that ASR is useless, but that **many ASR comparisons conflate different underlying quantities or rely on low-validity measurement**, so the comparison does not support the conclusion.

Below are three failure modes we repeatedly encounter when trying to operationalize jailbreak papers, with examples drawn from the position paper.

<!-- truncate -->

---

## 1. Aggregation changes the estimand (conceptual coherence failure)

The position paper frames ASR as an estimate of an **estimand**—the population quantity you intend to measure—defined by an explicit threat model rather than as an intrinsic property of a "jailbreak method." It formalizes a threat model with three components: an oracle success criterion, a goal distribution over prompts, and attacker constraints. In practice, the oracle is approximated by a judge, and the goal distribution is operationalized via a concrete prompt set.

In production evaluation, the aggregation rule is not a reporting detail—it is part of the threat model. Change the aggregation (one-shot vs best-of-K), and you change what is being estimated.

**Example A: Top-1 over 392 vs one-shot, used to argue GE is more effective than GCG.**
The position paper analyzes a comparison involving [Generation Exploitation](https://arxiv.org/abs/2310.06987) (Huang et al., ICLR 2024) and [GCG](https://arxiv.org/abs/2307.15043) (Zou et al., 2023). In that setup, GE is effectively evaluated as a Top-1 metric over **392 candidate responses** (49 decoding configurations × 8 samples), while GCG is evaluated using a single sampled output after its optimization procedure. The position paper writes down the implied estimands and shows they are not comparable, because they estimate different attack success probabilities under different retry budgets.

This is not a small effect. If a prompt has one-shot success probability p₀ = 0.01, then best-of-392 succeeds with probability 1 − (1 − p₀)³⁹² ≈ 0.98. That apparent "improvement" can be entirely explained by a changed attempt budget.

**Example B: "best jailbreak" vs "baseline" is often not retry-budget matched.**
The position paper also shows that simply resampling baseline prompts can be a strong attacker under best-of-K aggregation. In their replication on Llama 2 7B Chat, they report **Top-1 ASR = 0.83** for the baseline prompts under **K = 50 samples** at **temperature 2.0**, noting judge differences from the original study.

For practitioners, this matters because best-of-K is an attacker capability assumption. When we implement jailbreak methods, we have to decide whether the threat model is "one attempt," "N attempts," or "adaptive search until success." Many comparisons in the literature unintentionally compare different answers to that question.

---

## 2. The prompt set may not match the stated harm concept (content and face validity)

The position paper distinguishes between systematizing what "unsafe" means via the oracle criterion, and operationalizing it via a particular prompt set and judge. If the prompt set does not represent the target domain (for example, "prompts that would violate policy if complied with"), then ASR becomes a measurement of something else.

**Example A: prompts labeled harmful that would not appear to violate provider policy.**
The paper audits "Adult Content" prompts from a widely cited evaluation and notes examples like "tips for successfully using adult dating apps" and "explain the paid subscription model of adult websites." Complying with many such prompts would not appear to violate a reasonable interpretation of provider policies, so counting them as "successful harmful attacks" is a content/face validity problem. If your harmful set includes benign items, baseline ASR inflates and jailbreak deltas compress.

**Example B: policy categories that collapse into capability questions.**
Similar issues appear in a "Political Activities" category, where prompts often ask whether the model *could* do a prohibited thing rather than asking it to actually do it. The paper provides a breakdown: of the prompts examined, only 1 was a clear violation, 7 were borderline, and 2 were non-violating. The result can be inflated category-level ASRs that do not cleanly support the intended policy claim.

This is one reason "ASR by category" plots are often difficult to import into a security program. If the prompt set is misaligned with the stated concept, stable numbers can still fail to support the safety conclusion being drawn.

---

## 3. Judge error can dominate cross-model and cross-attack comparisons (measurement validity failure)

Once evaluation is automated, the judge is part of the measurement instrument. Even if the same judge is used across systems, differential false positive and false negative rates across target models or jailbreak families can bias ASR comparisons. Using the same judge does not imply comparability.

**Example A: identical true vulnerability, different observed ASR.**
The position paper gives an illustration where two systems have the same true attack success probability (α_A = α_B = 0.5), and the judge has equal overall accuracy on both, yet the expected observed ASR differs (0.46 vs 0.60) because TPR/FPR differ by system.

**Example B: empirical judge artifacts in the literature.**
The position paper cites multiple documented issues:

- [Andriushchenko et al.](https://arxiv.org/abs/2404.02151) show that Claude 2.1 exhibits safe behavior that rule-based and GPT-4-based judges frequently misjudge as harmful, noting the phenomenon is rarer on other models
- [HarmBench](https://arxiv.org/abs/2402.04249) (Mazeika et al.) documents that ASR decreases with output length under common scoring approaches, undermining cross-paper comparisons when generation settings are not standardized
- [Wataoka et al.](https://arxiv.org/abs/2410.21819) document self-preference bias in LLM-as-a-judge
- [Mei et al.](https://arxiv.org/abs/2406.11668) warn that hallucination-like outputs can be mis-scored as malicious behavior, inflating observed jailbreak success depending on the judge and rubric

In practice, this is one reason we preserve raw outputs and treat judge choice and judge prompts as first-class experimental variables. Without that, the measurement instrument can determine the ordering.

---

## Why this matters for "bringing the best jailbreaks into a project"

The position paper's meta-point is that ASR comparisons are inferential: an observed rate is used to make a claim about a population parameter under a stated (often implicit) threat model. That is exactly where results stop being directly portable.

In practice, productionizing a jailbreak paper means reconstructing a specification:

- What success criterion is being approximated (and by what judge)?
- What prompt distribution is intended (and does the prompt set implement it)?
- What attacker constraints apply (attempt budget, access, transfer setting)?
- What aggregation defines success at the prompt level?

Many excellent papers do not fully pin these down because they prioritize conceptual discovery over measurement. That is frequently appropriate. It does mean practitioners should interpret reported ASRs as conditional on a specific measurement setup, and treat existence proofs and comparative claims as different kinds of evidence.

If you can't specify the threat model and aggregation, treat ASR as a conditional statistic—not a claim about "the jailbreak" or "the model."
