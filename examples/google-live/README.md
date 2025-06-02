# google-live (Google Live API with Gemini)

You can run this example with:

```bash
npx promptfoo@latest init --example google-live
```

This example demonstrates how to use promptfoo with Google's WebSocket-based Live API, which enables low-latency bidirectional interactions with Gemini models. The example includes four different configurations:

1. Basic query demonstration
2. Multiline conversation demonstration
3. Function calling and built-in tools demonstration
4. Stateful API with Python backend

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`
- For the stateful API example: Python 3 with Flask installed (`pip install flask`)

You can obtain a Google AI Studio API key from the [Google AI Studio website](https://ai.google.dev/).

## Running the Examples

You can initialize this example with:

```bash
npx promptfoo@latest init --example google-live
```

This will create a directory with all necessary configuration files. After running any evaluation, you can view the results by running:

```bash
promptfoo view
```

### Basic Query Example

The basic configuration in `promptfooconfig.yaml` demonstrates a simple query to the Gemini model:

```bash
promptfoo eval -c promptfooconfig.yaml -j 3
```

> Note: Rate limits of 3 concurrent sessions per API key apply, which is why we use `-j 3` to limit concurrency.

### Multiline Conversation Example

The multiline configuration in `promptfooconfig.multiline.yaml` demonstrates a multi-turn conversation:

```bash
promptfoo eval -c promptfooconfig.multiline.yaml -j 3
```

### Function Calling and Tools Example

The tools configuration in `promptfooconfig.tools.yaml` demonstrates function calling (where the model can invoke defined functions) and built-in tools like Google Search and code execution:

```bash
promptfoo eval -c promptfooconfig.tools.yaml -j 3
```

### Stateful API Example

This example runs a local Python API that maintains state between function calls:

```bash
promptfoo eval -c promptfooconfig.statefulapi.yaml -j 3
```

**Setup:**

- Requires Python 3 with Flask (`pip install flask`)
- Uses `python3` command by default
- Custom Python path: Set `pythonExecutable` in config or use `PROMPTFOO_PYTHON` environment variable
- Runs on port 8765 (configured in both the Python file and YAML config)

If you encounter errors, check that:

- Flask is properly installed
- Port 8765 is available (not in use by another application)
- Python 3 is in your PATH or correctly configured

## What This Example Demonstrates

### 1. Basic Query

- Simple interaction with the Live API
- Basic assertion testing on model responses

### 2. Multiline Conversation

- Multi-turn conversations with the model
- Using YAML files to structure conversations
- Testing how the model maintains context across turns

### 3. Function Calling and Tools

- Custom function declarations (weather and stock price)
- Built-in Google Search integration
- Built-in code execution capabilities
- Assertions on function calling behavior

### 4. Stateful API Integration

- Promptfoo spawns a local Python API that maintains state between calls
- Demonstrates how to integrate an external service with LLM function calling
- Shows how to test stateful interactions with assertions

## Configuration Details

### Provider Configuration

All examples use the `google:live:gemini-2.0-flash-exp` model with various configurations:

```yaml
providers:
  - id: 'google:live:gemini-2.0-flash-exp'
    config:
      generationConfig:
        response_modalities: ['text']
      timeoutMs: 10000
```

### Tools Configuration

The function calling examples use JSON configuration files that define:

1. Custom function declarations
2. The built-in code execution capability
3. The built-in Google Search capability

For the stateful API, `counter_api.py` implements a simple counter service with endpoints for adding to and retrieving a count value.

For more information about the Google Live API and other Google AI models, see the [Google AI documentation](/docs/providers/google).
