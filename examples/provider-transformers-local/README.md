# provider-transformers-local (Local LLM Evaluation)

Generate responses and grade their similarity locally with Transformers.js. No API keys are required. The first run downloads the models; later runs use the cached files.

## Usage

Install the optional Transformers.js runtime alongside Promptfoo in the example directory:

```bash
npx promptfoo@latest init --example provider-transformers-local
cd provider-transformers-local
npm install promptfoo @huggingface/transformers@^4.0.0
npx promptfoo eval
```

## What This Example Shows

- **Local text generation** with `onnx-community/Qwen3-0.6B-ONNX`
- **Local embeddings** with `Xenova/all-MiniLM-L6-v2` for similarity assertions

## Models Used

| Model                            | Task            | Size   | Purpose               |
| -------------------------------- | --------------- | ------ | --------------------- |
| `onnx-community/Qwen3-0.6B-ONNX` | Text Generation | ~600MB | Generate responses    |
| `Xenova/all-MiniLM-L6-v2`        | Embeddings      | ~23MB  | Similarity assertions |

## First Run

The first evaluation downloads both models (cached for subsequent runs):

```text
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
