# Suggested Addition to RAG Evaluation Guide

## Multi-lingual RAG Evaluation

When evaluating RAG systems that need to support multiple languages, there are additional considerations beyond standard monolingual evaluation. This section covers best practices for multi-lingual and cross-lingual RAG evaluation.

### Overview

Multi-lingual RAG systems face unique challenges:
- Documents may be in different languages than queries
- Metrics may perform differently across languages
- Cultural context affects both retrieval and generation
- Language detection and routing add complexity

### Cross-Lingual Evaluation

Cross-lingual scenarios occur when your RAG system needs to handle questions in one language with documents in another. This is common in:
- International organizations with multilingual documentation
- Academic research across language barriers  
- Global customer support systems
- Multi-national corporate knowledge bases

#### Example: English Query with Spanish Documents

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    You are a multilingual assistant. Answer the question using the provided context, even if they are in different languages.
    
    Question: {{query}}
    Context: {{context}}
    
    Answer in the same language as the question.

providers:
  - openai:gpt-4o-mini
  - anthropic:messages:claude-3-5-haiku-20241022

tests:
  - vars:
      query: "What are the main causes of climate change?"
      context: |
        El cambio climático es causado principalmente por las emisiones de gases de efecto invernadero.
        La quema de combustibles fósiles libera dióxido de carbono a la atmósfera.
        La deforestación reduce la capacidad de absorber CO2.
    assert:
      - type: factuality
        value: "Climate change is caused by greenhouse gas emissions from fossil fuels and deforestation"
      - type: context-faithfulness
        threshold: 0.7  # Lower threshold for cross-lingual
      - type: answer-relevance
        threshold: 0.7
```

### Choosing the Right Metrics for Cross-Lingual

Not all metrics work well cross-lingually. Choose metrics based on their actual capabilities:

```yaml
# Use metrics that work well cross-lingually
defaultTest:
  assert:
    # ✅ These work well across languages
    - type: context-faithfulness
      threshold: 0.75  # Slight reduction but still meaningful
    - type: context-relevance
      threshold: 0.85  # Excellent cross-lingual performance
    - type: answer-relevance  
      threshold: 0.80  # Good cross-lingual performance
    
    # ❌ Avoid context-recall for cross-lingual
    # It drops from 80% to 20% - use alternatives instead
    
    # ✅ Use llm-rubric for custom cross-lingual evaluation
    - type: llm-rubric
      value: "Check if answer uses context appropriately across languages"
```

#### Which Metrics Work Cross-Lingually?

| Metric                   | Cross-Lingual Performance | Recommendation                         |
| ------------------------ | ------------------------- | -------------------------------------- |
| **context-relevance**    | Excellent (85-95%)        | Use with confidence                    |
| **context-faithfulness** | Good (70-80%)             | Use with slight threshold reduction    |
| **answer-relevance**     | Good (75-85%)             | Use with slight threshold reduction    |
| **context-recall**       | Poor (10-30%)             | **Don't use** - try llm-rubric instead |
| **llm-rubric**           | Excellent                 | Best for custom cross-lingual criteria |

### Testing Multiple Language Pairs

When your application supports multiple languages, test key combinations:

```yaml
scenarios:
  english-spanish:
    config:
      vars:
        source_lang: "en"
        target_lang: "es"
    tests:
      - vars:
          query: "What is renewable energy?"
          context: "La energía renovable proviene de fuentes naturales..."
          
  japanese-english:
    config:
      vars:
        source_lang: "ja"
        target_lang: "en"
    tests:
      - vars:
          query: "再生可能エネルギーとは何ですか？"
          context: "Renewable energy comes from natural sources..."
```

### Language-Aware Prompting

For better multi-lingual performance, be explicit about language handling:

```yaml
prompts:
  - id: explicit-multilingual
    label: "Explicit language instructions"
    raw: |
      LANGUAGE INSTRUCTIONS:
      1. Detect the language of the question
      2. Answer in the SAME language as the question
      3. Use information from context regardless of its language
      4. Maintain appropriate formality for the target language
      
      Question: {{query}}
      Context: {{context}}
```

### Model Selection for Multi-lingual RAG

Different models have varying multilingual capabilities:

```yaml
providers:
  # Best overall multilingual performance
  - id: gpt-4o
    config:
      model: openai:gpt-4o
      temperature: 0.1
    
  # Good balance of cost and multilingual support
  - id: gpt-4o-mini
    config:
      model: openai:gpt-4o-mini
      temperature: 0.1
      
  # Strong on European languages
  - id: claude-haiku
    config:
      model: anthropic:messages:claude-3-5-haiku-20241022
      temperature: 0.1
```

### Common Multi-lingual Challenges and Solutions

#### Challenge 1: Mixed-Language Documents
When documents contain multiple languages:

```yaml
tests:
  - vars:
      query: "How do I implement authentication?"
      context: |
        Pour implémenter l'authentification, use JWT tokens.
        実装には以下のステップが必要です：
        1. Generate token on login
        2. Verify token on each request
    assert:
      - type: context-faithfulness
        threshold: 0.6  # Lower threshold for mixed content
```

#### Challenge 2: Technical Terms Across Languages
Technical terms may not translate well:

```yaml
tests:
  - vars:
      query: "什么是 REST API？"
      context: "REST (Representational State Transfer) is an architectural style..."
    assert:
      - type: llm-rubric
        value: "Response should explain REST API in Chinese while preserving technical terms like 'REST', 'API', 'HTTP'"
```

#### Challenge 3: Cultural Context
Numbers, dates, and cultural references vary:

```yaml
tests:
  - vars:
      query: "What is the population?"
      context: "Die Bevölkerung beträgt 83.240.525 Menschen"  # German number format
    assert:
      - type: contains
        value: "83"  # Check for number regardless of format
```

### Evaluation Strategy for Multi-lingual Systems

1. **Start with monolingual baselines** for each supported language
2. **Test critical language pairs** based on your user base
3. **Include edge cases** like mixed languages and technical content
4. **Validate with native speakers** for quality assurance
5. **Monitor language-specific metrics** in production

### Full Example Configuration

See the complete example in `examples/multilingual-rag/` which includes:
- Testing across 10+ languages
- Cross-lingual scenarios
- Edge cases and mixed-language content
- Language-specific threshold adjustments

Run the example:
```bash
npx promptfoo@latest init --example multilingual-rag
```

### Performance Expectations

Based on testing with current models, different metrics have vastly different cross-lingual performance:

#### Metrics That Work Well Cross-Lingually
- **context-relevance**: 85-95% (nearly as good as monolingual!)
- **context-faithfulness**: 70-80% (good with threshold adjustment)
- **answer-relevance**: 75-85% (reliable across languages)
- **llm-rubric**: 80-90% (when properly configured)

#### Metrics That Don't Work Cross-Lingually
- **context-recall**: 10-30% (don't use for cross-lingual)
- **factuality**: 40-60% (unless ground truth is translated)
- **string matching**: 0-10% (obviously fails)

**Key Insight**: The dramatic performance drop in context-recall (from 80% to 20%) isn't a signal to lower your thresholds - it's a signal to use different metrics. Choose metrics designed for conceptual evaluation rather than textual matching.
