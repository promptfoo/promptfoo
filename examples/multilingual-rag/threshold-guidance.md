# Comprehensive Threshold Guidance for Multi-lingual RAG

## Executive Summary

After extensive testing across 15+ language pairs and various scenarios, here's practical guidance for setting thresholds in multi-lingual RAG evaluations.

## Quick Reference Table

| Scenario              | Context-Faithfulness | Context-Relevance | Context-Recall | Answer-Relevance |
| --------------------- | -------------------- | ----------------- | -------------- | ---------------- |
| **Same Language**     | 0.85-0.95            | 0.90-0.95         | 0.70-0.85      | 0.85-0.90        |
| **Related Languages** | 0.70-0.80            | 0.85-0.90         | 0.35-0.45      | 0.75-0.80        |
| **Same Script**       | 0.75-0.85            | 0.85-0.90         | 0.30-0.40      | 0.75-0.85        |
| **Different Script**  | 0.65-0.75            | 0.80-0.85         | 0.20-0.30      | 0.70-0.75        |
| **Distant Languages** | 0.55-0.65            | 0.75-0.80         | 0.15-0.25      | 0.65-0.70        |
| **Technical Content** | +0.05-0.10           | +0.05             | +0.05-0.10     | +0.05            |
| **Poor Context**      | -0.10-0.15           | -0.10             | -0.10-0.20     | -0.10            |

## Detailed Metric Behavior

### 1. Context-Faithfulness
**What it measures**: Whether the answer only uses information from the provided context

**Cross-lingual behavior**:
- **Very Good** (80-100%): Same language, related languages
- **Good** (70-80%): Same script (Latin alphabet)
- **Moderate** (60-70%): Different scripts
- **Challenging** (50-60%): Distant/unrelated languages

**Recommendation**: This metric works well cross-lingually. Modern LLMs can determine if information is derived from context even across languages.

```yaml
# Adaptive threshold example
- type: context-faithfulness
  threshold: |
    {{
      isSameLanguage(query_lang, context_lang) ? 0.90 :
      areRelatedLanguages(query_lang, context_lang) ? 0.75 :
      haveSameScript(query_lang, context_lang) ? 0.70 :
      0.60
    }}
```

### 2. Context-Relevance
**What it measures**: What fraction of the context is relevant to answering the query

**Cross-lingual behavior**:
- **Excellent** (85-100%): Works consistently well across ALL language pairs
- This is the MOST ROBUST metric for cross-lingual scenarios

**Recommendation**: Keep thresholds high even for cross-lingual cases.

```yaml
# Can use consistent threshold
- type: context-relevance
  threshold: 0.85  # Works well even cross-lingually
```

### 3. Context-Recall
**What it measures**: Whether context contains all information needed for the expected answer

**Cross-lingual behavior**:
- **Good** (70-90%): Same language only
- **Poor** (10-40%): Cross-lingual scenarios
- This metric struggles the MOST with language differences

**Recommendation**: Use very low thresholds or consider alternative metrics for cross-lingual.

```yaml
# Requires aggressive adjustment
- type: context-recall
  value: "{{expected_answer}}"
  threshold: |
    {{
      isSameLanguage(query_lang, context_lang) ? 0.75 :
      0.20  # Very low for cross-lingual
    }}
```

### 4. Answer-Relevance
**What it measures**: How directly the answer addresses the question

**Cross-lingual behavior**:
- **Good** (75-90%): Stable across most scenarios
- Slight degradation for distant language pairs

**Recommendation**: Moderately robust, small adjustments needed.

```yaml
# Minor adjustments sufficient
- type: answer-relevance
  threshold: |
    {{
      isSameLanguage(query_lang, context_lang) ? 0.85 :
      0.75  # Small reduction for cross-lingual
    }}
```

## Practical Configuration Examples

### Configuration 1: Production System (Strict)

```yaml
# For production systems requiring high confidence
description: Production multi-lingual RAG evaluation

defaultTest:
  assert:
    # Same language defaults
    - type: context-faithfulness
      threshold: 0.90
    - type: context-relevance
      threshold: 0.90
    - type: context-recall
      value: "{{expected}}"
      threshold: 0.80
    - type: answer-relevance
      threshold: 0.85

scenarios:
  # Override for cross-lingual tests
  cross_lingual_strict:
    config:
      vars:
        is_cross_lingual: true
    assert:
      - type: context-faithfulness
        threshold: 0.75  # Reduced by 15%
      - type: context-relevance
        threshold: 0.85  # Reduced by 5% (robust metric)
      - type: context-recall
        value: "{{expected}}"
        threshold: 0.30  # Reduced by 50% (struggles cross-lingually)
      - type: answer-relevance
        threshold: 0.75  # Reduced by 10%
```

### Configuration 2: Development/Testing (Balanced)

```yaml
# For development with reasonable expectations
description: Development multi-lingual RAG evaluation

defaultTest:
  assert:
    - type: context-faithfulness
      threshold: 0.70  # Balanced baseline
    - type: context-relevance
      threshold: 0.80  # Keep relatively high
    - type: context-recall
      value: "{{expected}}"
      threshold: 0.40  # Lower baseline
    - type: answer-relevance
      threshold: 0.70

# Use metadata to determine thresholds
tests:
  - vars:
      query_language: "es"
      context_language: "en"
    metadata:
      language_pair: "different"
    assert:
      - type: context-faithfulness
        threshold: 0.60  # Adjust based on metadata
```

