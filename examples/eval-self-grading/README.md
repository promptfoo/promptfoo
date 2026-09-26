# eval-self-grading (Self Grading)

This example compares two customer-support prompts using GPT-6 Sol through the Responses API. A separate model-graded rubric checks that responses do not mention being an AI, and a JavaScript assertion gives shorter responses a higher score.

```bash
npx promptfoo@latest init --example eval-self-grading
cd eval-self-grading
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

The prompts are in `prompts.txt`, and the tests and assertions are in `promptfooconfig.yaml`. To load the test inputs from CSV instead:

```bash
npx promptfoo@latest eval --tests tests.csv --no-cache
```
