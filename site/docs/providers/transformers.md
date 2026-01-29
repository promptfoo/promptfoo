---
sidebar_label: Transformers.js
description: Run local LLM inference with Transformers.js for embeddings and text generation without external APIs
---

# Transformers.js

The Transformers.js provider enables fully local inference using [Transformers.js](https://huggingface.co/docs/transformers.js), running ONNX-optimized models directly in Node.js without external APIs or GPU setup.

## Installation

Transformers.js is an optional dependency (~200MB for ONNX runtime):

```bash
npm install @huggingface/transformers
```

## Quick Start

### Embeddings

```yaml
providers:
  - transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
```

Popular models: `Xenova/all-MiniLM-L6-v2` (384d), `Xenova/bge-small-en-v1.5` (384d), `nomic-ai/nomic-embed-text-v1.5` (768d)

### Text Generation

```yaml
providers:
  - transformers:text-generation:Xenova/gpt2
```

Popular models: `Xenova/gpt2`, `onnx-community/Qwen3-0.6B-ONNX`, `onnx-community/Llama-3.2-1B-Instruct-ONNX`

:::note
Text generation runs on CPU and is best for testing. For production, consider [Ollama](/docs/providers/ollama) or cloud APIs.
:::

## Configuration

### Common Options

These options apply to both embedding and text generation providers:

| Option           | Description                                                         | Default        |
| ---------------- | ------------------------------------------------------------------- | -------------- |
| `device`         | `'auto'`, `'cpu'`, `'gpu'`, `'wasm'`, `'webgpu'`, `'cuda'`, `'dml'` | `'auto'`       |
| `dtype`          | Quantization: `'fp32'`, `'fp16'`, `'q8'`, `'q4'`                    | `'auto'`       |
| `cacheDir`       | Override model cache directory                                      | System default |
| `localFilesOnly` | Skip downloads, use cached models only                              | `false`        |
| `revision`       | Model version/branch                                                | `'main'`       |

### Embedding Options

```yaml
providers:
  - id: transformers:feature-extraction:Xenova/bge-small-en-v1.5
    config:
      prefix: 'query: ' # Required for BGE, E5 models
      pooling: mean # 'mean', 'cls', 'first_token', 'eos', 'last_token', 'none'
      normalize: true # L2 normalize embeddings
      dtype: q8
```

**Model prefixes:** BGE and E5 models require `prefix: 'query: '` for queries or `prefix: 'passage: '` for documents. MiniLM models need no prefix.

:::tip
`transformers:embeddings:<model>` is an alias for `transformers:feature-extraction:<model>`.
:::

### Text Generation Options

```yaml
providers:
  - id: transformers:text-generation:onnx-community/Qwen3-0.6B-ONNX
    config:
      maxNewTokens: 256
      temperature: 0.7
      topK: 50
      topP: 0.9
      doSample: true
      repetitionPenalty: 1.1
      noRepeatNgramSize: 3
      numBeams: 1
      returnFullText: false
      dtype: q4
```

## Using for Similarity Assertions

Use local embeddings as a grading provider for `similar` assertions:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: transformers:feature-extraction:Xenova/all-MiniLM-L6-v2

providers:
  - openai:gpt-4o-mini

tests:
  - vars:
      question: 'What is photosynthesis?'
    assert:
      - type: similar
        value: 'Photosynthesis converts light to chemical energy in plants'
        threshold: 0.8
```

Or override per-assertion:

```yaml
assert:
  - type: similar
    value: 'Expected output'
    threshold: 0.75
    provider: transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
```

## Performance

- **Caching:** Pipelines are cached after first load. Initial model download may take time, but subsequent runs are fast.
- **Quantization:** Use `dtype: q4` or `dtype: q8` for faster inference and lower memory.
- **Concurrency:** For limited RAM, use `promptfoo eval -j 1` to run serially.

## Troubleshooting

| Problem                  | Solution                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency not installed | Run `npm install @huggingface/transformers`                                                                                                             |
| Model not found          | Verify model exists at [HuggingFace](https://huggingface.co/models?library=transformers.js) with ONNX weights. Try `Xenova` or `onnx-community` models. |
| Out of memory            | Use `dtype: q4`, run with `-j 1`, or try smaller models                                                                                                 |
| Slow first run           | Models download on first use. Pre-download with `await pipeline('feature-extraction', 'model-name')`                                                    |

## Supported Models

Browse compatible models at [huggingface.co/models?library=transformers.js](https://huggingface.co/models?library=transformers.js).

Key organizations: **Xenova** (optimized ONNX models), **onnx-community** (community exports)
