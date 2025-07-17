---
sidebar_label: Persistent Model Loading
---

# Persistent Model Loading for Python Providers

When using promptfoo's Python provider with local models (like Hugging Face transformers), you may encounter a significant performance issue: the model is loaded into memory for every single evaluation request. This guide explains why this happens and provides several solutions to maintain persistent model instances.

## Quick Decision Guide

| Solution          | Best For                                          | Setup Time | Performance |
| ----------------- | ------------------------------------------------- | ---------- | ----------- |
| **vLLM**          | Production deployments needing maximum throughput | 5 min      | ⭐⭐⭐⭐⭐       |
| **Ollama**        | Local development, quick prototyping              | 2 min      | ⭐⭐⭐⭐        |
| **TGI**           | HuggingFace ecosystem users                       | 5 min      | ⭐⭐⭐⭐        |
| **Custom Server** | Special requirements, custom models               | 30 min     | ⭐⭐⭐         |

## The Problem

The Python provider executes your script in a new process for each `call_api` invocation. Currently, promptfoo does not support maintaining a single long-running Python process per provider, which is why the server-based approach is recommended:

```python
# This model gets loaded for EVERY prompt!
from transformers import pipeline

generator = pipeline('text-generation', model='meta-llama/Llama-3.2-1B')

def call_api(prompt, options, context):
    result = generator(prompt)
    return {"output": result[0]['generated_text']}
```

For a model like Llama 3.2 1B, this means:

- ~2-4GB loaded into memory per request (depending on precision/device)
- 5-10 seconds of loading time per evaluation
- Unnecessary GPU memory allocation/deallocation

## Solutions

### Solution 1: Production Inference Servers (Recommended)

For production deployments, use specialized inference servers that are optimized for LLM serving. These provide the best performance, reliability, and features out of the box.

#### vLLM (Fastest Open Source)
The current performance leader with PagedAttention and continuous batching:

```bash
# Install
pip install vllm

# Run server
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.2-1B \
  --port 8000
```

Use in promptfoo:
```yaml
providers:
  - openai:chat:llama-3.2-1b
    config:
      apiBaseUrl: http://localhost:8000/v1
```

**Pros**: 4x faster than vanilla implementations, excellent memory management, OpenAI-compatible API
**Best for**: High-throughput production deployments

#### Ollama (Simplest)
User-friendly local model server with one-line installation:

```bash
# Install: https://ollama.ai
# Pull model
ollama pull llama3:latest

# Automatically starts server on port 11434
```

Use in promptfoo:
```yaml
providers:
  - ollama:llama3:latest
    config:
      temperature: 0.8
```

**Pros**: Dead simple setup, automatic model management, built-in model library
**Best for**: Development, testing, and small-scale deployments

#### Text Generation Inference (TGI)
Hugging Face's production server with native ecosystem integration:

```bash
# Run with Docker
docker run --gpus all -p 8080:80 \
  -v $PWD/data:/data \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id meta-llama/Llama-3.2-1B
```

Use in promptfoo:
```yaml
providers:
  - id: http://localhost:8080/generate
    config:
      method: POST
      body:
        inputs: "{{prompt}}"
        parameters:
          max_new_tokens: 100
      transformResponse: 'json.generated_text'
```

**Pros**: Native HuggingFace integration, built-in monitoring, Flash Attention support
**Best for**: Teams already using HuggingFace ecosystem

#### Other Production Options

**DeepSpeed-MII** (Microsoft): Best for multi-GPU deployments
```bash
pip install deepspeed-mii
# Supports dynamic batching and tensor parallelism
```

**Triton Inference Server** (NVIDIA): Enterprise-grade multi-model serving
```bash
# Supports TensorRT optimization, multiple frameworks
docker run --gpus all -p 8000:8000 nvcr.io/nvidia/tritonserver
```

**Ray Serve**: Scalable Python-native serving
```bash
pip install "ray[serve]"
# Great for complex pipelines and auto-scaling
```

