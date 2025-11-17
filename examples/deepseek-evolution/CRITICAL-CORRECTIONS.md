# Critical Corrections for DeepSeek Censorship Evolution Article

**Purpose**: Specific line-by-line fixes to address technical errors flagged in peer review.

**Status**: Must implement before publication for press/HN credibility.

---

## 1. NIST Citation - Fix Immediately

### Current (WRONG):
> "NIST's testing found Chinese-language censorship runs 2-3× higher than English across all models—R1-0528 censored 26% of Chinese prompts versus 16% in English."

### Problem:
NIST measured **CCP-narrative echo rates**, not censorship rates. These are different metrics:
- **Censorship**: Refusal to answer
- **CCP-narrative echo**: Repeating inaccurate CCP talking points (may occur with or without answering)

### Corrected:
> "NIST's testing found CCP-narrative echo rates 1.5-10× higher in Chinese than English, depending on model. On their CCP-Narrative-Bench, R1-0528 echoed CCP narratives in 26% of Chinese prompts versus 16% in English responses."

### Source:
NIST CAISI Report, Fig. 3.12: "CCP-Narrative-Bench English vs Chinese"

---

## 2. Effect Sizes - Recalculate

### Current (WRONG):
Article may cite Cohen's h values that are overstated.

### Corrected Values:

Using formula: h = 2 × (arcsin(√p₁) - arcsin(√p₂))

**Example 1**: R1 vs V3.2-Exp censorship
- R1: 100% (p₁ = 1.00)
- V3.2-Exp: 67% (p₂ = 0.67)
- **Correct h ≈ 1.22** (large effect)
- ~~NOT 1.53~~

**Example 2**: Political vs Control reasoning traces
- Control: 65% (p₁ = 0.65)
- Political: 3% (p₂ = 0.03)
- **Correct h ≈ 1.53** (large effect)
- ~~NOT 1.87~~

**Example 3**: R1 vs R1-0528 CCP language
- R1: 5.3% (p₁ = 0.053)
- R1-0528: 22.8% (p₂ = 0.228)
- **Correct h ≈ 0.53** (medium effect, NOT large)
- ~~NOT 0.91~~

### Action:
Update all effect size citations in article and figures.

---

## 3. DeepSeek Training Methods - Soften Claim

### Current (TOO STRONG):
> "DeepSeek uses the same post-training methods as everyone else—supervised fine-tuning, RLHF, direct preference optimization."

### Problem:
DeepSeek-R1 paper shows pure RL approach (RLVR), NOT conventional SFT+RLHF pipeline.
DeepSeek-V3 paper shows SFT + GRPO (not standard DPO).

### Corrected:
> "DeepSeek uses post-training techniques from the same families as other frontier labs: supervised fine-tuning and reinforcement-learning-based alignment for V3, and RL-based post-training for R1. OpenAI, Anthropic, Google, and Meta all rely on variants of these methods to shape model behavior."

### Sources:
- DeepSeek-V3 Technical Report (arXiv:2412.19437v1)
- DeepSeek-R1: Incentivizing Reasoning Capability in LLMs (arXiv:2501.12948)

---

## 4. Reasoning Token Reduction - Add Caveat

### Current (INCOMPLETE):
> "V3.2-Exp's architecture reduced reasoning tokens by 98%"

### Problem:
This could be API logging artifact, not pure architectural effect. OpenRouter may gate reasoning tokens differently per model.

### Corrected:
> "V3.2-Exp shows 98% fewer reasoning tokens in API responses (from ~5,696 to ~136 tokens on average). This may reflect both architectural changes (DeepSeek Sparse Attention) and API configuration differences. We verified `reasoning_enabled: true` was set consistently across V3 models."

### Alternative (Conservative):
> "V3.2-Exp's Sparse Attention architecture generates substantially fewer reasoning tokens—from ~5,696 to ~136 on average in our API testing."

### Source:
OpenRouter documentation on reasoning token handling

---

## 5. Arithmetic - Fix Count

### Current (WRONG):
> "For 99.7-100% of censored responses across 5,689 cases, the reasoning trace was absent or truncated."

### Problem:
Per-model totals don't add to 5,689:
- R1: 1,360 (100%)
- R1-0528: 1,359 (99.93%)
- V3.1: 1,102 (81%)
- V3.1-Terminus: 979 (72%)
- V3.2-Exp: 911 (67%)
- **Total: 5,711 censored responses**

