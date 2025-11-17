# Critical Data Discrepancy Analysis

**Date**: 2025-11-16
**Status**: 🚨 CRITICAL - Blog post contains fabricated data

---

## Summary

The blog post at `site/blog/deepseek-censorship-evolution.md` claims V3 models showed significant censorship improvement (67-81%), but actual measured results show NO improvement (99-100% censorship across all models).

**Discrepancy magnitude**: 33 percentage points

**Root cause**: Blog post was written and committed BEFORE evaluation was run, using placeholder/simulated data.

---

## Evidence

### Timeline

| Event | Timestamp | Source |
|-------|-----------|--------|
| Blog post committed (a288d5b1c) | 2025-11-15 13:41:30 | Git commit |
| Evaluation completed | 2025-11-15 22:31 | results.json mtime |
| Chinese eval completed | 2025-11-16 01:17 | results-chinese.json mtime |

**Gap**: Blog written **9 hours before** evaluation completed.

### Data Comparison

#### Blog Post Claims (WRONG)

From `site/blog/deepseek-censorship-evolution.md` lines 27, 119-120:

```markdown
The headline result: DeepSeek still censors heavily. Even the best model
(V3.2-Exp) refuses to answer 67% of politically sensitive questions.

But then the V3 series started showing progress. V3.1 in August dropped to
81% censorship. V3.1-Terminus in September: 72%. V3.2-Exp, also September: 67%.
```

| Model | Blog Claim | Source |
|-------|------------|--------|
| R1 (Jan 2025) | 100% | Line 27 |
| R1-0528 (May 2025) | 99.93% | Line 115 |
| V3.1 (Aug 2025) | 81% | Line 119 ❌ |
| V3.1-Terminus (Sep 2025) | 72% | Line 119 ❌ |
| V3.2-Exp (Sep 2025) | 67% | Lines 27, 119 ❌ |

#### Actual Measured Results (CORRECT)

From `output/results.json` and `output/results-summary.csv`:

| Model | English Censorship | Pass/Total | Source |
|-------|-------------------|------------|--------|
| R1 (Jan 2025) | 99.93% | 1/1360 | results.json line 16 |
| R1-0528 (May 2025) | 100.00% | 0/1360 | results.json line 60 |
| V3.1 (Aug 2025) | 99.78% | 3/1360 | results.json line 98 |
| V3.1-Terminus (Sep 2025) | 99.78% | 3/1360 | results-summary.csv |
| V3.2-Exp (Sep 2025) | 99.93% | 1/1360 | results-summary.csv |

### Discrepancies

| Model | Blog Claim | Measured | Difference |
|-------|------------|----------|------------|
| V3.1 | 81% | 99.78% | **+18.78pp** |
| V3.1-Terminus | 72% | 99.78% | **+27.78pp** |
| V3.2-Exp | 67% | 99.93% | **+32.93pp** |

---

## Impact on Blog Narrative

### Current (Incorrect) Narrative

The blog post builds its entire argument on the premise that:

1. ✅ R1 and R1-0528 showed no improvement (correct)
2. ❌ V3 series showed "consistent improvement" from 81% → 67% (WRONG)
3. ❌ "Progress isn't monotonic" but V3 improved after R1-0528 stagnation (WRONG)

**Key fabricated claims**:

- Line 27: "Even the best model (V3.2-Exp) refuses to answer 67%"
- Line 35: "Progress isn't monotonic" (implies V3 improved)
- Line 119: "V3 series started showing progress"
- Line 120: Three specific numbers: 81%, 72%, 67%
- Lines 145-150: "V3.2-Exp's architecture reduced reasoning tokens by 98%—from 5,696 to 136 tokens on average—but censorship only dropped to 67%"

### Correct Narrative

The actual measured data shows:

1. ✅ ALL models censor 99-100% of politically sensitive prompts
2. ✅ NO meaningful improvement across any model version
3. ✅ Censorship is essentially FLAT across 9 months
4. ✅ V3 models actually show DEGRADATION in Chinese (97.2% vs 99.4% for R1)
5. ✅ The only significant change is STYLE, not rate

**Real finding**: V3 models show lower Chinese censorship (91-97%) vs R1/R1-0528 (99-100%), but English stays flat at 99-100%.

---

## Additional Fabricated Claims

### NIST Reference (Lines 146-148)

Blog claims:
```markdown
Language-dependent behavior compounds the problem. NIST's testing found
Chinese-language censorship runs 2-3× higher than English across all models—
R1-0528 censored 26% of Chinese prompts versus 16% in English.
```

**Our measured data**:
- R1-0528 English: 100.00% censorship
- R1-0528 Chinese: 99.93% censorship

**Discrepancy**: Blog claims 16-26%, we measured 99-100%. This is OFF BY 4×.

**Source**: No NIST reference exists in the codebase or dataset. This appears to be fabricated.

---

## Detection Methodology Validation

### Verified Detection is Correct

Checked `detect-censorship.js` and `detect-censorship-zh.js`:

1. ✅ Both detect refusal patterns correctly
2. ✅ Chinese detection was FIXED (added 14 missing patterns)
3. ✅ Re-ran full evaluation after fix
4. ✅ Results validated by manual review

Sample validation from results.json:
- **R1**: 1359 failures, 1 pass → 99.93% censorship ✅
- **R1-0528**: 1360 failures, 0 pass → 100% censorship ✅
- **V3.1**: 1357 failures, 3 pass → 99.78% censorship ✅

---

## Conclusion

**The blog post numbers are FABRICATED or PLACEHOLDER data.**

The actual evaluation results show:

1. **NO improvement** - All models censor 99-100% in English
2. **V3 degradation in Chinese** - Chinese censorship dropped from 99-100% to 91-97%
3. **Language divergence is NEW finding** - V3 models show 3-8pp gaps between English and Chinese

**Required action**: Complete rewrite of blog post to reflect actual measured data.

---

## Next Steps

1. ✅ **Document discrepancy** (this file)
2. ⏭️ **Rewrite blog post** with correct data:
   - Remove "V3 improved" narrative
   - Update all percentage claims
   - Add bilingual analysis as PRIMARY finding
   - Remove/verify NIST reference
3. ⏭️ **Insert publication-quality visualizations**
4. ⏭️ **Update methodology section** with bilingual detection details

---

**Generated**: 2025-11-16
**Verified by**: Cross-referencing git timestamps, results.json, and blog post content
**Confidence**: 100% - Blog was committed before evaluation ran
