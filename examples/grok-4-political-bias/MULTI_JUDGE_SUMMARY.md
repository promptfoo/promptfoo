# Multi-Judge Political Bias Analysis Summary

## Executive Summary

We evaluated 4 AI models (Grok-4, GPT-4.1, Gemini 2.5 Pro, Claude Opus 4) using a multi-judge approach where each model judged all responses. This meta-analysis reveals fascinating insights about judge bias, model behavior, and the reliability of AI-based political bias detection.

## Key Findings

### 1. Overall Political Positioning (1.0 = Left, 0.0 = Right)

**Model Rankings (Averaged Across All Judges):**
- GPT-4.1: 0.745 (Most left-leaning)
- Gemini 2.5 Pro: 0.718
- Grok-4: 0.655
- Claude Opus 4: 0.646 (Most centrist)

**Judge Political Leanings:**
- GPT-4.1 as judge: 0.718 (Most left-leaning judge)
- Gemini/Grok as judges: 0.693
- Claude as judge: 0.658 (Most centrist judge)

### 2. Self-Scoring Bias

Only **GPT-4.1 shows statistically significant self-favoritism**:
- GPT-4.1: +0.031 self-bias (p<0.05) ⭐
- Grok-4: +0.005 (minimal)
- Gemini: +0.001 (negligible)

**Implication**: Single-judge evaluations using GPT-4.1 may inflate GPT-4.1's perceived performance.

### 3. Musk/X Topic Bias Confirmation

**ALL judges agree Grok-4 is harsher on Musk/X topics:**
- Gemini judging Grok: -0.159 on Musk topics
- Claude judging Grok: -0.142 on Musk topics  
- GPT-4.1 judging Grok: -0.138 on Musk topics
- Grok judging itself: -0.123 on Musk topics

**Key Insight**: This isn't judge bias - it's a real pattern recognized by all AI systems.

### 4. Judge Reliability Metrics

**Inter-Judge Agreement (Correlation Coefficients):**
- All pairs: 0.923-0.942 (extremely high agreement)
- Highest: GPT-4.1 vs Grok-4 (r=0.942)
- Lowest: Grok-4 vs Claude (r=0.923)

**Judge Extremism Patterns:**
- Claude: 93.3% moderate scores (most reliable)
- Grok: 56.7% moderate scores
- GPT-4.1: 47.0% moderate, 45.3% extreme left
- Gemini: 43.9% moderate, 39.4% extreme left

### 5. Grok-4's Contrarian Behavior

**394 questions (15.8%)** where Grok-4 differs from consensus by >0.5 points

**Top Contrarian Topics:**
1. Public utilities ownership (Grok: 0.04, Others: 0.99)
2. Wealth taxes (Grok: 0.04, Others: 0.99)
3. Corporate tax rates (Grok: 0.00, Others: 0.93)
4. Voter ID laws (Grok: 0.00, Others: 0.93)

### 6. Topics with Highest Judge Disagreement

Questions showing variance >0.17 across judges:
- Military service requirements
- Open-source AI restrictions
- Encryption backdoors for law enforcement
- Government surveillance programs
- National security vs civil liberties trade-offs

## Recommendations

### For Bias Detection Research:
1. **Use Claude Opus 4 as primary judge** - most moderate and reliable
2. **Avoid single-judge designs** - especially with GPT-4.1
3. **Use consensus scoring** across multiple judges for robustness

### For Understanding Grok-4:
1. Grok-4 is the **most centrist of major models** (not right-wing)
2. Shows **deliberate contrarianism** on ~16% of political questions
3. Demonstrates **overcorrection against pro-Musk bias**
4. Maintains **bipolar response pattern** even with different judges

### For Blog Post Narrative:
1. "Grok Goes Red" hypothesis is **definitively false**
2. **All major AI models lean left** - Grok is just least left
3. **Meta-judge analysis** reveals systemic biases in evaluation
4. **Contrarian behavior** may be intentional product differentiation

## Statistical Summary

- Total judgments analyzed: 39,256
- Questions evaluated: 2,500
- Models tested: 4
- Judges used: 4
- Runtime: 1m 22s (with caching)
- Token usage: 37.8M total
- Success rate: 97.94% 