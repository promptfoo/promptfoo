# Google AI / Gemini

The `google` provider enables integration with Google AI Studio and the Gemini API. It provides access to Google's state-of-the-art language models with support for text, images, and video inputs.

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

- `google:gemini-2.5-flash-preview-04-17` - Latest Flash model with thinking capabilities for enhanced reasoning
- `google:gemini-2.5-pro-exp-03-25` - Latest thinking model, designed to tackle increasingly complex problems with enhanced reasoning capabilities
- `google:gemini-2.0-flash-exp` - Multimodal model with next generation features
- `google:gemini-2.0-flash-thinking-exp` - Optimized for complex reasoning and problem-solving
- `google:gemini-1.5-flash-8b` - Fast and cost-efficient multimodal model
- `google:gemini-1.5-pro` - Best performing multimodal model for complex reasoning
- `google:gemini-pro` - General purpose text and chat
- `google:gemini-pro-vision` - Multimodal understanding (text + vision)

:::tip
If you are using Google Vertex, see the [`vertex` provider](/docs/providers/vertex).
:::

## Configuration

- `GOOGLE_API_KEY` (required) - Google AI Studio API key
- `GOOGLE_API_HOST` - used to override the Google API host, defaults to `generativelanguage.googleapis.com`

### Basic Configuration

The provider supports various configuration options that can be used to customize the behavior of the model:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      temperature: 0.7 # Controls randomness (0.0 to 1.0)
      maxOutputTokens: 2048 # Maximum length of response
      topP: 0.9 # Nucleus sampling
      topK: 40 # Top-k sampling
      stopSequences: ['END'] # Stop generation at these sequences
```

### Thinking Configuration

For models that support thinking capabilities (like Gemini 2.5 Flash), you can configure the thinking budget:

```yaml
providers:
  - id: google:gemini-2.5-flash-preview-04-17
    config:
      generationConfig:
        temperature: 0.7
        maxOutputTokens: 2048
        thinkingConfig:
          thinkingBudget: 1024 # Controls tokens allocated for thinking process
```

The thinking configuration allows the model to show its reasoning process before providing the final answer, which can be helpful for complex tasks that require step-by-step thinking.

You can also specify a response schema for structured output:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      generationConfig:
        response_mime_type: application/json
        response_schema:
          type: object
          properties:
            foo:
              type: string
```

For multimodal inputs (images and video), the provider supports:

- Images: PNG, JPEG, WEBP, HEIC, HEIF formats (max 3,600 files)
- Videos: MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP formats (up to ~1 hour)

### Safety Settings

Safety settings can be configured to control content filtering:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      safetySettings:
        - category: HARM_CATEGORY_DANGEROUS_CONTENT
          probability: BLOCK_ONLY_HIGH # or other thresholds
```

For more details on capabilities and configuration options, see the [Gemini API documentation](https://ai.google.dev/docs).

## Model Examples

### Gemini 2.0 Flash

Best for fast, efficient responses and general tasks:

```yaml
providers:
  - id: google:gemini-2.0-flash
    config:
      temperature: 0.7
      maxOutputTokens: 2048
      topP: 0.9
      topK: 40
```

## Advanced Features

### Function Calling

Enable your model to interact with external systems through defined functions:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      tools:
        function_declarations:
          - name: 'get_weather'
            description: 'Get current weather for a location'
            parameters:
              type: 'object'
              properties:
                location:
                  type: 'string'
                  description: 'City name or coordinates'
                units:
                  type: 'string'
                  enum: ['celsius', 'fahrenheit']
              required: ['location']
      tool_config:
        function_calling_config:
          mode: 'auto' # or 'none' to disable
```

### Structured Output

You can constrain the model to output structured JSON responses in two ways:

#### 1. Using Response Schema Configuration

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      generationConfig:
        response_mime_type: 'application/json'
        response_schema:
          type: 'object'
          properties:
            title:
              type: 'string'
            summary:
              type: 'string'
            tags:
              type: 'array'
              items:
                type: 'string'
          required: ['title', 'summary']
```

#### 2. Using Response Schema File

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      # Can be inline schema or file path
      responseSchema: 'file://path/to/schema.json'
```

For more details, see the [Gemini API documentation](https://ai.google.dev/docs).

## Google Live API

Promptfoo now supports Google's WebSocket-based Live API, which enables low-latency bidirectional voice and video interactions with Gemini models. This API provides real-time interactive capabilities beyond what's available in the standard REST API.

### Using the Live Provider

Access the Live API by specifying the model with the 'live' service type:

```yaml
providers:
  - id: 'google:live:gemini-2.0-flash-exp'
    config:
      generationConfig:
        response_modalities: ['text']
      timeoutMs: 10000
```

### Key Features

- **Real-time bidirectional communication**: Uses WebSockets for faster responses
- **Multimodal capabilities**: Can process text, audio, and video inputs
- **Built-in tools**: Supports function calling, code execution, and Google Search integration
- **Low-latency interactions**: Optimized for conversational applications
- **Session memory**: The model retains context throughout the session

### Function Calling Example

The Live API supports function calling, allowing you to define tools that the model can use:

```yaml
providers:
  - id: 'google:live:gemini-2.0-flash-exp'
    config:
      tools: file://tools.json
      generationConfig:
        response_modalities: ['text']
      timeoutMs: 10000
```

Where `tools.json` contains function declarations and built-in tools:

```json
[
  {
    "functionDeclarations": [
      {
        "name": "get_weather",
        "description": "Get current weather information for a city",
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "city": {
              "type": "STRING",
              "description": "The name of the city to get weather for"
            }
          },
          "required": ["city"]
        }
      }
    ]
  },
  {
    "codeExecution": {}
  },
  {
    "googleSearch": {}
  }
]
```

### Built-in Tools

The Live API includes several built-in tools:

1. **Code Execution**: Execute Python code directly in the model's runtime

   ```json
   {
     "codeExecution": {}
   }
   ```

2. **Google Search**: Perform real-time web searches
   ```json
   {
     "googleSearch": {}
   }
   ```

### Getting Started

Try the examples:

```sh
# Basic text-only example
promptfoo init --example google-live

# Function calling and tools example
promptfoo init --example google-live-tools
```

### Limitations

- Sessions are limited to 15 minutes for audio or 2 minutes of audio and video
- Token counting is not supported
- Rate limits of 3 concurrent sessions per API key apply
- Maximum of 4M tokens per minute

For more details, see the [Live API documentation](https://ai.google.dev/gemini-api/docs/live).
