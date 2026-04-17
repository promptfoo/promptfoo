---
title: Python Provider
sidebar_label: Python Provider
sidebar_position: 50
description: 'Create custom Python scripts for advanced model integrations, evals, and complex testing logic'
---

# Python Provider

The Python provider enables you to create custom evaluation logic using Python scripts. This allows you to integrate Promptfoo with any Python-based model, API, or custom logic.

:::tip Python Overview

For an overview of all Python integrations (providers, assertions, test generators, prompts), see the [Python integration guide](/docs/integrations/python).

:::

**Common use cases:**

- Integrating proprietary or local models
- Adding custom preprocessing/postprocessing logic
- Implementing complex evaluation workflows
- Using Python-specific ML libraries
- Creating mock providers for testing

## Prerequisites

Before using the Python provider, ensure you have:

- Python 3.7 or higher installed
- Basic familiarity with Promptfoo configuration
- Understanding of Python dictionaries and JSON

## Quick Start

Let's create a simple Python provider that echoes back the input with a prefix.

### Step 1: Create your Python script

```python
# echo_provider.py
def call_api(prompt, options, context):
    """Simple provider that echoes the prompt with a prefix."""
    config = options.get('config', {})
    prefix = config.get('prefix', 'Tell me about: ')

    return {
        "output": f"{prefix}{prompt}"
    }
```

### Step 2: Configure Promptfoo

```yaml
# promptfooconfig.yaml
providers:
  - id: 'file://echo_provider.py'

prompts:
  - 'Tell me a joke'
  - 'What is 2+2?'
```

### Step 3: Run the evaluation

```bash
npx promptfoo@latest eval
```

That's it! You've created your first custom Python provider.

## How It Works

Python providers use persistent worker processes. Your script is loaded once when the worker starts, not on every call. This makes subsequent calls much faster, especially for scripts with heavy imports like ML models.

When Promptfoo evaluates a test case with a Python provider:

1. **Promptfoo** prepares the prompt based on your configuration
2. **Python Script** is called with three parameters:
   - `prompt`: The final prompt string
   - `options`: Provider configuration from your YAML
   - `context`: Variables and metadata for the current test
3. **Your Code** processes the prompt and returns a response
4. **Promptfoo** validates the response and continues evaluation

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Promptfoo   │────▶│ Your Python  │────▶│ Your Logic  │
│ Evaluation  │     │ Provider     │     │ (API/Model) │
└─────────────┘     └──────────────┘     └─────────────┘
       ▲                    │
       │                    ▼
       │            ┌──────────────┐
       └────────────│   Response   │
                    └──────────────┘
```

## Basic Usage

### Function Interface

Your Python script must implement one or more of these functions. Both synchronous and asynchronous versions are supported:

**Synchronous Functions:**

```python
def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Main function for text generation tasks."""
    pass

def call_embedding_api(prompt: str, options: dict, context: dict) -> dict:
    """For embedding generation tasks."""
    pass

def call_classification_api(prompt: str, options: dict, context: dict) -> dict:
    """For classification tasks."""
    pass
```

**Asynchronous Functions:**

```python
async def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Async main function for text generation tasks."""
    pass

async def call_embedding_api(prompt: str, options: dict, context: dict) -> dict:
    """Async function for embedding generation tasks."""
    pass

async def call_classification_api(prompt: str, options: dict, context: dict) -> dict:
    """Async function for classification tasks."""
    pass
```

### Understanding Parameters

#### The `prompt` Parameter

The prompt can be either:

- A simple string: `"What is the capital of France?"`
- A JSON-encoded conversation: `'[{"role": "user", "content": "Hello"}]'`

```python
def call_api(prompt, options, context):
    # Check if prompt is a conversation
    try:
        messages = json.loads(prompt)
        # Handle as chat messages
        for msg in messages:
            print(f"{msg['role']}: {msg['content']}")
    except:
        # Handle as simple string
        print(f"Prompt: {prompt}")
```

#### The `options` Parameter

Contains your provider configuration and metadata:

```python
{
    "id": "file://my_provider.py",
    "config": {
        # Your custom configuration from promptfooconfig.yaml
        "model_name": "gpt-3.5-turbo",
        "temperature": 0.7,
        "max_tokens": 100,

        # Automatically added by promptfoo:
        "basePath": "/absolute/path/to/config"  # Directory containing your config (promptfooconfig.yaml)
    }
}
```

#### The `context` Parameter

Provides information about the current test case:

```python
{
    "vars": {
        # Variables used in this test case
        "user_input": "Hello world",
        "system_prompt": "You are a helpful assistant"
    }
}
```

### Return Format

Your function must return a dictionary with these fields:

```python
def call_api(prompt, options, context):
    # Required field
    result = {
        "output": "Your response here"
    }

    # Optional fields
    result["tokenUsage"] = {
        "total": 150,
        "prompt": 50,
        "completion": 100
    }

    result["cost"] = 0.0025  # in dollars
    result["cached"] = False
    result["logProbs"] = [-0.5, -0.3, -0.1]
    result["latencyMs"] = 150  # custom latency in milliseconds

    # Error handling
    if something_went_wrong:
        result["error"] = "Description of what went wrong"

    return result
