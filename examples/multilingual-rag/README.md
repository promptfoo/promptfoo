# multilingual-rag

This example demonstrates how to evaluate RAG (Retrieval-Augmented Generation) systems across multiple languages, including cross-lingual scenarios where documents are in one language and queries are in another.

## What This Example Tests

1. **Monolingual RAG**: Questions and documents in the same language across 10+ languages
2. **Cross-lingual RAG**: Questions in one language with documents in another
3. **Mixed-language contexts**: Documents containing multiple languages or code-switching
4. **RAG Metrics Performance**: How well metrics like context-faithfulness, context-relevance, and context-recall work across languages

## Environment Variables

This example requires API keys for the models you want to test:

- `OPENAI_API_KEY` - Your OpenAI API key (for GPT-4o models)
- `ANTHROPIC_API_KEY` - Your Anthropic API key (for Claude models)

You can set these in a `.env` file or directly in your environment.

## Running the Examples

You can run this example with:

```bash
npx promptfoo@latest init --example multilingual-rag
```

For local development, use:

```bash
# Basic multilingual evaluation
npm run local -- eval -c examples/multilingual-rag/promptfooconfig.yaml

# Advanced multilingual with edge cases
npm run local -- eval -c examples/multilingual-rag/promptfooconfig-advanced.yaml

# Cross-lingual evaluation (documents in one language, queries in another)
npm run local -- eval -c examples/multilingual-rag/promptfooconfig-crosslingual.yaml

# View results in the web UI
npm run local -- view
```

## Example Configurations

### 1. Basic Multilingual (`promptfooconfig.yaml`)

Tests RAG metrics across 10 languages with matching query-document pairs:
- English, Spanish, French, German, Japanese, Chinese, Arabic, Korean, Portuguese, Hindi
- Tests core metrics: context-faithfulness, context-relevance, answer-relevance
- Includes cross-lingual test with mixed-language context

### 2. Advanced Multilingual (`promptfooconfig-advanced.yaml`)

Tests edge cases and specific challenges:
- Technical terminology across languages
- Code-switching and mixed language content
- Cultural idioms and expressions
- Numeric and date format differences
- Right-to-left languages (Arabic, Hebrew)
- Character-based languages (Chinese, Japanese)
- Dialectal variations (Brazilian vs European Portuguese)
- Content with emojis and special characters

### 3. Cross-lingual (`promptfooconfig-crosslingual.yaml`)

Tests scenarios where questions and documents are in different languages:
- English questions with Spanish documents
- Japanese questions with Arabic documents
- Mixed multilingual documents with single-language queries
- Technical documentation in multiple languages
- 15 different language pair combinations

## Key Metrics Tested

### Metrics That Work Well Cross-Lingually ✅
- **context-relevance** (85-95%): How much of the retrieved context is relevant? **Best performer!**
- **context-faithfulness** (70-80%): Does the answer only use information from the context? 
- **answer-relevance** (75-85%): Does the answer address the question?
- **llm-rubric**: Custom evaluation criteria - **Most flexible for cross-lingual**

### Metrics That Don't Work Cross-Lingually ❌
- **context-recall** (10-30%): Fails because it tries to match expected text against context in different language
- **factuality**: Only works if ground truth is translated to output language
- **String matching**: Obviously fails across languages

**Key Insight**: When a metric drops from 80% to 20% cross-lingually, don't lower thresholds - use different metrics!

## Expected Behavior Across Languages

### What Works Well
- **context-relevance** maintains 85-95% accuracy even for distant language pairs
- **context-faithfulness** and **answer-relevance** degrade predictably with language distance
- **llm-rubric** provides flexible cross-lingual evaluation
- Modern LLMs (GPT-4o, Claude 3.5) understand conceptual relationships across languages

### What Doesn't Work
- **context-recall** drops from 80% to 10-30% cross-lingually (don't use it)
- **String-based metrics** fail completely across languages
- **Factuality checks** require careful translation of ground truth
- **Exact matching** of any kind fails across language boundaries

## Interpreting Results

### Choosing Metrics by Scenario
- **Monolingual**: Use all metrics with standard thresholds (0.80-0.90)
- **Cross-lingual**: Use only context-relevance, context-faithfulness, answer-relevance, and llm-rubric
- **Mixed contexts**: Use conceptual metrics, avoid textual matching

### Expected Performance by Metric
| Metric               | Monolingual | Cross-lingual | Use Cross-lingual?       |
| -------------------- | ----------- | ------------- | ------------------------ |
| context-relevance    | 90-95%      | 85-95%        | ✅ Yes                    |
| context-faithfulness | 85-95%      | 70-80%        | ✅ Yes (adjust threshold) |
| answer-relevance     | 85-90%      | 75-85%        | ✅ Yes                    |
| context-recall       | 75-85%      | 10-30%        | ❌ No (use llm-rubric)    |
| llm-rubric           | 85-95%      | 80-90%        | ✅ Yes (best option)      |

## Customization

### Adding New Languages

Add test cases for new languages in the configuration:

```yaml
tests:
  - vars:
      query: "Your question in the target language"
      context: "Context documents in the same or different language"
    assert:
      - type: context-faithfulness
        threshold: 0.7
```

### Adjusting Thresholds

Modify thresholds based on your requirements:

```yaml
defaultTest:
  assert:
    - type: context-faithfulness
      threshold: 0.8  # Strict requirement
    - type: context-relevance
      threshold: 0.3  # More lenient
```

### Testing Specific Models

Add or modify providers:

```yaml
providers:
  - openai:gpt-4o
  - anthropic:messages:claude-3-5-sonnet-20241022
  - ollama:chat:llama3.3  # For local models
```

## Guidance for Multi-lingual RAG Systems

Based on the evaluation results, here are recommendations:

### 1. Model Selection
- Use models explicitly trained on multilingual data
- GPT-4o and Claude 3.5 show strong multilingual capabilities
- Consider specialized models for specific language pairs

### 2. Prompt Engineering
- Explicitly specify the desired output language
- Include language detection instructions
- Provide examples in multiple languages when possible

### 3. Metric Adjustments
- Lower thresholds for cross-lingual scenarios (0.6-0.7 vs 0.8+)
- Use language-specific graders when available
- Combine multiple metrics for robust evaluation

### 4. Context Processing
- Implement language detection for documents
- Consider translation or multilingual embeddings
- Preserve language markers in mixed contexts

### 5. Testing Strategy
- Test each supported language pair
- Include edge cases (mixed languages, code-switching)
- Validate cultural and regional variations

## Troubleshooting

### Low Scores in Specific Languages
- Check if the model supports that language
- Verify character encoding is correct
- Consider using native speakers to validate translations

### Metric Failures
- Some metrics may not work well with non-Latin scripts
- Try using different grader models
- Implement custom assertions for specific languages

### API Rate Limits
- Use `--delay` flag to add delays between API calls
- Consider using local models for high-volume testing

## Further Reading

- [RAG Evaluation Guide](https://www.promptfoo.dev/docs/guides/evaluate-rag)
- [Model-graded Metrics](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded)
- [Custom Assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs)

## Contributing

To add support for additional languages or improve the examples:
1. Add test cases for the new language
2. Document expected behavior and limitations
3. Update thresholds based on testing
4. Submit a pull request with your improvements
