# provider-quiverai (QuiverAI SVG Generation, Vectorization & Pipelines)

Compare QuiverAI's Arrow models — including [Arrow 1.1](https://docs.quiver.ai) and Arrow 1.1 Max — across three workflows: text-to-SVG generation, image-to-SVG vectorization, and a chained `GPT Image-2 → QuiverAI vectorize` pipeline. Every workflow is scored with an LLM-as-judge rubric so you can compare quality side-by-side.

## Setup

```bash
export QUIVERAI_API_KEY=your-api-key
export OPENAI_API_KEY=your-openai-key  # Required for the pipeline + llm-rubric grader
npx promptfoo@latest init --example provider-quiverai
```

## Run the generation suite

```bash
npx promptfoo@latest eval
```

This compares Arrow 1.1, Arrow 1.1 Max, and an Arrow 1.1 variant with `instructions` style guidance side-by-side.

## Run the vectorize suite

```bash
npx promptfoo@latest eval -c promptfooconfig.vectorize.yaml
```

Converts raster reference images into SVGs with both Arrow 1.1 and Arrow 1.1 Max so you can compare fidelity.
The sample inputs are repo-hosted fixtures, which keeps the walkthrough stable
when third-party image hosts change behavior.

## Run the GPT Image-2 → QuiverAI pipeline

```bash
npx promptfoo@latest eval -c promptfooconfig.pipeline.yaml
```

Chains OpenAI `gpt-image-2` (high-quality raster) with the QuiverAI vectorize endpoint to produce a coherent red-panda icon set. The pipeline is a custom JS provider in [`pipeline-provider.js`](pipeline-provider.js); each call hits both APIs serially, so expect longer wall-clock times than a single-provider eval.

Example live cost reference from the May 2026 verification run:

| Step           | Model           | Credits / cost       |
| -------------- | --------------- | -------------------- |
| Raster step    | `gpt-image-2`   | OpenAI image pricing |
| Vectorize step | `arrow-1.1`     | 15 credits           |
| Vectorize step | `arrow-1.1-max` | 20 credits           |

Credits flow through to `result.metadata.credits` so you can budget evals. Check
`GET /v1/models` for the current `pricing_credits`; QuiverAI prices are
model- and operation-specific.

## What This Example Shows

- **Generation**: text → SVG with three side-by-side providers
- **Vectorization**: image → SVG with the `quiverai:vectorize:<model>` route
- **Pipeline**: a custom JS provider that chains GPT Image-2 + QuiverAI vectorize
- `is-xml` to validate SVG structure
- `llm-rubric` with a custom `rubricPrompt` for SVG-specific evaluation
- Streaming on by default for faster generation

## Common Configuration Options

| Option              | Endpoint  | Description                                                  |
| ------------------- | --------- | ------------------------------------------------------------ |
| `instructions`      | generate  | Style guidance separate from the prompt                      |
| `references`        | generate  | Reference images: URL string, `{ url }`, or `{ base64 }`     |
| `n`                 | generate  | Number of outputs per request (1–16)                         |
| `image`             | vectorize | Override image input from prompt (`{ url }` or `{ base64 }`) |
| `auto_crop`         | vectorize | Crop to the dominant subject before vectorization            |
| `target_size`       | vectorize | Square resize target in pixels (128–4096)                    |
| `temperature`       | both      | Randomness (0–2, default 1)                                  |
| `max_output_tokens` | both      | Output token cap (1–131,072)                                 |
| `stream`            | both      | Set `false` to enable response caching                       |

## Learn More

- [QuiverAI Provider Documentation](https://www.promptfoo.dev/docs/providers/quiverai)
- [QuiverAI API Documentation](https://docs.quiver.ai)