### Solution 2: Custom Model Server (When Inference Servers Don't Work)

If you can't use production inference servers (e.g., custom model architectures, resource constraints, or specific requirements), you can build your own persistent server. This approach requires more work but gives you full control.

#### Step 1: Create the Model Server

**model_server.py**:

```python
from flask import Flask, request, jsonify
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import os
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Load model once at startup
logger = logging.getLogger(__name__)
model_name = os.getenv('MODEL_NAME', 'meta-llama/Llama-3.2-1B')
logger.info(f"Loading model: {model_name}...")

# Set device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"Using device: {device}")

# Load tokenizer and model
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16 if device.type == "cuda" else torch.float32,
    device_map="auto"
)

# Set pad token if needed
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

logger.info("Model loaded successfully!")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "model": model_name})

@app.route('/generate', methods=['POST'])
def generate():
    try:
        data = request.json
        prompt = data.get('prompt', '')
        config = data.get('config', {})

        # Tokenize input
        inputs = tokenizer(prompt, return_tensors="pt", padding=True).to(device)
        
        # Generate text with configurable parameters
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_length=config.get('max_length', 100),
                temperature=config.get('temperature', 0.7),
                num_return_sequences=config.get('num_sequences', 1),
                do_sample=config.get('do_sample', True),
                top_k=config.get('top_k', 50),
                top_p=config.get('top_p', 0.95),
                pad_token_id=tokenizer.pad_token_id
            )
        
        # Decode all outputs
        all_outputs = [tokenizer.decode(output, skip_special_tokens=True) for output in outputs]
        
        return jsonify({
            'output': all_outputs[0],
            'all_outputs': all_outputs,
            'model': model_name
        })
    except Exception as e:
        logger.error(f"Generation error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('MODEL_SERVER_PORT', 5000))
    # Use threaded=False for models that aren't thread-safe
    app.run(host='0.0.0.0', port=port, threaded=False)
```

#### Step 2: Create the Client Provider

**provider.py**:

```python
import requests
import time

def call_api(prompt, options, context):
    config = options.get('config', {})
    server_url = config.get('server_url', 'http://localhost:5000')
    max_retries = config.get('max_retries', 3)

    # Extract generation parameters from config
    generation_config = {
        'max_length': config.get('max_length', 100),
        'temperature': config.get('temperature', 0.7),
        'num_sequences': config.get('num_sequences', 1),
        'do_sample': config.get('do_sample', True),
        'top_k': config.get('top_k', 50),
        'top_p': config.get('top_p', 0.95),
    }

    # Retry logic for reliability
    for attempt in range(max_retries):
        try:
            response = requests.post(
                f"{server_url}/generate",
                json={
                    'prompt': prompt,
                    'config': generation_config
                },
                timeout=config.get('timeout', 30)
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "output": data['output'],
                    "metadata": {
                        "model": data.get('model', 'unknown'),
                        "all_outputs": data.get('all_outputs', [])
                    }
                }
            else:
                error_msg = f"Server returned status {response.status_code}: {response.text}"
                if attempt == max_retries - 1:
                    return {"error": error_msg}
                time.sleep(1)  # Brief pause before retry

        except requests.exceptions.ConnectionError:
            if attempt == max_retries - 1:
                return {
                    "error": "Failed to connect to model server. Ensure it's running on " + server_url
                }
            time.sleep(1)
        except Exception as e:
            return {"error": f"Unexpected error: {str(e)}"}
```

#### Step 3: Configure promptfoo

**promptfooconfig.yaml**:

```yaml
providers:
  - id: file://provider.py
    label: Local Llama
    config:
      server_url: ${MODEL_SERVER_URL:-http://localhost:5000}
      max_length: 150
      temperature: 0.8
      timeout: 30
      max_retries: 3

prompts:
  - 'Write a story about {{topic}}'

tests:
  - vars:
      topic: 'a robot learning to paint'
  - vars:
      topic: 'a cat who becomes a chef'
```

