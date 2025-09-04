# Multi-lingual RAG Evaluation with Promptfoo

Hi Aman,

This response assumes you're evaluating a RAG system where documents are stored in one language and queries are made in another (rather than retrieving multilingual documents within the same RAG). I'm happy to discuss further on a call: https://cal.com/michael-dangelo/30min

## Overview

Promptfoo supports multilingual RAG evaluation across all languages understood by LLMs. Model-graded metrics perform best for cross-lingual scenarios.

## Recommended Metrics

For RAG-specific evaluation, these metrics work well cross-lingually:

- **[`context-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-relevance)** - Evaluates conceptual relevance across languages
- **[`context-faithfulness`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-faithfulness)** - Verifies answers stay grounded in source context
- **[`answer-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/answer-relevance)** - Confirms answers address the question

You may see slight score reductions (e.g., English-Spanish produces 0.85 where English-English produces 0.90), but you can adjust thresholds accordingly.

General model-graded metrics like [`llm-rubric`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric) are language-agnostic unless you explicitly specify language requirements.

If using [`similar`](https://www.promptfoo.dev/docs/configuration/expected-outputs/similar), ensure your embedding model supports multilingual embeddings.

## Metrics to Avoid

Several metrics are unsuitable for cross-lingual evaluation:

- **[`context-recall`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-recall)** - Attempts to match expected text against context in different languages, resulting in poor performance

- **String-based metrics** (Levenshtein, ROUGE-N, BLEU, GLEU, METEOR) - These operate at character level without semantic understanding of language

## Resources

**Documentation:**
- [RAG Evaluation Guide](https://www.promptfoo.dev/docs/guides/evaluate-rag)
- [Model-Graded Metrics](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded)

**Examples:**
```bash
npx promptfoo@latest init --example multilingual-rag
```

Please let me know if you need assistance with specific language pairs or evaluation scenarios for your use case.

Best regards,  
Michael D'Angelo
