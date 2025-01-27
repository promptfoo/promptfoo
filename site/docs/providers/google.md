# Google AI / Gemini

The `google` provider enables integration with Google AI Studio and the Gemini API. It provides access to Google's state-of-the-art language models with support for text, images, and video inputs.

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

Production Models:

- `google:gemini-2.0-flash` - Latest multimodal model with next generation features
- `google:gemini-2.0-flash-exp` - Experimental version of Gemini 2.0 Flash
- `google:gemini-2.0-thinking` - Optimized for complex reasoning and problem-solving
- `google:gemini-1.5-flash-8b` - Fast and cost-efficient multimodal model
- `google:gemini-1.5-pro` - Best performing multimodal model for complex reasoning
- `google:gemini-pro` - Legacy model (consider upgrading to 1.5 or 2.0)
- `google:gemini-pro-vision` - Legacy vision model (consider upgrading to 1.5 or 2.0)

:::tip
If you are using Google Vertex, see the [`vertex` provider](/docs/providers/vertex).
:::

Supported environment variables:

- `GOOGLE_API_KEY` (required) - Google AI Studio API key
- `GOOGLE_API_HOST` - used to override the Google API host, defaults to `generativelanguage.googleapis.com`

The provider supports various configuration options that can be used to customize the behavior of the model:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      temperature: 0
      maxOutputTokens: 1024
      topP: 0.8
      topK: 10
      stopSequences: ['END']
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

Safety settings can be configured to control content filtering:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      safetySettings:
        - category: HARM_CATEGORY_DANGEROUS_CONTENT
          threshold: BLOCK_ONLY_HIGH
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

### Gemini 2.0 Thinking

Optimized for complex reasoning and step-by-step problem solving:

```yaml
providers:
  - id: google:gemini-2.0-thinking
    config:
      temperature: 0.3 # Lower temperature for more focused reasoning
      maxOutputTokens: 4096 # Larger context for complex problems
      topP: 0.8
      topK: 20
```

## Function Calling

The provider supports function calling to get structured data outputs and connect with external systems. You can define functions that the model can call to perform specific actions:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      tools:
        function_declarations:
          - name: 'set_light_color'
            description: 'Set the light color'
            parameters:
              type: 'object'
              properties:
                rgb_hex:
                  type: 'string'
                  description: 'The light color as a 6-digit hex string'
              required: ['rgb_hex']
      tool_config:
        function_calling_config:
          mode: 'auto' # or "none" to disable
```

## Structured Output

You can constrain the model to output structured JSON responses in two ways:

### 1. Using Response Schema Configuration

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      generationConfig:
        response_mime_type: 'application/json'
        response_schema:
          type: 'object'
          properties:
            name:
              type: 'string'
            age:
              type: 'number'
          required: ['name', 'age']
```

### 2. Using Prompt-Based Schema

You can also specify the schema in the prompt itself:

```yaml
providers:
  - id: google:gemini-1.5-pro
    config:
      generationConfig:
        response_mime_type: 'application/json'
      prompt: |
        Return data using this schema:
        {
          "type": "object",
          "properties": {
            "name": {"type": "string"},
            "age": {"type": "number"}
          }
        }
```
