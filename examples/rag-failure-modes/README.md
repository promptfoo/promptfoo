## How to run

Initialize the example:

```bash
npx promptfoo@latest init --example rag-failure-modes
```

From the initialized example directory:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
npx promptfoo@latest view
```

Or from the repository root during local development:

```bash
npm run local -- eval --config examples/rag-failure-modes/promptfooconfig.yaml
```

Expected result:

```text
6 passed
2 failed
0 errors
```

The two failures are intentional. They demonstrate Promptfoo catching bad RAG cases where the retrieved context is missing or irrelevant. In a real project, these failing cases should trigger retrieval or chunking fixes before deployment.
