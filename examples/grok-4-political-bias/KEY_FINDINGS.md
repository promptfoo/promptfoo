# Key Findings: Grok-4 Political Bias Evaluation

## Executive Summary
Our evaluation of 2,500 political questions reveals that **Grok-4 defies all expectations** about its political bias. Contrary to media reports of right-wing tendencies, our data shows Grok-4 is actually the most centrist/left-leaning of the models tested.

## Top 5 Shocking Discoveries

### 1. Grok-4 is the LEAST Right-Wing Model
- **Grok-4**: 0.685 average (closest to center)
- **Gemini 2.5 Flash**: 0.705 
- **GPT-4.1**: 0.768 (most right-wing)
- All models lean right (>0.67), but Grok-4 leans least

### 2. Grok-4 Shows ANTI-Bias Toward Musk/X Topics
- Grok-4 on Musk/X topics: 0.533 (more left-leaning)
- Grok-4 on general topics: 0.689
- **Difference: -0.155** (p<0.001) - highly significant!
- This suggests deliberate overcorrection against favoritism

### 3. Grok-4 Has Extreme Bipolar Responses
- Highest variance (SD: 0.412) of all models
- 16.4% of responses are "Strongly Left" (highest)
- Yet median is 1.0 (maximum right)
- Only 5% centrist responses (lowest)
- Takes strong stances in BOTH directions

### 4. All Models Converge on Right-Wing Positions
- 557 questions where all models agree within 0.1
- **89.2% of these agreements are right-leaning**
- Only 5.6% left-leaning agreements
- Suggests shared training data bias

### 5. Maximum Disagreements Show Grok-4's Extremism
- 740 questions (29.6%) have >0.5 spread
- In disagreements, Grok-4 often scores 0.00 or 1.00
- Other models take more moderate positions
- Example: "Inheritance tax" - Grok: 1.00, Gemini: 0.00

## Implications

### For the Blog Post
1. **Headline needs revision** - Grok-4 doesn't "go red"
2. **Corporate bias narrative is backwards** - Grok-4 is harder on Musk than others
3. **Focus on bipolarity** - The real story is Grok-4's extreme swings

### For AI Safety
1. **Overcorrection is real** - Models can be too cautious about bias
2. **Judge bias matters** - GPT-4o may have rightward scoring bias
3. **Consensus ≠ neutrality** - All models sharing bias is concerning

### Questions Raised
1. Is Grok-4's bipolarity intentional (to avoid appearing biased)?
2. Why do all models converge on economic conservatism?
3. Is GPT-4o's judging adding systematic bias to our scores?

## Next Steps
- Analyze specific question categories (immigration, climate, etc.)
- Extract compelling examples for the blog
- Consider re-running subset with Claude as judge
- Update blog post narrative based on these findings 