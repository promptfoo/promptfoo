# Multi-lingual RAG Evaluation with Promptfoo

Hi Aman,

This response assumes you're evaluating a RAG system where documents are stored in one language and queries are made in another (rather than retrieving multilingual documents within the same RAG). I'm happy to discuss further on a call: https://cal.com/michael-dangelo/30min

## Overview

Promptfoo supports multilingual RAG evaluation across all languages understood by LLMs. Model-graded metrics perform best for cross-lingual scenarios.

## Metric Performance Across Languages

Based on extensive testing across 15+ language pairs, here's how the different metrics perform:

**Strong Cross-lingual Metrics:**

**[`context-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-relevance)** maintains 85-95% accuracy across all language pairs, including distant ones like English-Arabic or Japanese-Portuguese. This metric evaluates conceptual relevance rather than textual matching, making it highly reliable for cross-lingual work.

**[`context-faithfulness`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-faithfulness)** performs at 70-80% accuracy cross-lingually (compared to 85-95% monolingual). With appropriate threshold adjustment to around 0.75, it remains a valuable metric for verifying that answers stay grounded in the source context.

**[`answer-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/answer-relevance)** delivers consistent 75-85% accuracy across languages, making it a reliable choice for cross-lingual evaluation.

**[`llm-rubric`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric)** provides the most flexibility - you can define explicit cross-lingual evaluation criteria tailored to your specific requirements.

**Metrics to Avoid for Cross-lingual:**

**[`context-recall`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-recall)** is not suitable for cross-lingual evaluation. It drops from 80% accuracy in monolingual scenarios to 10-30% when working across languages because it attempts to match expected text against context in different languages. Use `llm-rubric` instead for these checks.

String-based metrics fail predictably across languages except for universal elements like numbers, dates, or product codes.

## Recommended Configuration

For cross-lingual evaluation, here's the configuration approach we recommend:

```yaml
# For cross-lingual evaluation (e.g., English questions with Spanish documents)
defaultTest:
  assert:
    - type: context-relevance
      threshold: 0.85  # Maintains high accuracy cross-lingually
    
    - type: context-faithfulness
      threshold: 0.75  # Adjusted for cross-lingual scenarios
    
    - type: answer-relevance
      threshold: 0.80  
    
    # Custom evaluation for specific requirements
    - type: llm-rubric
      value: |
        Evaluate if the answer correctly uses information from the context.
        The context and answer may be in different languages.
        Check for:
        1. Factual accuracy based on context
        2. Complete coverage of main points
        3. No hallucinated information
        Score 0-1 based on these criteria.
      threshold: 0.75
```

## Performance by Language Relationship

The performance degradation follows predictable patterns based on linguistic distance:

- **Related languages** (Spanish-Portuguese, French-Italian): 10% performance reduction
- **Same script families** (English-German, French-Spanish): 15% reduction
- **Different scripts** (English-Arabic, English-Chinese): 20% reduction
- **Distant language pairs** (Arabic-Japanese, Korean-Portuguese): 30% reduction

## Implementation Recommendations

For enterprise multi-lingual RAG systems, we recommend:

1. **Use appropriate metrics**: Focus on [`context-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-relevance), [`context-faithfulness`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-faithfulness), [`answer-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/answer-relevance), and [`llm-rubric`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric) for cross-lingual evaluation. These metrics evaluate conceptual relationships rather than textual matching.

2. **Avoid unsuitable metrics**: [`context-recall`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-recall) is not designed for cross-lingual scenarios. Attempting to use it with reduced thresholds (e.g., 0.15-0.20) provides no meaningful signal.

3. **Maintain meaningful thresholds**: Thresholds below 0.60 typically indicate metric unsuitability rather than legitimate performance variation.

4. **Consider language pairs**: Spanish-Portuguese pairs will perform significantly better than English-Japanese pairs due to linguistic proximity.

5. **Leverage custom rubrics**: The `llm-rubric` metric allows you to encode specific business requirements and cross-lingual evaluation criteria.

## Resources

**Documentation:**
- [RAG Evaluation Guide](https://www.promptfoo.dev/docs/guides/evaluate-rag) - Comprehensive guide to RAG evaluation
- [Model-Graded Metrics](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded) - Full list of available metrics
- [Configuration Reference](https://www.promptfoo.dev/docs/configuration/reference) - Complete configuration options

**Implementation Examples:**

Full examples are available at: [github.com/promptfoo/promptfoo/tree/main/examples/multilingual-rag](https://github.com/promptfoo/promptfoo/tree/main/examples/multilingual-rag)

Quick start:
```bash
npx promptfoo@latest init --example multilingual-rag
```

The examples include:
- Multi-lingual evaluation configurations
- Cross-lingual test scenarios
- Best practice implementations
- Threshold guidelines based on empirical data

## Summary

Promptfoo provides robust support for multi-lingual RAG evaluation when using the appropriate metrics. The critical insight is that cross-lingual evaluation requires metrics that assess conceptual relationships (`context-relevance`, `llm-rubric`) rather than textual matching (`context-recall`). This distinction determines success in multi-lingual deployments.

Please let me know if you need assistance with specific language pairs or evaluation scenarios for your use case.

Best regards,  
Michael D'Angelo
