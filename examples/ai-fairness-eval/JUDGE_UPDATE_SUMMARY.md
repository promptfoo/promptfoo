# 🧑‍⚖️ Judge Update: Claude 3.5 Sonnet + o4-mini

## Overview

Updated the multi-judge evaluation system to use:

- **Claude 3.5 Sonnet** (Anthropic) - For nuanced bias detection
- **o4-mini** (OpenAI Responses API) - For fast reasoning and pattern detection

## Files Updated

1. **`generate_multi_judge_tests.js`**

   ```javascript
   const JUDGES = [
     {
       id: 'anthropic:messages:claude-3-5-sonnet-20241022',
       label: 'Claude 3 Sonnet Judge',
       config: { temperature: 0, max_tokens: 1000 },
     },
     {
       id: 'openai:responses:o4-mini',
       label: 'o4-mini Judge',
       config: {
         temperature: 0,
         max_output_tokens: 1000,
         reasoning: {
           effort: 'low', // Fast judging
         },
       },
     },
   ];
   ```

2. **`analyze_comparative_results.py`**
   - Updated judge names for agreement analysis
   - Now tracks Claude vs o4-mini agreement rates

3. **`EVALUATION_IMPROVEMENTS.md`**
   - Added judge descriptions and strengths
   - Updated examples to show judge agreement analysis

4. **`run_demo.sh`**
   - Added API key checks for both providers
   - Updated descriptions of judge capabilities

## Why These Judges?

### Claude 3.5 Sonnet

- **Strengths**:
  - Excellent contextual understanding
  - Nuanced bias detection
  - Thoughtful analysis of subtle patterns
- **Best for**: Catching implicit biases and contextual inconsistencies

### o4-mini

- **Strengths**:
  - Fast reasoning model
  - Consistent evaluation
  - Efficient processing with low effort mode
- **Best for**: Quick pattern detection and logical consistency

## Running the New Configuration

```bash
# Ensure API keys are set
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"

# Run the evaluation
./run_demo.sh
```

## Expected Benefits

1. **Diverse Perspectives**: Claude's nuanced understanding + o4-mini's logical reasoning
2. **Cross-Provider Validation**: Reduces provider-specific biases
3. **Efficient Judging**: o4-mini's low-effort mode provides fast evaluation
4. **Better Coverage**: Different models catch different types of bias

## Judge Agreement Analysis

The system now tracks agreement between Claude and o4-mini on:

- Differential treatment detection
- Harmful stereotype identification
- Inconsistent refusal patterns

Example output:

```
👨‍⚖️ JUDGE AGREEMENT ANALYSIS
differential_treatment:
  Agreement rate: 85.0%
  Disagreements: 3/20
```

High disagreement areas are flagged for human review.
