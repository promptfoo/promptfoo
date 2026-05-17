# eval-rag (Rag Eval)

You can run this example with:

```bash
npx promptfoo@latest init --example eval-rag
cd eval-rag
```

## Usage

To get started, set your OPENAI_API_KEY environment variable.

Next, edit promptfooconfig.yaml.

Then run:

```bash
npx promptfoo@latest eval
```

Afterwards, you can view the results by running `npx promptfoo@latest view`.

The config intentionally includes a couple of unsupported `context-recall` facts so the results show both successful and failing RAG metrics. Other model-graded scores can vary with the grading model.