#### Step 4: Run the Setup

```bash
# Terminal 1: Start the model server
pip install flask transformers torch
python model_server.py

# Terminal 2: Run evaluations
npx promptfoo eval
```

### Solution 3: Using promptfoo's HTTP Provider

Once you have an inference server running (either production or custom), you can skip the Python provider entirely and use promptfoo's built-in HTTP provider:

**promptfooconfig.yaml**:

```yaml
providers:
  - id: http://localhost:5000/generate
    label: Llama Server
    config:
      method: POST
      headers:
        Content-Type: application/json
      body:
        prompt: '{{prompt}}'
        config:
          max_length: 150
          temperature: 0.8
      transformResponse: 'json.output'
      # Optional: Add request timeout
      timeout: 30000
```

### Solution 4: FastAPI Alternative (Advanced)

For custom servers that need better async performance with multiple concurrent requests. Note: If your model is CPU-bound, use `uvicorn --workers N` to leverage multiple processes and bypass GIL limitations:

**async_model_server.py**:

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncio
from transformers import pipeline
import torch
import uvicorn

app = FastAPI()

# Model loading
model = None
model_lock = asyncio.Lock()

class GenerationRequest(BaseModel):
    prompt: str
    config: dict = {}

class GenerationResponse(BaseModel):
    output: str
    model: str = "meta-llama/Llama-3.2-1B"

async def get_model():
    global model
    if model is None:
        async with model_lock:
            if model is None:  # Double-check pattern
                model = pipeline('text-generation', model='meta-llama/Llama-3.2-1B')
    return model

@app.on_event("startup")
async def startup_event():
    # Pre-load model on startup
    await get_model()

@app.post("/generate", response_model=GenerationResponse)
async def generate(request: GenerationRequest):
    generator = await get_model()

    # Run CPU-bound operation in thread pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: generator(
            request.prompt,
            max_length=request.config.get('max_length', 100),
            temperature=request.config.get('temperature', 0.7)
        )
    )

    return GenerationResponse(output=result[0]['generated_text'])

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
```



## Best Practices

### 1. Health Checks

Add health check endpoints to ensure your model server is ready:

```python
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "gpu_available": torch.cuda.is_available()
    })
```

### 2. Process Management

Use process managers for production:

```bash
# Using supervisord
[program:model_server]
command=python model_server.py
autostart=true
autorestart=true
stderr_logfile=/var/log/model_server.err.log
stdout_logfile=/var/log/model_server.out.log

# Using systemd
[Unit]
Description=Model Server
After=network.target

[Service]
Type=simple
User=modeluser
WorkingDirectory=/opt/model-server
ExecStart=/usr/bin/python /opt/model-server/model_server.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### 3. GPU Memory Management

For GPU models, implement proper memory management:

```python
import torch
import gc

def clear_gpu_memory():
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        gc.collect()

# Use in your server
@app.route('/clear_cache', methods=['POST'])
def clear_cache():
    clear_gpu_memory()
    return jsonify({"status": "cache cleared"})
```

#### Quantization for Memory Efficiency

For consumer GPUs, consider using 4-bit or 8-bit quantization:

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
import torch

# 4-bit quantization with bitsandbytes
quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4"
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-1B",
    quantization_config=quantization_config,
    device_map="auto"
)
```

See the [Hugging Face quantization guide](https://huggingface.co/docs/transformers/quantization) for more details.

### 4. Batching Requests

For better throughput, implement request batching with timeout-based flushing:

```python
from collections import deque
import threading
import time