```

### Types

The types passed into the Python script function and the `ProviderResponse` return type are defined as follows:

```python
class ProviderOptions:
    id: Optional[str]
    config: Optional[Dict[str, Any]]

class CallApiContextParams:
    vars: Dict[str, str]

class TokenUsage:
    total: int
    prompt: int
    completion: int

class ProviderResponse:
    output: Optional[Union[str, Dict[str, Any]]]
    error: Optional[str]
    tokenUsage: Optional[TokenUsage]
    cost: Optional[float]
    cached: Optional[bool]
    logProbs: Optional[List[float]]
    latencyMs: Optional[int]  # overrides measured latency
    metadata: Optional[Dict[str, Any]]

class ProviderEmbeddingResponse:
    embedding: List[float]
    tokenUsage: Optional[TokenUsage]
    cached: Optional[bool]

class ProviderClassificationResponse:
    classification: Dict[str, Any]
    tokenUsage: Optional[TokenUsage]
    cached: Optional[bool]

```

:::tip
Always include the `output` field in your response, even if it's an empty string when an error occurs.
:::

## Complete Examples

### Example 1: OpenAI-Compatible Provider

```python
# openai_provider.py
import os
import json
from openai import OpenAI

def call_api(prompt, options, context):
    """Provider that calls OpenAI API."""
    config = options.get('config', {})

    # Initialize client
    client = OpenAI(
        api_key=os.getenv('OPENAI_API_KEY'),
        base_url=config.get('base_url', 'https://api.openai.com/v1')
    )

    # Parse messages if needed
    try:
        messages = json.loads(prompt)
    except:
        messages = [{"role": "user", "content": prompt}]

    # Make API call
    try:
        response = client.chat.completions.create(
            model=config.get('model', 'gpt-3.5-turbo'),
            messages=messages,
            temperature=config.get('temperature', 0.7),
            max_tokens=config.get('max_tokens', 150)
        )

        return {
            "output": response.choices[0].message.content,
            "tokenUsage": {
                "total": response.usage.total_tokens,
                "prompt": response.usage.prompt_tokens,
                "completion": response.usage.completion_tokens
            }
        }
    except Exception as e:
        return {
            "output": "",
            "error": str(e)
        }
```

### Example 2: Local Model with Preprocessing

```python
# local_model_provider.py
import torch
from transformers import pipeline

# Initialize model once
generator = pipeline('text-generation', model='gpt2')

def preprocess_prompt(prompt, context):
    """Add context-specific preprocessing."""
    template = context['vars'].get('template', '{prompt}')
    return template.format(prompt=prompt)

def call_api(prompt, options, context):
    """Provider using a local Hugging Face model."""
    config = options.get('config', {})

    # Preprocess
    processed_prompt = preprocess_prompt(prompt, context)

    # Generate
    result = generator(
        processed_prompt,
        max_length=config.get('max_length', 100),
        temperature=config.get('temperature', 0.7),
        do_sample=True
    )

    return {
        "output": result[0]['generated_text'],
        "cached": False
    }
```

### Example 3: Mock Provider for Testing

```python
# mock_provider.py
import time
import random

def call_api(prompt, options, context):
    """Mock provider for testing evaluation pipelines."""
    config = options.get('config', {})

    # Simulate processing time
    delay = config.get('delay', 0.1)
    time.sleep(delay)

    # Simulate different response types
    if "error" in prompt.lower():
        return {
            "output": "",
            "error": "Simulated error for testing"
        }

    # Generate mock response
    responses = config.get('responses', [
        "This is a mock response.",
        "Mock provider is working correctly.",
        "Test response generated successfully."
    ])

    response = random.choice(responses)
    mock_tokens = len(prompt.split()) + len(response.split())

    return {
        "output": response,
        "tokenUsage": {
            "total": mock_tokens,
            "prompt": len(prompt.split()),
            "completion": len(response.split())
        },
        "cost": mock_tokens * 0.00001
    }
```

## Configuration

### Basic Configuration

```yaml
providers:
  - id: 'file://my_provider.py'
    label: 'My Custom Provider' # Optional display name
    config:
      # Any configuration your provider needs
      api_key: '{{ env.CUSTOM_API_KEY }}'
      endpoint: https://api.example.com
      model_params:
        temperature: 0.7
        max_tokens: 100
