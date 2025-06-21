---
sidebar_label: Google AI / Gemini
---

# Google AI / Gemini

The `google` provider enables integration with Google AI Studio and the Gemini API. It provides access to Google's state-of-the-art language models with support for text, images, and video inputs.

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash-preview-05-20` - Previous Flash preview with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro-exp-02-05` - Multimodal model with next-gen features, 1M token context window
- `google:gemini-2.0-flash-exp` - Experimental multimodal model with next generation features
- `google:gemini-2.0-flash` - Multimodal model with next-gen features, 1M token context window
- `google:gemini-2.0-flash-lite` - Cost-efficient version of 2.0 Flash with 1M token context
- `google:gemini-2.0-flash-thinking-exp` - Optimized for complex reasoning and problem-solving
- `google:gemini-1.5-flash` - Fast and versatile multimodal model
- `google:gemini-1.5-flash-8b` - Small model optimized for high-volume, lower complexity tasks
- `google:gemini-1.5-pro` - Best performing model for complex reasoning tasks
- `google:gemini-pro` - General purpose text and chat
- `google:gemini-pro-vision` - Multimodal understanding (text + vision)

### Embedding Models

- `google:embedding:text-embedding-004` - Latest text embedding model (Recommended)
- `google:embedding:embedding-001` - Legacy embedding model

:::tip
If you are using Google Vertex, see the [`vertex` provider](/docs/providers/vertex).
:::

## Configuration

- `GOOGLE_API_KEY` (required) - Google AI Studio API key
- `GOOGLE_API_HOST` - used to override the Google API host, defaults to `generativelanguage.googleapis.com`
- `GOOGLE_API_BASE_URL` - used to override the Google API base url, defaults to `https://generativelanguage.googleapis.com`

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
  - id: google:gemini-2.5-flash-preview-05-20
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
  - id: google:gemini-2.5-pro
    config:
      safetySettings:
        - category: HARM_CATEGORY_DANGEROUS_CONTENT
          probability: BLOCK_ONLY_HIGH # or other thresholds
```

### System Instructions

Configure system-level instructions for the model:

```yaml
providers:
  - id: google:gemini-2.5-pro
    config:
      # Direct text
      systemInstruction: 'You are a helpful assistant'

      # Or load from file
      systemInstruction: file://system-instruction.txt
```

System instructions support Nunjucks templating and can be loaded from external files for better organization and reusability.

For more details on capabilities and configuration options, see the [Gemini API documentation](https://ai.google.dev/docs).

## Model Examples

### Gemini 2.5 Pro

Latest stable model for complex reasoning, coding, and multimodal understanding:

```yaml
providers:
  - id: google:gemini-2.5-pro
    config:
      temperature: 0.7
      maxOutputTokens: 4096
      topP: 0.9
      topK: 40
      generationConfig:
        thinkingConfig:
          thinkingBudget: 2048 # Enhanced thinking for complex tasks
```

### Gemini 2.5 Flash

Latest stable Flash model with enhanced reasoning and thinking capabilities:

```yaml
providers:
  - id: google:gemini-2.5-flash
    config:
      temperature: 0.7
      maxOutputTokens: 2048
      topP: 0.9
      topK: 40
      generationConfig:
        thinkingConfig:
          thinkingBudget: 1024 # Fast model with thinking capabilities
```

### Gemini 2.5 Flash-Lite

Most cost-efficient and fastest 2.5 model for high-volume, latency-sensitive tasks:

```yaml
providers:
  - id: google:gemini-2.5-flash-lite
    config:
      temperature: 0.7
      maxOutputTokens: 1024
      topP: 0.9
      topK: 40
      generationConfig:
        thinkingConfig:
          thinkingBudget: 512 # Optimized for speed and cost efficiency
```

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

### Overriding Providers

You can override both the text generation and embedding providers in your configuration. Because of how model-graded evals are implemented, **the text generation model must support chat-formatted prompts**.

You can override providers in several ways:

1. For all test cases using `defaultTest`:

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      # Override text generation provider
      text:
        id: google:gemini-2.0-flash
        config:
          temperature: 0.7
      # Override embedding provider for similarity comparisons
      embedding:
        id: google:embedding:text-embedding-004
```

2. For individual assertions:

```yaml
assert:
  - type: similar
    value: Expected response
    threshold: 0.8
    provider:
      id: google:embedding:text-embedding-004
```

3. For specific tests:

```yaml
tests:
  - vars:
      puzzle: What is 2 + 2?
    options:
      provider:
        text:
          id: google:gemini-2.0-flash
        embedding:
          id: google:embedding:text-embedding-004
    assert:
      - type: similar
        value: The answer is 4
```

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

For practical examples of function calling with Google AI models, see the [google-vertex-tools example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-vertex-tools) which demonstrates both basic tool declarations and callback execution patterns that work with Google AI Studio models.

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

### Search Grounding

Search grounding allows Gemini models to access the internet for up-to-date information, enhancing responses about recent events and real-time data.

#### Basic Usage

To enable Search grounding:

```yaml
providers:
  - id: google:gemini-2.5-flash-preview-05-20
    config:
      tools:
        - googleSearch: {} # or google_search: {}
```

#### Combining with Other Features

You can combine Search grounding with thinking capabilities for better reasoning:

```yaml
providers:
  - id: google:gemini-2.5-pro-preview-06-05
    config:
      generationConfig:
        thinkingConfig:
          thinkingBudget: 1024
      tools:
        - googleSearch: {}
```

#### Supported Models

:::info
Search grounding works with most recent Gemini models including:

- Gemini 2.5 Flash and Pro models
- Gemini 2.0 Flash and Pro models
- Gemini 1.5 Flash and Pro models
  :::

#### Use Cases

Search grounding is particularly valuable for:

- Current events and news
- Recent developments
- Stock prices and market data
- Sports results
- Technical documentation updates

#### Working with Response Metadata

When using Search grounding, the API response includes additional metadata:

- `groundingMetadata` - Contains information about search results used
- `groundingChunks` - Web sources that informed the response
- `webSearchQueries` - Queries used to retrieve information

#### Limitations and Requirements

- Search results may vary by region and time
- Results may be subject to Google Search rate limits
- Search grounding may incur additional costs beyond normal API usage
- Search will only be performed when the model determines it's necessary
- **Important**: Per Google's requirements, applications using Search grounding must display Google Search Suggestions included in the API response metadata

#### Example and Resources

For a complete working example, see the [google-aistudio-search example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-aistudio-search).

For more details, see the [Google AI Studio documentation on Grounding with Google Search](https://ai.google.dev/docs/gemini_api/grounding).

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
