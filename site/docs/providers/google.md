# Google AI / Gemini

The `google` provider enables integration with Google AI Studio and the Gemini API. It provides access to Google's state-of-the-art language models with support for text, images, and video inputs.

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

- `google:gemini-2.0-flash-exp` - Latest multimodal model with next generation features
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