class BatchProcessor:
    def __init__(self, model, batch_size=8, timeout=0.1):
        self.model = model
        self.batch_size = batch_size
        self.timeout = timeout
        self.queue = deque()
        self.lock = threading.Lock()
        self.last_batch_time = time.time()
        
        # Start background thread for timeout-based flushing
        self.running = True
        self.flush_thread = threading.Thread(target=self._flush_worker)
        self.flush_thread.daemon = True
        self.flush_thread.start()

    def add_request(self, prompt, callback):
        with self.lock:
            self.queue.append((prompt, callback))
            # Process immediately if batch is full
            if len(self.queue) >= self.batch_size:
                self._process_batch()

    def _flush_worker(self):
        """Background thread that flushes incomplete batches on timeout"""
        while self.running:
            time.sleep(self.timeout)
            with self.lock:
                if self.queue and time.time() - self.last_batch_time > self.timeout:
                    self._process_batch()

    def _process_batch(self):
        """Process up to batch_size items from queue"""
        batch = []
        callbacks = []

        # Must be called with lock held
        while len(batch) < self.batch_size and self.queue:
            prompt, callback = self.queue.popleft()
            batch.append(prompt)
            callbacks.append(callback)

        if batch:
            self.last_batch_time = time.time()
            # Release lock during model inference
            self.lock.release()
            try:
                results = self.model(batch, batch_size=len(batch))
                for result, callback in zip(results, callbacks):
                    callback(result)
            finally:
                self.lock.acquire()

    def shutdown(self):
        """Gracefully shut down the batch processor"""
        self.running = False
        self.flush_thread.join()
```

## Troubleshooting

### Server Won't Start

- Check if the port is already in use: `lsof -i :5000`
- Ensure all dependencies are installed: `pip install -r requirements.txt`
- Check GPU availability: `python -c "import torch; print(torch.cuda.is_available())"`

### Connection Refused

- Verify the server is running: `curl http://localhost:5000/health`
- Check firewall settings
- Ensure the server URL in your config matches the actual server address

### Out of Memory

- Reduce batch size
- Use a smaller model
- Implement model quantization:

  ```python
  from transformers import AutoModelForCausalLM
  import torch

  model = AutoModelForCausalLM.from_pretrained(
      "meta-llama/Llama-3.2-1B",
      torch_dtype=torch.float16,
      device_map="auto"
  )
  ```

### Slow Response Times

- Pre-warm the model with a dummy request on startup
- Use GPU acceleration if available
- Consider using a faster inference engine (TGI, vLLM)

## Example: Multi-Model Server

Here's an advanced example supporting multiple models:

```python
from flask import Flask, request, jsonify
from transformers import pipeline
import os

app = Flask(__name__)

# Model registry
models = {}

def load_model(model_name):
    if model_name not in models:
        print(f"Loading {model_name}...")
        models[model_name] = pipeline('text-generation', model=model_name)
    return models[model_name]

@app.route('/generate/<model_name>', methods=['POST'])
def generate(model_name):
    try:
        generator = load_model(model_name)
        data = request.json
        result = generator(data['prompt'], **data.get('config', {}))
        return jsonify({
            'output': result[0]['generated_text'],
            'model': model_name
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Preload common models
for model in os.environ.get('PRELOAD_MODELS', 'meta-llama/Llama-3.2-1B').split(','):
    load_model(model.strip())
```

## Model Licensing Considerations

When serving models publicly, ensure compliance with model licenses:
- Some models (e.g., LLaMA original) prohibit commercial use
- Others require attribution or have specific serving restrictions
- Check the model card on Hugging Face for license details
- Consider using commercially-friendly models like Falcon, MPT, or Mistral for public APIs

## Conclusion

While the Python provider's default behavior of reloading models for each request is inefficient for local models, modern inference servers have solved this problem comprehensively.

**For 90% of use cases**: Use vLLM, Ollama, or TGI. They provide:
- State-of-the-art performance (4x+ faster than naive implementations)
- Production-ready features (monitoring, scaling, fault tolerance)
- Minimal setup time
- Active maintenance and community support

**Only build a custom server when** you have specific requirements that production servers can't meet, such as:
- Custom model architectures
- Specialized preprocessing/postprocessing
- Extreme resource constraints
- Integration with proprietary systems

Remember: Every hour spent building a custom inference server is an hour not spent on your core AI application. Use battle-tested solutions whenever possible.