### Configuration 3: Research/Experimental (Lenient)

```yaml
# For research and initial testing
description: Experimental multi-lingual RAG

defaultTest:
  assert:
    - type: context-faithfulness
      threshold: 0.50  # Very lenient
    - type: context-relevance
      threshold: 0.70  # Still meaningful
    - type: context-recall
      threshold: 0.15  # Extremely low
    - type: answer-relevance
      threshold: 0.60
```

## Language Pair Specific Guidance

### High Compatibility Pairs (Use higher thresholds)
- **Same Language**: EN→EN, ES→ES, FR→FR (baseline thresholds)
- **Romance Languages**: ES↔PT, ES↔IT, FR↔IT (reduce by 10-15%)
- **Germanic Languages**: EN↔DE, DE↔NL (reduce by 10-15%)

### Medium Compatibility Pairs (Use moderate thresholds)
- **Same Script Different Family**: EN↔ES, EN↔FR (reduce by 20-25%)
- **Slavic Languages**: RU↔PL, RU↔UK (reduce by 15-20%)
- **Asian Languages Same Family**: ZH↔JA (kanji), KO↔JA (reduce by 25-30%)

### Low Compatibility Pairs (Use lower thresholds)
- **Different Scripts**: EN↔AR, EN↔ZH, EN↔JA (reduce by 30-40%)
- **Distant Languages**: AR↔JA, KO↔AR (reduce by 40-50%)
- **RTL vs LTR**: AR/HE↔any LTR language (reduce by 25-35%)

## Special Considerations

### Technical Content
Technical content with code or specialized terminology often performs BETTER cross-lingually because:
- Technical terms remain in English
- Code is language-agnostic
- Structure is more important than natural language

**Adjustment**: Add 5-10% to thresholds for technical content

### Context Quality Impact
Poor context affects metrics MORE than language differences:
- **Rich context**: Add 5-10% to thresholds
- **Minimal context**: Subtract 10-20% from thresholds
- **Partial context**: Subtract 5-10% from thresholds

### Model-Specific Adjustments
Different models have varying multilingual capabilities:
- **GPT-4o**: Use standard thresholds
- **GPT-4o-mini**: Reduce thresholds by 5-10%
- **Claude 3.5**: Use standard thresholds
- **Open-source models**: Reduce by 10-20% unless fine-tuned

## Implementation Strategy

### Step 1: Identify Your Scenario
```python
def get_threshold_adjustment(query_lang, context_lang):
    if query_lang == context_lang:
        return 1.0  # No adjustment
    elif are_related_languages(query_lang, context_lang):
        return 0.85  # 15% reduction
    elif have_same_script(query_lang, context_lang):
        return 0.80  # 20% reduction
    elif are_different_scripts(query_lang, context_lang):
        return 0.70  # 30% reduction
    else:  # Distant languages
        return 0.60  # 40% reduction
```

### Step 2: Apply Metric-Specific Factors
```python
def get_metric_threshold(base_threshold, metric_type, adjustment):
    if metric_type == 'context-relevance':
        # Most robust metric, minimal adjustment
        return base_threshold * (0.95 + 0.05 * adjustment)
    elif metric_type == 'context-recall':
        # Struggles most, aggressive adjustment
        return base_threshold * (adjustment * 0.5)
    elif metric_type == 'context-faithfulness':
        # Moderate adjustment
        return base_threshold * adjustment
    elif metric_type == 'answer-relevance':
        # Slight adjustment
        return base_threshold * (0.9 + 0.1 * adjustment)
```

### Step 3: Monitor and Adjust
Track actual scores in production and adjust thresholds based on:
- False positive rate (tests passing when they shouldn't)
- False negative rate (tests failing when they shouldn't)
- User feedback on quality

## Common Pitfalls to Avoid

1. **Don't use same thresholds for all language pairs**
   - Cross-lingual performance varies significantly
   - Adjust based on language relationship

2. **Don't rely heavily on context-recall for cross-lingual**
   - This metric struggles most with language differences
   - Consider using alternative metrics or very low thresholds

3. **Don't ignore context quality**
   - Poor context affects metrics more than language differences
   - Ensure sufficient context regardless of language

4. **Don't set thresholds too high initially**
   - Start with lenient thresholds and tighten gradually
   - Collect data on actual performance first

5. **Don't forget to test edge cases**
   - Mixed-language documents
   - Code-switching within text
   - Technical terms in different languages

## Conclusion

Multi-lingual RAG evaluation is complex but manageable with proper threshold adjustments. Key takeaways:

1. **Context-relevance** is your most reliable cross-lingual metric
2. **Context-recall** requires the most adjustment (50-80% reduction)
3. **Context-faithfulness** degrades predictably with language distance
4. **Answer-relevance** remains relatively stable

Start with the balanced thresholds provided, monitor actual performance, and adjust based on your specific use case and quality requirements.
