# Persistent Model Loading Example

This example demonstrates how to use a persistent model server with promptfoo to avoid reloading models for each evaluation.

## Problem

When using the Python provider with local models (like Hugging Face transformers), the model is loaded into memory for each prompt evaluation. This is extremely inefficient for large language models, causing:

- Slow evaluation times (10-30s per prompt for model loading alone)
- High memory usage (2-8GB+ reloaded repeatedly)
- Unnecessary GPU memory allocation/deallocation

## Solution

This example uses a client-server architecture:

1. **Model Server** (`model_server.py`): Loads the Llama model once and serves predictions via HTTP
2. **Provider Client** (`provider.py`): Sends requests to the server instead of loading the model

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Start the Model Server

In one terminal, start the model server:

```bash
python model_server.py
```

The server will:

- Load a Llama model (defaults to `meta-llama/Llama-3.2-1B` for demo purposes)
- Listen on port 5000
- Keep the model in memory between requests

You can customize the model with environment variables:

```bash
# Use a different model
MODEL_NAME="meta-llama/Llama-3.3-70B-Instruct" python model_server.py

# Use a different port
PORT=8080 python model_server.py
```

### 3. Run promptfoo Evaluation

In another terminal, run the evaluation:

```bash
npx promptfoo@latest eval
```

## Configuration

### Using the Python Provider

```yaml
# promptfooconfig.yaml
providers:
  - id: file://provider.py
    label: Llama (Persistent)
    config:
      max_length: 200
      temperature: 0.8
      timeout: 60 # Longer timeout for larger models

prompts:
  - 'Explain quantum computing in simple terms'
  - 'Write a haiku about machine learning'
```

### Using the HTTP Provider (Alternative)

You can also use promptfoo's built-in HTTP provider:

```yaml
# promptfooconfig.http.yaml
providers:
  - id: http://localhost:5000/generate
    label: Llama (HTTP)
    config:
      method: POST
      headers:
        Content-Type: application/json
      body:
        prompt: '{{prompt}}'
        max_length: 200
        temperature: 0.8
      responseParser: output
```

## Performance Comparison

| Approach                 | Model Load Time | Per-Prompt Time | Memory Usage     |
| ------------------------ | --------------- | --------------- | ---------------- |
| Standard Python Provider | 10-30s          | 10-30s          | 2-8GB per prompt |
| Persistent Server        | 10-30s (once)   | 0.5-2s          | 2-8GB (constant) |

## Security Considerations

⚠️ **Warning**: The example server has no authentication. For production use:

1. Add authentication (API keys, OAuth, etc.)
2. Implement rate limiting
3. Use HTTPS/TLS encryption
4. Set proper CORS policies
5. Run behind a reverse proxy (nginx, caddy)
6. Consider using production inference servers like vLLM or TGI

## Troubleshooting

### Server won't start

- Check if port 5000 is already in use: `lsof -i :5000`
- Ensure you have enough RAM/VRAM for the model
- Check CUDA installation if using GPU: `python -c "import torch; print(torch.cuda.is_available())"`

### Timeouts during generation

- Increase the timeout in provider config
- Use a smaller model for testing
- Ensure the server has enough compute resources

### Connection refused

- Verify the server is running: `curl http://localhost:5000/health`
- Check firewall settings
- Ensure MODEL_SERVER_URL matches your server address

## Next Steps

- For production use, consider [vLLM](https://github.com/vllm-project/vllm) or [Text Generation Inference](https://github.com/huggingface/text-generation-inference)
- Add request queuing for handling concurrent evaluations
- Implement model caching strategies for multiple models
- Add monitoring and logging for production deployments
