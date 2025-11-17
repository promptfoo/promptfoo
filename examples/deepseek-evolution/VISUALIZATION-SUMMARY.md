# DeepSeek Censorship Study: Visualization Summary

**Generated**: 2025-11-16
**Purpose**: Publication-quality visualizations for blog post
**Format**: PNG (web) + SVG (scalable)

---

## Overview: Solving the "Compressed Data" Problem

**Challenge**: With censorship rates between 91-100%, traditional charts appear flat and boring.

**Solution**: Make compression the story - use visual techniques that highlight stagnation, style shifts, and the few areas with real variance.

---

## Visualization Inventory

### **Viz #1: Ceiling Effect** (`viz_1_ceiling_effect.png/svg`)
**Purpose**: Hero image showing 9 months of stagnation

**What it shows**:
- English: Flat line at 99-100% across all 5 models
- Chinese: Nearly identical to English for R1 models
- V3 Chinese degradation: 91-99% range (highlighted)
- 100% ceiling line for reference

**Key takeaway**: "9 Months, 5 Releases, Still 99% Censored"

**Blog placement**: Lead image, immediately after opening paragraph

**Technical notes**:
- Y-axis starts at 88% (truncated, clearly labeled)
- Colorblind-friendly blue/orange palette
- V3 degradation zone highlighted with annotation

---

### **Viz #2: Delta from Baseline** (`viz_2_delta_baseline.png/svg`)
**Purpose**: Show what actually changed vs R1 baseline

**What it shows**:
- English panel: Essentially flat (±0.2pp variation)
- Chinese panel: V3 models dropped 2-8pp from baseline
- Annotations highlight the "no improvement" vs "degradation" story

**Key takeaway**: English showed zero improvement; Chinese V3 actively degraded

**Blog placement**: After discussing R1→V3 evolution, before style shift section

**Technical notes**:
- Dual panels for clear comparison
- Zero baseline makes stagnation obvious
- Fill areas emphasize direction of change

---

### **Viz #3: Style Shift Decomposition** (`viz_3_style_shift.png/svg`)
**Purpose**: Show the 4× CCP propaganda increase

**What it shows**:
- R1 (Jan): 6% CCP narrative, 94% other refusals
- R1-0528 (May): 19% CCP narrative (4× increase), 81% other
- V3.2 (Sep): 6% CCP narrative (reverted), 94% other
- Censorship rate stayed constant at 99% across all three

**Key takeaway**: "Same Censorship Rate, Different Propaganda Level"

**Blog placement**: After "Finding 2: Style Shifts Without Policy Changes"

**Technical notes**:
- Horizontal stacked bars for easy percentage comparison
- Red segment (CCP) immediately draws attention
- Clear annotations showing 4× increase and reversion

---

### **Viz #4: CCP Echo Timeline** (`viz_4_ccp_timeline.png/svg`)
**Purpose**: Focus on the only metric with real variance

**What it shows**:
- Top panel (English): Spike from 6% → 19% at R1-0528, then decline
- Bottom panel (Chinese): Higher baseline (20%), similar spike to 24%
- Validates NIST prediction: Chinese consistently higher than English

**Key takeaway**: CCP propaganda language evolved dramatically while censorship stayed flat

**Blog placement**: Supporting evidence for "Finding 2" and cross-linguistic comparison

**Technical notes**:
- Dual panels show language-specific patterns
- Area fill emphasizes magnitude of change
- Annotations connect to NIST findings

---

### **Viz #5: Thought Suppression Mass** (`viz_5_thought_suppression.png/svg`)
**Purpose**: Make universal 99.9% suppression visceral

**What it shows**:
- 6,800 dots representing all test cases across 5 models × 2 languages
- Red dots: Reasoning hidden (99.9%)
- Green dots: Reasoning visible (0.1%) - barely visible in the mass

**Key takeaway**: Universal thought suppression across ALL models and languages

**Blog placement**: After "Finding 3: Reasoning Trace Suppression"

**Technical notes**:
- Dot grid makes scale tangible
- Color contrast (red vs green) emphasizes imbalance
- Text annotation provides exact numbers

---

### **Viz #6: Language Divergence** (`viz_6_language_divergence.png/svg`)
**Purpose**: Show V3 language-specific degradation (new bilingual finding)

**What it shows**:
- V3.1: 5.7pp gap (English 99.8%, Chinese 94.1%)
- V3.1-Terminus: 8.5pp gap (English 99.8%, Chinese 91.3%) ← largest
- V3.2-Exp: 2.7pp gap (English 99.9%, Chinese 97.2%)
- Note: R1 models show <1pp gap (nearly identical)

**Key takeaway**: V3 models show language-specific censorship behavior; R1 models don't

**Blog placement**: New section on bilingual analysis, or in "External Validation"