```

### Link to Cloud Target

:::info Promptfoo Cloud Feature
Available in [Promptfoo Cloud](/docs/enterprise) deployments.
:::

Link your local provider configuration to a cloud target using `linkedTargetId`:

```yaml
providers:
  - id: 'file://my_provider.py'
    config:
      linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
```

See [Linking Local Targets to Cloud](/docs/red-team/troubleshooting/linking-targets/) for setup instructions.

### Using External Configuration Files

You can load configuration from external files:

```yaml
providers:
  - id: 'file://my_provider.py'
    config:
      # Load entire config from JSON
      settings: file://config/model_settings.json

      # Load from YAML with specific function
      prompts: file://config/prompts.yaml

      # Load from Python function
      preprocessing: file://config/preprocess.py:get_config

      # Nested file references
      models:
        primary: file://config/primary_model.json
        fallback: file://config/fallback_model.yaml
```

Supported formats:

- **JSON** (`.json`) - Parsed as objects/arrays
- **YAML** (`.yaml`, `.yml`) - Parsed as objects/arrays
- **Text** (`.txt`, `.md`) - Loaded as strings
- **Python** (`.py`) - Must export a function returning config
- **JavaScript** (`.js`, `.mjs`) - Must export a function returning config

### Worker Configuration

Python providers use persistent worker processes that stay alive between calls, making subsequent calls faster.

#### Parallelism

Control the number of workers per provider:

```yaml
providers:
  # Default: 1 worker
  - id: file://my_provider.py

  # Multiple workers for parallel execution
  - id: file://api_wrapper.py
    config:
      workers: 4
```

Or set globally:

```bash
export PROMPTFOO_PYTHON_WORKERS=4
```

**When to use 1 worker** (default):

- GPU-bound ML models
- Scripts with heavy imports (avoids loading them multiple times)
- Conversational flows requiring session state

**When to use multiple workers:**

- CPU-bound tasks where parallelism helps
- Lightweight API wrappers

Note that global state is not shared across workers. If your script uses global variables for session management (common in conversational flows like red team evaluations), use `workers: 1` to ensure all requests hit the same worker.

#### Timeouts

Default timeout is 5 minutes (300 seconds). Increase if needed:

```yaml
providers:
  - id: file://slow_model.py
    config:
      timeout: 300000 # milliseconds
```

Or set globally for all providers:

```bash
export REQUEST_TIMEOUT_MS=600000  # 10 minutes
```

### Environment Configuration

#### Custom Python Executable

You can specify a custom Python executable in several ways:

**Option 1: Per-provider configuration**

```yaml
providers:
  - id: 'file://my_provider.py'
    config:
      pythonExecutable: /path/to/venv/bin/python
```

**Option 2: Global environment variable**

```bash
# Use specific Python version globally
export PROMPTFOO_PYTHON=/usr/bin/python3.11
npx promptfoo@latest eval
```

#### Python Detection Process

Promptfoo automatically detects your Python installation in this priority order:

1. **Environment variable**: `PROMPTFOO_PYTHON` (if set)
2. **Provider config**: `pythonExecutable` in your config
3. **Windows smart detection**: Uses `where python` and filters out Microsoft Store stubs (Windows only)
4. **Smart detection**: Uses `python -c "import sys; print(sys.executable)"` to find the actual Python path
5. **Fallback commands**:
   - Windows: `python`, `python3`, `py -3`, `py`
   - macOS/Linux: `python3`, `python`

This enhanced detection is especially helpful on Windows where the Python launcher (`py.exe`) might not be available.

#### Environment Variables

```bash
# Use specific Python version
export PROMPTFOO_PYTHON=/usr/bin/python3.11

# Add custom module paths
export PYTHONPATH=/path/to/my/modules:$PYTHONPATH

# Enable Python debugging with pdb
export PROMPTFOO_PYTHON_DEBUG_ENABLED=true

# Run evaluation
npx promptfoo@latest eval
```

## Advanced Features

### Custom Function Names

Override the default function name:

```yaml
providers:
  - id: 'file://my_provider.py:generate_response'
    config:
      model: 'custom-model'
```

```python
# my_provider.py
def generate_response(prompt, options, context):
    # Your custom function
    return {"output": "Custom response"}
```

### Handling Different Input Types

```python
def call_api(prompt, options, context):
    """Handle various prompt formats."""

    # Text prompt
    if isinstance(prompt, str):
        try:
            # Try parsing as JSON
            data = json.loads(prompt)
            if isinstance(data, list):
                # Chat format
                return handle_chat(data, options)
            elif isinstance(data, dict):
                # Structured prompt
                return handle_structured(data, options)
        except:
            # Plain text
            return handle_text(prompt, options)
