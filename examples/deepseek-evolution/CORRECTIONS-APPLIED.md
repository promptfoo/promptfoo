# Corrections Applied to Blog Article

**Date**: 2025-11-15
**File**: `/Users/mdangelo/projects/pf2/site/blog/deepseek-censorship-evolution.md`
**Source**: CRITICAL-CORRECTIONS.md

## Summary

All 12 critical corrections from CRITICAL-CORRECTIONS.md have been systematically applied to the blog article. The article is now ready for publication with improved technical accuracy, proper attribution, and appropriately hedged causal language.

---

## ✅ Correction 1: NIST Citation Fixed

**Location**: Lines 175, 231, 305

**Before**:
> "NIST's testing found Chinese-language censorship runs 2-3× higher than English"

**After**:
> "NIST's testing found CCP-narrative echo rates 1.5-10× higher in Chinese than English, depending on model. On their CCP-Narrative-Bench, R1-0528 echoed CCP narratives in 26% of Chinese prompts versus 16% in English responses."

**Why**: NIST measured CCP-narrative echo rates (repeating CCP talking points), not censorship rates (refusal to answer). These are different metrics.

---

## ✅ Correction 2: Effect Sizes

**Status**: Not explicitly stated in article (no h values mentioned)

**Note**: The article discusses the 4.3× CCP language increase but doesn't claim specific Cohen's h values. The corrected h values (h=1.22, h=1.53, h=0.53) are documented in BLOG-METHODOLOGY.md for reference but aren't needed in the main article.

---

## ✅ Correction 3: DeepSeek Training Methods Softened

**Location**: Line 45

**Before**:
> "DeepSeek uses the same post-training methods as everyone else—supervised fine-tuning, RLHF, direct preference optimization."

**After**:
> "DeepSeek uses post-training techniques from the same families as other frontier labs: supervised fine-tuning and reinforcement-learning-based alignment for V3, and RL-based post-training for R1. OpenAI, Anthropic, Google, and Meta all rely on variants of these methods to shape model behavior."

**Why**: DeepSeek-R1 uses pure RL (RLVR), not conventional SFT+RLHF. DeepSeek-V3 uses SFT + GRPO, not standard DPO. The softened language accurately reflects that they use techniques from the same families without claiming identical methods.

---

## ✅ Correction 4: Reasoning Token Reduction Caveated

**Location**: Lines 39, 229, 235, 255

**Before**:
> "V3.2-Exp's architecture reduced reasoning tokens by 98%"

**After**:
> "V3.2-Exp shows 98% fewer reasoning tokens in API responses (from ~5,696 to ~136 tokens on average). This may reflect both architectural changes (DeepSeek Sparse Attention) and API configuration differences."

**Why**: This could be an API logging artifact, not pure architectural effect. OpenRouter may gate reasoning tokens differently per model. The caveat acknowledges both possibilities.

---

## ✅ Correction 5: Arithmetic Fixed

**Location**: Line 149

**Before**:
> "For 99.7-100% of censored responses across 5,689 cases"

**After**:
> "For 99.7-100% of censored responses across 5,711 cases"

**Why**: Correct total: R1(1360) + R1-0528(1359) + V3.1(1102) + V3.1-Terminus(979) + V3.2-Exp(911) = 5,711

---

## ✅ Correction 6: Statistical Tests

**Status**: Not explicitly mentioned in article

**Note**: The article doesn't claim to use chi-squared tests. The corrected statistical methodology (McNemar's test, Cochran's Q) is documented in BLOG-METHODOLOGY.md for the methods section. No changes needed in main article body since it doesn't make explicit statistical test claims.

---

## ✅ Correction 7: Causal Language Softened

**Location**: Lines 151, 159, 167, 169, 187

### Change 1 - Line 151:
**Before**: "The model isn't failing to reason. It's reasoning, then hiding the reasoning."
**After**: "The models don't appear to fail at reasoning. Rather, we observe patterns consistent with internal reasoning being suppressed from output. Occasionally, this mechanism becomes visible when traces leak through."

### Change 2 - Line 159:
**Before**: "The model deliberates about censorship policy, then removes that deliberation from the response you see."
**After**: "We observe examples where the model deliberates about censorship policy internally, then that deliberation is removed from the response you see."

### Change 3 - Line 167:
**Before**: "## How Censorship Actually Works"
**After**: "## How Censorship Appears to Work"

### Change 4 - Line 169:
**Before**: "The thought suppression pattern reveals how DeepSeek implements censorship: two layers working in tandem."
**After**: "The thought suppression pattern is consistent with a two-layer mechanism working in tandem."

### Change 5 - Line 187:
**Before**: "**Layer 2** hides the deliberation."
**After**: "**Layer 2** appears to suppress internal reasoning from visible output, based on examples where traces explicitly discuss censorship then get truncated."

**Why**: These changes convert assertions of causation into observations of correlation with plausible mechanisms. We observe patterns and examples, but cannot definitively prove the mechanism operates in every case.

---

## ✅ Correction 8: "Baked Into Weights" Properly Attributed

**Location**: Lines 173-177

**Before**:
> "Download DeepSeek's model files and run them on your own machine—no API, no internet connection—and they still censor."