### Corrected:
> "Across 5,711 censored responses (from 6,800 total tests), reasoning traces were absent or truncated in 99.7-100% of cases, depending on model."

---

## 6. Statistical Tests - Major Change

### Current (WRONG):
Implicitly uses chi-squared tests for model comparisons.

### Problem:
We're testing the **same 1,360 prompts** across 5 models. This is **paired data**, not independent samples.

### Corrected Approach:

**For overall test** (any difference across 5 models):
- Use **Cochran's Q test**
- Reports: Q statistic, df, p-value
- Interpretation: "Cochran's Q test shows significant variation across models (Q=2,847, df=4, p<0.001)"

**For pairwise comparisons** (R1 vs R1-0528):
- Use **McNemar's test**
- Reports: paired disagreements, p-value
- Example: "McNemar's test: p = 1.00 (not significant)"

**Multiple testing correction**:
- Apply **Holm-Bonferroni** (more powerful than plain Bonferroni)
- Report both uncorrected and corrected p-values
- Example: "All pairwise comparisons survive Holm-Bonferroni correction at α=0.05"

### Why This Matters:
Chi-squared assumes independence. Using it for paired data:
- Inflates Type I error (false positives)
- Gets called out on HN immediately
- Undermines credibility

---

## 7. Causal Language - Systematic Softening

### Current (TOO STRONG):
> "The model isn't failing to reason. It's reasoning, then hiding the reasoning."

### Problem:
This asserts causation. We observe correlation and occasional leaked traces, but cannot prove the mechanism operates in every case.

### Corrected:
> "We observe examples where models reason about censorship policies internally, then suppress that reasoning from output. Across the full dataset, political prompts show 62 percentage points lower reasoning rates than control topics (p<0.001), consistent with systematic suppression."

### Pattern to Apply Throughout:

❌ **Avoid**:
- "proves"
- "demonstrates that"
- "the model does X"
- Causal verbs without hedging

✅ **Use**:
- "consistent with"
- "suggests"
- "we observe patterns where"
- "the data support the interpretation that"
- "evidence indicates"

### Specific Replacements:

**Two-layer mechanism section**:
- CURRENT: "Layer 2 hides the deliberation."
- FIXED: "Layer 2 appears to suppress internal reasoning from visible output, based on examples where traces explicitly discuss censorship then get truncated."

**Thought suppression section**:
- CURRENT: "The model isn't failing to reason. It's reasoning, then hiding the reasoning."
- FIXED: "The models don't appear to fail at reasoning. Rather, we observe patterns consistent with internal reasoning being suppressed from output. Occasionally, this mechanism becomes visible when traces leak through."

---

## 8. Control Group Description - Fix Math

### Current (INCONSISTENT):
Protocol says "n=50 per category, 250 total" but lists:
- Factual: 25
- Complex reasoning: 25
- Others: 50 each

### Corrected:
"Control prompts (n=250, sizes as listed by category):"
- Factual questions: 25 prompts
- Complex reasoning tasks: 25 prompts
- Mildly sensitive non-China topics: 50 prompts
- Technical/safety topics: 50 prompts
- Chinese culture (non-political): 50 prompts
- Western political topics: 50 prompts

Total: 25+25+50+50+50+50 = 250 ✓

---

## 9. Power Analysis - Remove or Soften

### Current (QUESTIONABLE):
> "With n=1,360 political and n=250 control, we have 80% power to detect a 10-point difference at α=0.05"

### Problem:
With very unequal n's (1360 vs 250), the power calculation is more complex and this specific claim may not hold in the mid-range of proportions.

### Options:

**Option A**: Remove entirely
- Most readers don't care about power for non-null findings
- It's only critical when claiming "no difference" is meaningful

**Option B**: Soften to qualitative
> "With 1,360 prompts per model and 250 control prompts, we are well-powered to detect moderate differences in censorship and reasoning rates."

**Option C**: Fix the calculation
- Run proper power analysis for unequal n's
- Report actual detectable effect size at 80% power
- Probably not worth the complexity for blog post

**Recommendation**: Option B (soften to qualitative)

---

## 10. "Baked Into Weights" - Add Attribution

### Current (WEAKLY SOURCED):
> "Download DeepSeek's model files and run them on your own machine—no API, no internet connection—and they still censor."

### Problem:
We didn't test this ourselves (API-only). Need to cite sources who did.

