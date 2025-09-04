Hi Aman,

This response assumes you're evaluating a RAG system where documents are stored in one language and queries are made in another (rather than retrieving multilingual documents within the same RAG).

Promptfoo supports multilingual RAG evaluation across all languages understood by LLMs. Model-graded metrics perform best for cross-lingual scenarios, as opposed to deterministic metrics.

Specifically, [`context-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-relevance), [`context-faithfulness`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-faithfulness), and [`answer-relevance`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/answer-relevance) all work very well. You may see a slight drop in scores (e.g., English-Spanish produces 0.85 where English-English produces 0.90), but you can adjust thresholds if necessary. Other general model-graded metrics like [`llm-rubric`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric) are language-agnostic unless you explicitly specify a language requirement. If using [`similar`](https://www.promptfoo.dev/docs/configuration/expected-outputs/similar), ensure your embedding model is multilingual.

You should avoid certain metrics. In particular, [`context-recall`](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-recall) is unsuitable for cross-lingual evaluation because it attempts to match expected text against context in different languages. Traditional string metrics (Levenshtein, ROUGE-N, BLEU, GLEU, METEOR) fail cross-lingually as they measure surface-level text similarity rather than semantic meaning.

Please let me know if you need assistance with specific evaluation scenarios. I'm happy to discuss further on a call: https://cal.com/michael-dangelo/30min

Best regards,  
Michael D'Angelo
