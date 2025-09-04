# Key Findings: Multi-lingual RAG Metrics

## The Big Discovery

**Not all RAG metrics are suitable for cross-lingual evaluation.** Some metrics work brilliantly across languages, while others fail completely. The solution isn't to lower thresholds - it's to choose the right metrics.

## Quick Decision Guide

### ✅ Metrics That Work Cross-Lingually

1. **context-relevance** (Best performer: 85-95%)
   - Measures conceptual relevance, not textual similarity
   - Keep thresholds high even for distant language pairs
   - Most reliable cross-lingual metric

2. **context-faithfulness** (Good: 70-80%)
   - LLMs can trace information across languages
   - Use 0.75-0.80 threshold for cross-lingual
   - Degrades predictably with language distance

3. **answer-relevance** (Good: 75-85%)
   - Evaluates if answer addresses question
   - Works because it's conceptual, not textual
   - Use 0.75-0.85 threshold

4. **llm-rubric** (Excellent: flexible)
   - Your Swiss Army knife for cross-lingual
   - Can specify exact cross-lingual criteria
   - Most versatile option

### ❌ Metrics to Avoid Cross-Lingually

1. **context-recall** (Fails: 10-30%)
   - Drops from 80% monolingual to 20% cross-lingual
   - Relies on textual matching between expected answer and context
   - **Don't use** - replace with llm-rubric

2. **factuality** (Poor: 40-60%)
   - Only works if ground truth is in output language
   - Cultural/translation differences cause issues
   - Use only with careful configuration

3. **String-based metrics** (Fails: 0-10%)
   - Obviously fail across languages
   - Only use for universal elements (numbers, codes)

## The Core Insight

When a metric drops from 80% to 20% effectiveness in cross-lingual scenarios, **the solution is NOT to lower your threshold to 0.20**. That makes the metric meaningless. The solution is to **use a different metric** that's designed for cross-lingual evaluation.

## Practical Example

### ❌ Wrong Approach
```yaml
# BAD: Making metric meaningless with ultra-low threshold
assert:
  - type: context-recall
    value: "Expected answer in English"  # Context is in Spanish
    threshold: 0.15  # Essentially random at this point
```

### ✅ Right Approach
```yaml
# GOOD: Using appropriate metrics for cross-lingual
assert:
  - type: context-relevance
    threshold: 0.85  # Works great cross-lingually
  - type: context-faithfulness
    threshold: 0.75  # Good with slight reduction
  - type: llm-rubric
    value: "Check if context contains information about X, Y, Z concepts"
```

## Why This Matters

1. **Better evaluation quality**: Using appropriate metrics gives meaningful results
2. **Clearer pass/fail criteria**: High thresholds on working metrics vs. low thresholds on broken metrics
3. **Easier debugging**: When tests fail, you know it's a real issue, not metric inadequacy
4. **Faster development**: No time wasted trying to make unsuitable metrics work

## Language Pair Performance

Even with suitable metrics, performance varies by language relationship:

- **Same language**: Baseline performance
- **Related languages** (Spanish↔Portuguese): -10% performance
- **Same script** (English↔German): -15% performance  
- **Different scripts** (English↔Arabic): -20% performance
- **Distant pairs** (Arabic↔Japanese): -30% performance

## Recommendations

1. **For production systems**: Use only context-relevance, context-faithfulness, answer-relevance, and llm-rubric for cross-lingual evaluation

2. **For metric selection**: Test metrics on your specific language pairs first - if performance drops >50%, find alternatives

3. **For custom evaluation**: Lean heavily on llm-rubric with explicit cross-lingual criteria

4. **For threshold setting**: Keep thresholds meaningful (>0.60) - if you need lower, the metric isn't working

## The Bottom Line

**Cross-lingual RAG evaluation requires different metrics, not lower standards.** Choose metrics that evaluate concepts rather than text, and your cross-lingual RAG evaluation will be both meaningful and reliable.
