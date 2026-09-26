# openai-eval-factuality (OpenAI Factuality Evaluation)

This example compares concise and verbose answers about California's capital using GPT-6 Luna through the Responses API. The `factuality` assertion compares each answer with a reference answer, while `model-graded-closedqa` checks that it does not add unrelated facts. Both assertions make separate grading calls.

## Usage

```bash
npx promptfoo@latest init --example openai-eval-factuality
cd openai-eval-factuality
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

The verbose prompt may fail the second assertion even when its answer is factually correct. Edit the prompts in `prompts/` or the criteria in `promptfooconfig.yaml` to explore the difference.
