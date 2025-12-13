---
sidebar_label: Transformers.js
description: Run local LLM inference with Transformers.js for embeddings and text generation without external APIs
---

# Transformers.js

The Transformers.js provider enables fully local inference using [Transformers.js](https://huggingface.co/docs/transformers.js), which runs ONNX-optimized models directly in Node.js without requiring any external API or GPU setup.

## Installation

Transformers.js is an optional dependency. Install it with:

```bash
npm install @huggingface/transformers
```

## Provider Types

### Embeddings

For local embeddings, use `transformers:feature-extraction:<model>`:

```yaml
providers:
  - transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
```

Popular embedding models:

- `Xenova/all-MiniLM-L6-v2` - Fast, general-purpose embeddings (384 dims)
- `Xenova/bge-small-en-v1.5` - High quality, requires prefix (384 dims)
- `Xenova/bge-base-en-v1.5` - Larger BGE model (768 dims)
- `nomic-ai/nomic-embed-text-v1.5` - Nomic embeddings (768 dims)

### Text Generation

For local text generation, use `transformers:text-generation:<model>`:

```yaml
providers:
  - transformers:text-generation:Xenova/gpt2
```

Popular text generation models:

- `Xenova/gpt2` - Small GPT-2 model for testing
- `onnx-community/Qwen3-0.6B-ONNX` - Latest Qwen3 with thinking capabilities (~600MB)
- `onnx-community/Llama-3.2-1B-Instruct-ONNX` - Small Llama 3.2

:::note

Text generation models run on CPU by default and are best suited for testing and development. For production workloads with larger models, consider GPU-enabled providers like [Ollama](/docs/providers/ollama) or cloud APIs.

:::

## Configuration

### Embedding Options

```yaml
providers:
  - id: transformers:feature-extraction:Xenova/bge-small-en-v1.5
    config:
      # Prefix required for BGE, E5 models
      prefix: 'query: '

      # Pooling strategy: 'mean' (default), 'cls', 'first_token', 'eos', 'last_token', 'none'
      pooling: mean

      # L2 normalize embeddings (default: true)
      normalize: true

      # Device: 'auto', 'cpu', 'gpu', 'wasm', 'webgpu'
      device: cpu

      # Quantization: 'auto', 'fp32', 'fp16', 'q8', 'q4'
      dtype: q8

      # Only load from local cache (no downloads)
      localFilesOnly: false
```

### Text Generation Options

```yaml
providers:
  - id: transformers:text-generation:onnx-community/Qwen3-0.6B-ONNX
    config:
      # Maximum tokens to generate
      maxNewTokens: 256

      # Sampling temperature (higher = more random)
      temperature: 0.7

      # Top-k sampling
      topK: 50

      # Nucleus sampling (top-p)
      topP: 0.9

      # Enable sampling (false = greedy decoding)
      doSample: true

      # Penalty for repeating tokens
      repetitionPenalty: 1.1

      # Quantization for smaller models
      dtype: q4

      # Device selection
      device: cpu
```

### Model Prefixes

Some embedding models require specific prefixes for optimal performance:

| Model Family | Query Prefix | Document Prefix |
| ------------ | ------------ | --------------- |
| BGE          | `query: `    | `passage: `     |
| E5           | `query: `    | `passage: `     |
| Instructor   | Custom       | Custom          |
| MiniLM       | None         | None            |

Example with BGE model:

```yaml
providers:
  - id: transformers:feature-extraction:Xenova/bge-small-en-v1.5
    config:
      prefix: 'query: '
```

:::tip
You can also use `transformers:embeddings:<model>` as an alias for `transformers:feature-extraction:<model>`.
:::

## Using as a Grading Provider

### Similarity Assertions

Use local embeddings for similarity checking:

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

### Per-Assertion Override

Override the embedding provider for specific assertions:

```yaml
tests:
  - vars:
      input: 'Explain machine learning'
    assert:
      - type: similar
        value: 'ML is a subset of AI that learns from data'
        threshold: 0.75
        provider: transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
```

## Complete Example

```yaml title="promptfooconfig.yaml"
description: 'Local embedding evaluation with Transformers.js'

prompts:
  - 'Explain {{concept}} in simple terms.'

providers:
  - openai:gpt-4o-mini
  - anthropic:claude-3-5-haiku-latest

defaultTest:
  options:
    provider:
      embedding:
        id: transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
        config:
          pooling: mean
          normalize: true

tests:
  - vars:
      concept: 'quantum computing'
    assert:
      - type: similar
        value: 'Quantum computers use qubits that can be in multiple states at once'
        threshold: 0.7

  - vars:
      concept: 'machine learning'
    assert:
      - type: similar
        value: 'ML systems learn patterns from data to make predictions'
        threshold: 0.7
```

## Performance Tips

### Pipeline Caching

Pipelines are cached and reused across evaluations. The first call loads the model (which may take several seconds), but subsequent calls are fast.

### Quantization

Use quantized models for faster inference and lower memory:

```yaml
providers:
  - id: transformers:feature-extraction:Xenova/all-MiniLM-L6-v2
    config:
      dtype: q8 # 8-bit quantization
```

Available quantization levels:

- `fp32` - Full precision (largest, slowest)
- `fp16` - Half precision
- `q8` / `int8` - 8-bit quantization
- `q4` - 4-bit quantization (smallest, fastest)

### Serial Evaluation

For systems with limited RAM, run evaluations serially:

```bash
promptfoo eval -j 1
```

## Troubleshooting

### Model Not Found

If you see "Model not found" errors, verify the model exists on HuggingFace and has ONNX weights:

1. Check the model page on [HuggingFace](https://huggingface.co/models?library=transformers.js)
2. Look for ONNX files in the model's file list
3. Try models from the `Xenova` or `onnx-community` organizations

### Out of Memory

For large models, try:

- Using quantized variants (`dtype: q4`)
- Running with lower concurrency (`-j 1`)
- Using smaller model variants

### Slow First Run

The first inference downloads and caches the model. Subsequent runs use the cached model. To pre-download models:

```javascript
import { pipeline } from '@huggingface/transformers';
await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
```

## Supported Models

Browse compatible models at [huggingface.co/models?library=transformers.js](https://huggingface.co/models?library=transformers.js).

Key model organizations:

- **Xenova** - Large collection of optimized ONNX models
- **onnx-community** - Community-maintained ONNX exports
- **Salesforce** - BLIP and other vision-language models

For text generation, look for models with `text-generation` or `text2text-generation` tasks. For embeddings, look for `feature-extraction` or `sentence-similarity` tasks.
