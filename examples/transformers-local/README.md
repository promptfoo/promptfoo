# transformers-local (Fully Local LLM Evaluation)

This example demonstrates a completely local LLM evaluation setup using Transformers.js - no API keys or external services required.

## Prerequisites

Install the optional Transformers.js dependency:

```bash
npm install @huggingface/transformers
```

## Usage

```bash
npx promptfoo@latest init --example transformers-local
cd transformers-local
npx promptfoo@latest eval
```

## What This Example Shows

- **Local text generation** with `onnx-community/Qwen3-0.6B-ONNX` (latest Qwen3 model with thinking capabilities)
- **Local embeddings** with `Xenova/all-MiniLM-L6-v2` for similarity assertions
- Fully offline evaluation after initial model download
- No API keys needed

## Models Used

| Model                            | Task            | Size   | Purpose               |
| -------------------------------- | --------------- | ------ | --------------------- |
| `onnx-community/Qwen3-0.6B-ONNX` | Text Generation | ~600MB | Generate responses    |
| `Xenova/all-MiniLM-L6-v2`        | Embeddings      | ~23MB  | Similarity assertions |

## First Run

The first evaluation downloads both models (cached for subsequent runs):

```
Downloading Qwen3-0.6B-ONNX... ~600MB
Downloading all-MiniLM-L6-v2... ~23MB
```

Subsequent runs use cached models and are much faster.

## Configuration Highlights

```yaml
providers:
  - id: transformers:text-generation:onnx-community/Qwen3-0.6B-ONNX
    config:
      maxNewTokens: 100
      temperature: 0.6
      topP: 0.95
      doSample: true

defaultTest:
  options:
    provider:
      embedding:
        id: transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
```

## Notes

- Runs entirely on CPU by default
- For faster inference, use `device: webgpu` if your system supports it
- Use `dtype: q4` for smaller memory footprint with quantized models
- Run with `-j 1` for systems with limited RAM