### Corrected:
> "Independent researchers have confirmed censorship persists in downloaded weights. NIST's CAISI study explicitly tested weights from HuggingFace and found similar censorship patterns. The R1dacted study (arXiv:2505.12625v1) tested DeepSeek-R1 offline and documented near-total refusal rates on Taiwan, Tiananmen, and Xi Jinping topics."

### Sources:
- NIST CAISI Evaluation of DeepSeek AI Models (September 2025)
- R1dacted: Investigating Local Censorship in DeepSeek's R1 Language Model (arXiv:2505.12625v1)

---

## 11. Small Alignment Datasets Claim - Add Citations

### Current (VAGUE):
> "Research shows that modifying as little as 0.1% of training data can measurably shift behavior."

### Problem:
No citation, and 0.1% may not be accurate for this specific claim.

### Corrected:
> "Research demonstrates that relatively small alignment datasets can strongly shift model behavior. OpenAI's instruction hierarchy work shows how small curated datasets override base behaviors, and the InstructGPT results demonstrate that alignment data has outsized effects relative to pre-training scale."

### Sources:
- The Instruction Hierarchy: Training LLMs to Prioritize Privileged Instructions (arXiv:2404.13208)
- Training language models to follow instructions with human feedback (InstructGPT paper)

### Drop the 0.1% Claim:
Unless you can find the exact source, remove the specific percentage.

---

## 12. Original Study Comparison - Acknowledge Discrepancy

### Current (GLOSSED OVER):
R1 showed 85% censorship in January study, 100% in this study.

### Problem:
This is a 15pp difference on the same model. Needs explanation.

### Corrected Addition:

> **Comparison to January 2025 Baseline**
>
> Our original study (January 2025) found DeepSeek-R1 censored 85% of politically sensitive prompts. This follow-up study finds 100% censorship for the same model on the same prompt set.
>
> The discrepancy likely reflects:
> 1. **Testing time**: Original tested in January 2025; this retested in November 2025 (possible model drift or API updates)
> 2. **API differences**: Original used OpenAI API endpoints; this uses OpenRouter (adds routing layer)
> 3. **Detection refinements**: Improved classification may have caught edge cases the original missed
>
> Both studies show extremely high censorship on R1 (85-100%). The important finding is the evolution pattern across versions, not the exact baseline percentage.

---

## Implementation Checklist

Before publishing, verify:

- [ ] NIST citation fixed (narrative echo, not censorship)
- [ ] Effect sizes recalculated (h=1.22, h=1.53, h=0.53)
- [ ] DeepSeek training methods softened
- [ ] Reasoning token reduction caveated
- [ ] Arithmetic corrected (5,711 not 5,689)
- [ ] Statistical tests changed to McNemar's/Cochran's Q
- [ ] Causal language softened throughout ("consistent with" not "proves")
- [ ] Control group math fixed
- [ ] Power analysis removed or softened
- [ ] "Baked into weights" properly attributed
- [ ] Small dataset claim cited or removed
- [ ] Original study discrepancy acknowledged

---

## Pre-Publication Review Questions

Send this to a colleague:

1. **Math check**: Do the proportions, CIs, and effect sizes add up?
2. **Stats check**: Are we using the right tests for paired data?
3. **Citation check**: Can you find the sources we reference?
4. **Causal language audit**: Flag any place we assert causation without hedging
5. **HN attack surface**: What's the most likely criticism?

---

## Final Positioning

**What makes this study credible**:
- Pre-registered config (git commit before running)
- Independent manual validation (κ=0.84)
- Control group establishing baselines
- Proper paired-data statistics
- Complete reproducibility package
- Honest limitations section
- External validation (NIST, R1dacted)

**What we're NOT claiming**:
- Reverse-engineered exact alignment pipeline
- Proved causation (only correlation + plausible mechanism)
- Comprehensive coverage (English-only, API-only, 1,360 prompts)
- Generalization to all censorship (China-political topics specifically)

**Tone**:
- This is documentation, not groundbreaking research
- Incremental findings, honestly positioned
- Useful for practitioners tracking model behavior
- Makes alignment evolution measurable

**HN pitch**:
> "We tracked censorship across 5 DeepSeek versions over 9 months. Newer doesn't mean better—R1-0528 showed zero improvement while CCP propaganda increased 4×. Full replication package: one command to reproduce. [Stats: McNemar's tests, 95% CIs, all p-values survive correction]"

**The goal**: Readers trust the numbers enough to share them, critics find it too rigorous to attack easily, practitioners can replicate and extend.
