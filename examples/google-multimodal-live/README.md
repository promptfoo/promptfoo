# google-multimodal-live (Google Multimodal Live API with Gemini)

This example demonstrates how to use promptfoo with Google's WebSocket-based Multimodal Live API, which enables low-latency bidirectional interactions with Gemini models. The example includes three different configurations:

1. Basic query demonstration
2. Multiline conversation demonstration
3. Function calling and built-in tools demonstration

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`

You can obtain a Google AI Studio API key from the [Google AI Studio website](https://ai.google.dev/).

## Running the Examples

You can run this example with:

```bash
npx promptfoo@latest init --example google-multimodal-live
```

### Basic Query Example

> Note: Rate limits of 3 concurrent sessions per API key apply (run `promptfoo eval` with `-j 3` to set the concurrency to 3)

The basic configuration in `promptfooconfig.yaml` demonstrates a simple query to the Gemini model:

```bash
promptfoo eval -c promptfooconfig.yaml -j 3
```

### Multiline Conversation Example

The multiline configuration in `promptfooconfig.multiline.yaml` demonstrates a multi-turn conversation:

```bash
promptfoo eval -c promptfooconfig.multiline.yaml -j 3
```

### Function Calling and Tools Example

The tools configuration in `promptfooconfig.tools.yaml` demonstrates function calling and built-in tools like Google Search and code execution:

```bash
promptfoo eval -c promptfooconfig.tools.yaml -j 3
```

After running any evaluation, you can view the results by running:

```bash
promptfoo view
```

## What This Example Demonstrates

### 1. Basic Query

- Simple interaction with the Multimodal Live API
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

## Configuration Details

### Provider Configuration

The example uses the `google:live:gemini-2.0-flash-exp` model with various configurations:

```yaml
providers:
  - id: 'google:live:gemini-2.0-flash-exp'
    config:
      generationConfig:
        response_modalities: ['text']
      timeoutMs: 10000
```

### Tools Configuration

The tools example uses a `tools.json` file that defines:

1. Custom function declarations
2. The built-in code execution capability
3. The built-in Google Search capability

For more information about the Google Multimodal Live API and other Google AI models, see the [Google AI documentation](/docs/providers/google).