```

### Implementing Guardrails

```python
def call_api(prompt, options, context):
    """Provider with safety guardrails."""

    # Check for prohibited content
    prohibited_terms = config.get('prohibited_terms', [])
    for term in prohibited_terms:
        if term.lower() in prompt.lower():
            return {
                "output": "I cannot process this request.",
                "guardrails": {
                    "flagged": True,
                    "reason": "Prohibited content detected"
                }
            }

    # Process normally
    result = generate_response(prompt)

    # Post-process checks
    if check_output_safety(result):
        return {"output": result}
    else:
        return {
            "output": "[Content filtered]",
            "guardrails": {"flagged": True}
        }
```

### OpenTelemetry Tracing

Python providers automatically emit OpenTelemetry spans when tracing is enabled. This provides visibility into Python provider execution as part of your evaluation traces.

**Requirements:**

```bash
pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
```

**Enable tracing:**

```yaml title="promptfooconfig.yaml"
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
```

When tracing is enabled (`PROMPTFOO_ENABLE_OTEL=true`), the Python provider wrapper automatically:

- Creates child spans linked to the parent evaluation trace
- Records request/response body attributes
- Captures token usage from `tokenUsage` in your response
- Includes evaluation and test case metadata

The spans follow [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) with attributes like `gen_ai.request.model`, `gen_ai.usage.input_tokens`, and `gen_ai.usage.output_tokens`.

### Handling Retries

When calling external APIs, implement retry logic in your script to handle rate limits and transient failures:

```python
import time
import requests

def call_api(prompt, options, context):
    """Provider with retry logic for external API calls."""
    config = options.get('config', {})
    max_retries = config.get('max_retries', 3)

    for attempt in range(max_retries):
        try:
            response = requests.post(
                config['api_url'],
                json={'prompt': prompt},
                timeout=30
            )

            # Handle rate limits
            if response.status_code == 429:
                wait_time = int(response.headers.get('Retry-After', 2 ** attempt))
                time.sleep(wait_time)
                continue

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                return {"output": "", "error": f"Failed after {max_retries} attempts: {str(e)}"}
            time.sleep(2 ** attempt)  # Exponential backoff
```

## Troubleshooting

### Common Issues and Solutions

| Issue                       | Solution                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `spawn py -3 ENOENT` errors | Set `PROMPTFOO_PYTHON` env var or use `pythonExecutable` in config  |
| `Python 3 not found` errors | Ensure `python` command works or set `PROMPTFOO_PYTHON`             |
| "Module not found" errors   | Set `PYTHONPATH` or use `pythonExecutable` for virtual environments |
| Script not executing        | Check file path is relative to `promptfooconfig.yaml`               |
| No output visible           | Use `LOG_LEVEL=debug` to see print statements                       |
| JSON parsing errors         | Ensure prompt format matches your parsing logic                     |
| Timeout errors              | Optimize initialization code, load models once                      |

### Debugging Tips

1. **Enable debug logging:**

   ```bash
   LOG_LEVEL=debug npx promptfoo@latest eval
   ```

2. **Add logging to your provider:**

   ```python
   import sys

   def call_api(prompt, options, context):
       print(f"Received prompt: {prompt}", file=sys.stderr)
       print(f"Config: {options.get('config', {})}", file=sys.stderr)
       # Your logic here
   ```

3. **Test your provider standalone:**

   ```python
   # test_provider.py
   from my_provider import call_api

   result = call_api(
       "Test prompt",
       {"config": {"model": "test"}},
       {"vars": {}}
   )
   print(result)
   ```

4. **Use Python debugger (pdb) for interactive debugging:**

   ```bash
   export PROMPTFOO_PYTHON_DEBUG_ENABLED=true
   ```

   With this environment variable set, you can use `import pdb; pdb.set_trace()` in your Python code to set breakpoints:

   ```python
   def call_api(prompt, options, context):
       import pdb; pdb.set_trace()  # Execution will pause here
       # Your provider logic
       return {"output": result}
   ```

   This allows interactive debugging directly in your terminal during evaluation runs.

## Migration Guide

### From HTTP Provider

If you're currently using an HTTP provider, you can wrap your API calls:

```python
# http_wrapper.py
import requests

def call_api(prompt, options, context):
    config = options.get('config', {})
    response = requests.post(
        config.get('url'),
        json={"prompt": prompt},
        headers=config.get('headers', {})
    )
    return response.json()
```

### From JavaScript Provider

The Python provider follows the same interface as JavaScript providers:

```javascript
// JavaScript
module.exports = {
  async callApi(prompt, options, context) {
    return { output: `Echo: ${prompt}` };
  },
};
```

```python
# Python equivalent
def call_api(prompt, options, context):
    return {"output": f"Echo: {prompt}"}
```

## Next Steps

- Learn about [custom assertions](/docs/configuration/expected-outputs/)
- Set up [CI/CD integration](/docs/integrations/github-action.md)