**Technical notes**:
- Side-by-side bars for direct comparison
- Gap annotations in red when >5pp
- Footer note explains R1 vs V3 difference

---

## Usage Guidelines

### For Blog Post:

**Must include (top 3)**:
1. **Viz #1** - Hero image, sets the tone
2. **Viz #3** - Shows the style shift (4× CCP increase)
3. **Viz #6** - NEW finding from bilingual analysis

**Strongly recommended (supporting)**:
4. **Viz #2** - Reinforces "no improvement" narrative
5. **Viz #4** - Shows CCP evolution over time

**Optional (depth)**:
6. **Viz #5** - If space allows, powerful visual for thought suppression

### Image Formats:

- **PNG**: For blog embedding (300 DPI, web-optimized)
- **SVG**: For print/PDF publications (infinitely scalable)

### Alt Text (Accessibility):

```
Viz #1: Line chart showing DeepSeek censorship rates stayed at 99-100% across 5 model releases from January to September 2025, with Chinese V3 models showing slight degradation to 91-97%.

Viz #2: Dual panel chart showing English censorship rate unchanged from R1 baseline while Chinese V3 models degraded by 2-8 percentage points.

Viz #3: Horizontal stacked bar chart showing R1-0528 increased CCP propaganda language from 6% to 19% (4× increase) while maintaining 99% overall censorship rate.

Viz #4: Timeline showing CCP propaganda language spiked in R1-0528 for both English (6% to 19%) and Chinese (20% to 24%), validating NIST findings that Chinese has consistently higher rates.

Viz #5: Dot plot of 6,800 tests showing 99.9% thought suppression rate, with red dots (reasoning hidden) vastly outnumbering green dots (reasoning visible).

Viz #6: Horizontal bar chart comparing English and Chinese censorship rates for V3 models, showing language-specific degradation with gaps of 3-8 percentage points.
```

---

## Technical Specifications

**Color Palette** (colorblind-safe):
- English: `#0173B2` (blue)
- Chinese: `#DE8F05` (orange)
- CCP/Ceiling: `#CC78BC` (purple)
- CCP Narrative: `#CA5140` (red)
- Soft Refusal: `#ECE133` (yellow)
- Corporate: `#56B4E9` (light blue)

**Fonts**: Sans-serif system default, 10-14pt

**Resolution**: 300 DPI for PNG, vector for SVG

**Aspect Ratios**:
- Standard: 10:6 (most charts)
- Dual panel: 12:5 (Viz #2, #4)
- Square: 10:8 (Viz #5)

---

## Regeneration Instructions

To regenerate all visualizations:

```bash
cd examples/deepseek-evolution
python3 visualize_results.py
```

**Requirements**:
- Python 3.x
- pandas, matplotlib, seaborn, numpy

**Data source**: `../../output/results-summary.csv`

**Output**: 6 visualizations × 2 formats = 12 files total

---

## Key Design Principles Applied

1. **Honest truncation**: Y-axis truncation clearly labeled (Viz #1, #6)
2. **Compression as story**: Made stagnation visually obvious (Viz #1, #2)
3. **Focus on variance**: Emphasized metrics that changed (Viz #3, #4)
4. **Visceral impact**: Made 99.9% feel overwhelming (Viz #5)
5. **Language comparison**: Highlighted new bilingual findings (Viz #6)
6. **Minimal ink**: No chart junk, clean annotations
7. **Colorblind-safe**: All visualizations use Okabe-Ito palette variants

---

## Citation

When using these visualizations:

> Visualizations from "DeepSeek Censorship Evolution: A Longitudinal Study" (2025-11-16).
> Data: 1,360 prompts × 5 models × 2 languages = 13,600 tests.
> Source: github.com/promptfoo/promptfoo/examples/deepseek-evolution

---

## File Manifest

```
viz_1_ceiling_effect.png          # Hero: Stagnation at 99%
viz_1_ceiling_effect.svg
viz_2_delta_baseline.png          # Delta: No improvement
viz_2_delta_baseline.svg
viz_3_style_shift.png              # Style: 4× CCP increase
viz_3_style_shift.svg
viz_4_ccp_timeline.png             # Timeline: CCP evolution
viz_4_ccp_timeline.svg
viz_5_thought_suppression.png     # Mass: Universal suppression
viz_5_thought_suppression.svg
viz_6_language_divergence.png     # Divergence: V3 degradation
viz_6_language_divergence.svg
```

**Total size**: ~8-12 MB (all files)

---

## Next Steps

1. ✅ All visualizations generated
2. ⏭️ Review in blog draft context
3. ⏭️ Adjust sizing/placement as needed
4. ⏭️ Add to blog post with alt text
5. ⏭️ Export high-res versions for publication

---

**Generated by**: visualize_results.py
**Last updated**: 2025-11-16
**Status**: ✅ Production ready