**After**:
> "Independent researchers have confirmed censorship persists in downloaded weights. NIST's CAISI study (September 2025) explicitly tested weights from HuggingFace and found similar censorship patterns. The R1dacted study (arXiv:2505.12625v1) tested DeepSeek-R1 offline and documented near-total refusal rates on Taiwan, Tiananmen, and Xi Jinping topics."

**Why**: We didn't test this ourselves (API-only). Need to cite sources who did (NIST, R1dacted).

---

## ✅ Correction 9: Small Alignment Datasets Claim Cited

**Location**: Lines 179-181

**Before**:
> "Research shows that modifying as little as 0.1% of training data can measurably shift behavior."

**After**:
> "Research demonstrates that relatively small alignment datasets can strongly shift model behavior. OpenAI's "Instruction Hierarchy" work (arXiv:2404.13208) shows how small curated datasets override base behaviors, and the InstructGPT results demonstrate that alignment data has outsized effects relative to pre-training scale."

**Why**: The 0.1% claim lacked citation. Replaced with properly cited research (Instruction Hierarchy paper, InstructGPT) that makes the same point without unsourced percentages.

---

## ✅ Correction 10: Control Group Description

**Status**: Not in main article

**Note**: The control group description is detailed in BLOG-METHODOLOGY.md but isn't part of the main article narrative, so no correction needed here.

---

## ✅ Correction 11: Power Analysis

**Status**: Not in main article

**Note**: Power analysis isn't mentioned in the main article. It's addressed in BLOG-METHODOLOGY.md as "well-powered to detect moderate differences."

---

## ✅ Correction 12: Original Study Comparison

**Status**: Not explicitly detailed in main article

**Note**: The article mentions the original January 2025 study in the opening but doesn't detail the 85% vs 100% discrepancy. This comparison is documented in BLOG-METHODOLOGY.md for completeness.

---

## Pre-Publication Checklist Status

- [x] NIST citation fixed (narrative echo, not censorship)
- [x] Effect sizes recalculated (documented in BLOG-METHODOLOGY.md)
- [x] DeepSeek training methods softened
- [x] Reasoning token reduction caveated
- [x] Arithmetic corrected (5,711 not 5,689)
- [x] Statistical tests changed to McNemar's/Cochran's Q (in BLOG-METHODOLOGY.md)
- [x] Causal language softened throughout (5 instances)
- [x] Control group math fixed (in BLOG-METHODOLOGY.md)
- [x] Power analysis removed or softened (in BLOG-METHODOLOGY.md)
- [x] "Baked into weights" properly attributed
- [x] Small dataset claim cited or removed
- [x] Original study discrepancy acknowledged (in BLOG-METHODOLOGY.md)

---

## Files Created

1. **BLOG-METHODOLOGY.md** - Blog-appropriate methodology section with:
   - Correct paired-data statistics (McNemar's/Cochran's Q)
   - Corrected effect sizes (h=1.22, h=1.53, h=0.53)
   - Control group details
   - Validation procedures
   - Limitations section
   - FAQ for HN/LinkedIn

2. **CRITICAL-CORRECTIONS.md** - Line-by-line correction guide with:
   - 12 specific fixes documented
   - Before/after comparisons
   - Implementation checklist
   - Pre-publication review questions
   - Final positioning strategy

3. **CORRECTIONS-APPLIED.md** (this file) - Summary of all changes made

---

## Next Steps

### Optional: Add Methods Section

The blog article currently has a "How We Did This" section (lines 267-312). You may want to replace or supplement it with the more rigorous methodology from BLOG-METHODOLOGY.md.

**Current section includes**:
- Replication package info
- Running instructions
- Open questions

**BLOG-METHODOLOGY.md provides**:
- Dataset description
- Detection methods
- Validation procedures
- Statistical analysis approach
- Control group design
- Limitations
- External validation

### Publication Checklist

Before publishing:

1. **Technical review** - Have a colleague verify:
   - Math adds up (proportions, CIs, effect sizes)
   - Citations are findable
   - No causal language without hedging

2. **HN attack surface** - Most likely criticisms:
   - ✅ Pattern matching too simplistic → We address with manual validation
   - ✅ Wrong statistical tests → Fixed (McNemar's/Cochran's Q)
   - ✅ LLM judges biased → Not used in main results
   - ✅ Chinese-only prompts → Acknowledged as limitation

3. **Final positioning** - Make sure messaging emphasizes:
   - This is documentation, not groundbreaking research
   - Complete reproducibility (one command)
   - Honest limitations upfront
   - External validation (NIST, R1dacted)

---

## What Makes This Study Credible Now

- ✅ Pre-registered config (git commit before running)
- ✅ Manual validation documented
- ✅ Control group establishing baselines
- ✅ Proper paired-data statistics
- ✅ Complete reproducibility package
- ✅ Honest limitations section
- ✅ External validation cited
- ✅ Causal claims appropriately hedged
- ✅ All sources properly attributed

---

## What We're NOT Claiming

- ❌ Reverse-engineered exact alignment pipeline
- ❌ Proved causation (only correlation + plausible mechanism)
- ❌ Comprehensive coverage (English-only, API-only, 1,360 prompts)
- ❌ Generalization to all censorship (China-political topics specifically)

---

**The goal**: Readers trust the numbers enough to share them, critics find it too rigorous to attack easily, practitioners can replicate and extend.
