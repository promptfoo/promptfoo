---
sidebar_label: Google AI / Gemini
description: Configure Google's Gemini models with support for text, images, and video inputs through Google AI Studio API for comprehensive multimodal LLM testing and evaluation
---

# Google AI / Gemini

The `google` provider enables integration with Google AI Studio and the Gemini API. It provides access to Google's state-of-the-art language models with support for text, images, and video inputs.

If you are using Vertex AI instead of Google AI Studio, see the [`vertex` provider](/docs/providers/vertex).

## Authentication

To use the Google AI Studio API, you need to authenticate using an API key. Follow these steps:

### 1. Get an API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Click on "Get API key" in the left sidebar
3. Create a new API key or use an existing one
4. Copy your API key

**Security Note:** Never commit API keys to version control. Always use environment variables or a `.env` file that's added to `.gitignore`.

### 2. Configure Authentication

You have three options for providing your API key:

#### Option 1: Environment Variable (Recommended)

Set the `GOOGLE_API_KEY` environment variable:

```bash
# Using export (Linux/macOS)
export GOOGLE_API_KEY="your_api_key_here"

# Using set (Windows Command Prompt)
set GOOGLE_API_KEY=your_api_key_here

# Using $env (Windows PowerShell)
$env:GOOGLE_API_KEY="your_api_key_here"
```

#### Option 2: .env File (Recommended for Development)

Create a `.env` file in your project root:

```bash
# .env
GOOGLE_API_KEY=your_api_key_here
```

Promptfoo automatically loads environment variables from `.env` files in your project directory. Make sure to add `.env` to your `.gitignore` file.

#### Option 3: Provider Configuration

Specify the API key directly in your configuration:

```yaml
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: your_api_key_here
```

**Note:** Avoid hardcoding API keys in configuration files that might be committed to version control. The API key is automatically detected from the `GOOGLE_API_KEY` environment variable, so you typically don't need to specify it in the config.

If you need to explicitly reference an environment variable in your config, use Nunjucks template syntax:

```yaml
providers:
  - id: google:gemini-2.5-flash # Uses GOOGLE_API_KEY env var
    config:
      # apiKey: "{{ env.GOOGLE_API_KEY }}"  # optional, auto-detected
      temperature: 0.7
```

### 3. Verify Authentication

Test your setup with a simple prompt:

```bash
promptfoo eval --prompt "Hello, how are you?" --providers google:gemini-2.5-flash
```

## Configuration Options

In addition to authentication, you can configure:

- `GOOGLE_API_HOST` - Override the Google API host (defaults to `generativelanguage.googleapis.com`)
- `GOOGLE_API_BASE_URL` - Override the Google API base URL (defaults to `https://generativelanguage.googleapis.com`)

Example with custom host:

```yaml
providers:
  - id: google:gemini-2.5-flash
    config:
      apiHost: custom.googleapis.com
      apiBaseUrl: https://custom.googleapis.com
```

## Quick Start

### 1. Basic Evaluation

Create a simple `promptfooconfig.yaml`:

```yaml
# promptfooconfig.yaml
providers:
  - google:gemini-2.5-flash

prompts:
  - 'Write a haiku about {{topic}}'

tests:
  - vars:
      topic: 'artificial intelligence'
  - vars:
      topic: 'the ocean'
```

Run the eval:

```bash
promptfoo eval
```

### 2. Comparing Models

Compare different Gemini models:

```yaml
providers:
  - google:gemini-2.5-flash
  - google:gemini-2.5-pro
  - google:gemini-2.0-flash

prompts:
  - 'Explain {{concept}} in simple terms'

tests:
  - vars:
      concept: 'quantum computing'
    assert:
      - type: contains
        value: 'qubit'
      - type: llm-rubric
        value: 'The explanation should be understandable by a high school student'
```

### 3. Using Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash # Uses GOOGLE_API_KEY env var
    config:
      # apiKey: "{{ env.GOOGLE_API_KEY }}"  # optional, auto-detected
      temperature: '{{ env.TEMPERATURE | default(0.7) }}' # Default to 0.7 if not set
```

## Troubleshooting

### Common Issues

#### 1. API Key Not Found

**Error**: `API key not found`

**Solution**: Ensure your API key is properly set:

```bash
# Check if the environment variable is set
echo $GOOGLE_API_KEY

# If empty, set it again
export GOOGLE_API_KEY="your_api_key_here"
```

#### 2. Invalid API Key

**Error**: `API key not valid. Please pass a valid API key`

**Solutions**:

- Verify your API key at [Google AI Studio](https://aistudio.google.com/)
- Ensure you're using the correct API key (not a project ID or other credential)
- Check that your API key has the necessary permissions

#### 3. Rate Limiting

**Error**: `Resource has been exhausted`

**Solutions**:

- Add delays between requests:
  ```yaml
  # promptfooconfig.yaml
  evaluateOptions:
    delay: 1000 # 1 second delay between API calls
  ```
- Upgrade your API quota in Google AI Studio
- Use a lower rate tier model like `gemini-2.5-flash-lite`

#### 4. Model Not Available

**Error**: `Model not found`

**Solutions**:

- Check the model name spelling
- Ensure the model is available in your region
- Verify the model is listed in the [available models](https://ai.google.dev/models)

### Debugging Tips

1. **Enable verbose logging**:

   ```bash
   promptfoo eval --verbose
   ```

2. **Test your API key directly**:

   ```bash
   curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
   ```

3. **Check your environment**:
   ```bash
   # List all GOOGLE_ environment variables
   env | grep GOOGLE_
   ```

## Migration Guide

### Migrating from Google AI Studio to Vertex AI

If you need more advanced features or enterprise capabilities, you can migrate to Vertex AI:

| Google AI Studio          | Vertex AI                     | Notes                                   |
| ------------------------- | ----------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`     | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `GOOGLE_CLOUD_PROJECT` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods         | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints            | Vertex requires region selection        |

Example migration:

```yaml
# Before (Google AI Studio)
providers:
  - google:gemini-2.5-pro

# After (Vertex AI)
providers:
  - vertex:gemini-2.5-pro
    config:
      projectId: my-project-id
      region: us-central1
```

See the [Vertex AI provider documentation](/docs/providers/vertex) for detailed setup instructions.

## Available Models

### Chat and Multimodal Models

- `google:gemini-3-flash-preview` - Gemini 3.0 Flash preview with frontier intelligence, Pro-grade reasoning at Flash-level speed, thinking, and grounding ($0.50/1M input, $3/1M output)
- `google:gemini-3-pro-preview` - Gemini 3.0 Pro preview with advanced reasoning, multimodal understanding, and agentic capabilities
- `google:gemini-2.5-pro` - Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Gemini 2.5 Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Cost-efficient Gemini 2.5 model optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-flash-preview-09-2025` - Gemini 2.5 Flash preview with quality improvements
- `google:gemini-2.5-flash-lite-preview-09-2025` - Gemini 2.5 Flash Lite preview with cost and latency optimizations
- `google:gemini-flash-latest` - Alias for `google:gemini-2.5-flash-preview-09-2025`
- `google:gemini-flash-lite-latest` - Alias for `google:gemini-2.5-flash-lite-preview-09-2025`
- `google:gemini-2.5-pro-preview-06-05` - Gemini 2.5 Pro preview (June 2025 release)
- `google:gemini-2.5-pro-preview-05-06` - Gemini 2.5 Pro preview (May 2025 release)
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
- `google:gemini-2.0-flash-exp` - Experimental multimodal model with next generation features
- `google:gemini-2.0-flash` - Multimodal model with next-gen features, 1M token context window
- `google:gemini-2.0-flash-lite` - Cost-efficient version of 2.0 Flash with 1M token context
- `google:gemini-2.0-flash-thinking-exp` - Optimized for complex reasoning and problem-solving

### Embedding Models

- `google:embedding:text-embedding-004` - Google text embedding model
- `google:embedding:embedding-001` - Google embedding model

### Image Generation Models

Imagen models are available through both **Google AI Studio** and **Vertex AI**. Use the `google:image:` prefix:

#### Imagen 4 Models (Available in both Google AI Studio and Vertex AI)

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)

#### Imagen 3 Models (Vertex AI only)

- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

#### Authentication Options

**Option 1: Google AI Studio** (Quick start, limited features)

```bash
export GOOGLE_API_KEY=your-api-key
```

- ✅ Simpler setup with API key
- ✅ Supports Imagen 4 models
- ❌ No support for Imagen 3 models
- ❌ No support for `seed` or `addWatermark` parameters

**Option 2: Vertex AI** (Full features)

```bash
gcloud auth application-default login
export GOOGLE_PROJECT_ID=your-project-id
```

- ✅ All Imagen models supported
- ✅ All configuration parameters supported
- ❌ Requires Google Cloud project with billing

The provider automatically selects the appropriate API based on available credentials.

Configuration options:

```yaml
providers:
  - google:image:imagen-3.0-generate-002
    config:
      projectId: 'your-project-id'  # Or set GOOGLE_PROJECT_ID
      region: 'us-central1'          # Optional, defaults to us-central1
      aspectRatio: '16:9'
      seed: 42
      addWatermark: false            # Must be false when using seed
```

See the [Google Imagen example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-imagen).

### Gemini Native Image Generation Models

Gemini models can generate images natively using the `generateContent` API. Models with `-image` in the name automatically enable image generation:

- `google:gemini-3-pro-image-preview` - Gemini 3 Pro with advanced image generation (~$0.13/image)
- `google:gemini-2.5-flash-image` - Gemini 2.5 Flash with image generation (~$0.04/image)

Configuration options:

```yaml
providers:
  - id: google:gemini-3-pro-image-preview
    config:
      imageAspectRatio: '16:9' # 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
      imageSize: '2K' # 1K, 2K, 4K
      temperature: 0.7
```

Key differences from Imagen:

- Uses same namespace as Gemini chat (`google:model-name`)
- More aspect ratio options (includes 2:3, 3:2, 4:5, 5:4, 21:9)
- Resolution control via `imageSize` (1K, 2K, 4K) - Gemini 3 models only
- Can return both text and images in the same response
- Uses same authentication as Gemini chat models

See the [Google Imagen example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-imagen) for Gemini image generation configurations.

### Video Generation Models (Veo)

Google's Veo models enable AI-powered video generation from text prompts. Use the `google:video:` prefix:

#### Available Models

| Model                                   | Description                                       | Duration Support |
| --------------------------------------- | ------------------------------------------------- | ---------------- |
| `google:video:veo-3.1-generate-preview` | Latest Veo 3.1 model with video extension support | 4, 6, 8 seconds  |
| `google:video:veo-3.1-fast-preview`     | Fast Veo 3.1 model                                | 4, 6, 8 seconds  |
| `google:video:veo-3-generate`           | Veo 3.0 standard model                            | 4, 6, 8 seconds  |
| `google:video:veo-3-fast`               | Veo 3.0 fast model                                | 4, 6, 8 seconds  |
| `google:video:veo-2-generate`           | Veo 2.0 model                                     | 5, 6, 8 seconds  |

#### Basic Usage

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9' # or '9:16'
      resolution: '720p' # or '1080p'
      durationSeconds: 6 # 4, 6, or 8 for Veo 3.x; 5, 6, or 8 for Veo 2

prompts:
  - 'Generate a video of {{subject}}'

tests:
  - vars:
      subject: 'a cat playing with a ball of yarn'
```

#### Configuration Options

| Option             | Type   | Description                                                        |
| ------------------ | ------ | ------------------------------------------------------------------ |
| `aspectRatio`      | string | Video aspect ratio: `16:9` (default) or `9:16`                     |
| `resolution`       | string | Video resolution: `720p` (default) or `1080p`                      |
| `durationSeconds`  | number | Video duration: 4, 6, 8 for Veo 3.x; 5, 6, 8 for Veo 2             |
| `personGeneration` | string | Person generation mode: `allow_adult` or `dont_allow`              |
| `negativePrompt`   | string | Concepts to avoid in the generated video                           |
| `referenceImages`  | array  | Up to 3 reference images (file paths or objects, Veo 3.1 only)     |
| `image`            | string | Source image for image-to-video generation                         |
| `lastImage`        | string | End frame for interpolation (requires `image`)                     |
| `extendVideoId`    | string | Operation ID from previous Veo generation to extend (Veo 3.1 only) |

#### Image-to-Video Generation

Generate videos from a starting image:

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      image: file://assets/start-frame.jpg
      aspectRatio: '16:9'
      durationSeconds: 6

prompts:
  - 'Animate this image: {{animation_description}}'

tests:
  - vars:
      animation_description: 'the character slowly turns to face the camera'
```

#### Video Interpolation (First and Last Frame)

Generate video that transitions between two images:

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      image: file://assets/start.jpg # First frame
      lastImage: file://assets/end.jpg # Last frame
      durationSeconds: 6

prompts:
  - 'Create a smooth transition between these frames'
```

#### Video Extension (Veo 3.1 Only)

Extend a previously generated Veo video using its operation ID:

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      # Use the operation ID from a previous Veo generation
      extendVideoId: projects/my-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/abc123
      durationSeconds: 6

prompts:
  - 'Continue this video with {{continuation}}'

tests:
  - vars:
      continuation: 'the camera panning to reveal a sunset'
```

:::note
Video extension requires an operation ID from a previous Veo video generation, not a local file path. The operation ID is returned in the `metadata.operationName` field of the generation response.
:::

#### Reference Images

Use up to 3 reference images to guide video style (Veo 3.1 only):

```yaml
providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      referenceImages:
        # Simple format: file paths (uses 'asset' reference type)
        - file://assets/style-ref-1.jpg
        - file://assets/style-ref-2.jpg
      aspectRatio: '16:9'
      durationSeconds: 6
```

You can also use the object format to specify the reference type:

```yaml
referenceImages:
  - image: file://assets/character.jpg
    referenceType: asset
  - image: file://assets/background.jpg
    referenceType: asset
```

#### Storage

Generated videos are stored in promptfoo's blob storage system, which uses content-addressable hashing for deduplication. Videos with identical content share the same storage reference. Use `--no-cache` to force regeneration:

```bash
promptfoo eval --no-cache
```

See the [Google Video example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-video) for complete configurations.

### Basic Configuration

The provider supports various configuration options that can be used to customize the behavior of the model:

```yaml
providers:
  - id: google:gemini-2.5-pro
    config:
      temperature: 0.7 # Controls randomness (0.0 to 1.0)
      maxOutputTokens: 2048 # Maximum length of response
      topP: 0.9 # Nucleus sampling
      topK: 40 # Top-k sampling
      stopSequences: ['END'] # Stop generation at these sequences
```

### Thinking Configuration

For models that support thinking capabilities, you can configure how the model reasons through problems.

#### Gemini 3 Models (thinkingLevel)

Gemini 3 models use `thinkingLevel` for more granular control:

```yaml
providers:
  - id: google:gemini-3-flash-preview
    config:
      generationConfig:
        thinkingConfig:
          thinkingLevel: MEDIUM # MINIMAL, LOW, MEDIUM, or HIGH
```

| Level   | Description                                                |
| ------- | ---------------------------------------------------------- |
| MINIMAL | Fewest tokens. Best for low-complexity tasks (Flash only). |
| LOW     | Fewer tokens. Suitable for simpler tasks.                  |
| MEDIUM  | Balanced approach for moderate complexity (Flash only).    |
| HIGH    | More tokens for deep reasoning. Default.                   |

#### Gemini 2.5 Models (thinkingBudget)

Gemini 2.5 models use `thinkingBudget`:

```yaml
providers:
  - id: google:gemini-2.5-flash
    config:
      generationConfig:
        temperature: 0.7
        maxOutputTokens: 2048
        thinkingConfig:
          thinkingBudget: 1024 # Controls tokens allocated for thinking process
```

The thinking configuration allows the model to show its reasoning process before providing the final answer, which can be helpful for complex tasks that require step-by-step thinking.

**Note:** You cannot use both `thinkingLevel` and `thinkingBudget` in the same request.

You can also specify a response schema for structured output:

```yaml
providers:
  - id: google:gemini-2.5-pro
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

When using images, place them on separate lines in your prompt. The `file://` prefix automatically handles loading and encoding:

```yaml
prompts: |
  {{imageFile}}
  Caption this image.

providers:
  - id: google:gemini-2.5-flash

tests:
  - vars:
      imageFile: file://assets/red-panda.jpg
```

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

### Role Mapping Configuration

Gemini models require specific role names in chat messages. By default, Promptfoo uses the `model` role for compatibility with newer Gemini versions (2.5+). For older Gemini versions that expect the `assistant` role, you can disable this:

```yaml
providers:
  # Default behavior - maps 'assistant' to 'model' (for Gemini 2.5+)
  - id: google:gemini-2.5-flash
    config:
      temperature: 0.7

  # For older Gemini versions - preserve 'assistant' role
  - id: google:gemini-2.5-pro
    config:
      useAssistantRole: true # Preserves 'assistant' role without mapping
      temperature: 0.7
```

For more details on capabilities and configuration options, see the [Gemini API documentation](https://ai.google.dev/docs).

## Model Examples

### Gemini 3 Flash Preview

Gemini 3.0 Flash with frontier intelligence, Pro-grade reasoning, and thinking capabilities:

```yaml
providers:
  - id: google:gemini-3-flash-preview
    config:
      temperature: 0.7
      maxOutputTokens: 4096
      generationConfig:
        thinkingConfig:
          thinkingLevel: MEDIUM # MINIMAL, LOW, MEDIUM, or HIGH
```

Thinking levels for Gemini 3 Flash: MINIMAL (fastest), LOW, MEDIUM (balanced), HIGH (most thorough).

### Gemini 3 Pro Preview

Gemini 3.0 Pro with advanced reasoning and agentic capabilities:

```yaml
providers:
  - id: google:gemini-3-pro-preview
    config:
      temperature: 0.7
      maxOutputTokens: 4096
      generationConfig:
        thinkingConfig:
          thinkingLevel: HIGH # LOW or HIGH (Pro only supports these two levels)
```

Thinking levels for Gemini 3 Pro: LOW (faster, simpler tasks), HIGH (deep reasoning, default).

### Gemini 2.5 Pro

Gemini 2.5 Pro model for complex reasoning, coding, and multimodal understanding:

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

Gemini 2.5 Flash model with enhanced reasoning and thinking capabilities:

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

Cost-efficient and fast model for high-volume, latency-sensitive tasks:

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

### Tool Calling

Google models support tool calling via the `tools` and `tool_config` config fields. The model returns tool calls in its response for your application to execute.

```yaml
providers:
  - id: google:gemini-2.5-pro
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
  - id: google:gemini-2.5-pro
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
  - id: google:gemini-2.5-pro
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
  - id: google:gemini-2.5-flash
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

For more details, see the [Google AI Studio documentation on Grounding with Google Search](https://ai.google.dev/docs/gemini_api/grounding).

### Code Execution

Code execution allows Gemini models to write and execute Python code to solve computational problems, perform calculations, and generate data visualizations.

#### Basic Usage

To enable code execution:

```yaml
providers:
  - id: google:gemini-2.5-flash-preview-05-20
    config:
      tools:
        - codeExecution: {}
```

#### Example Use Cases

Code execution is particularly valuable for:

- Mathematical computations and calculations
- Data analysis and visualization

For more details, see the [Google AI Studio documentation on Code Execution](https://ai.google.dev/gemini-api/docs/code-execution).

### URL Context

URL context allows Gemini models to extract and analyze content from web URLs, enabling them to understand and work with information from specific web pages.

#### Basic Usage

To enable URL context:

```yaml
providers:
  - id: google:gemini-2.5-flash
    config:
      tools:
        - urlContext: {}
```

#### Example Use Cases

URL context is particularly valuable for:

- Analyzing specific web page content
- Extracting information from documentation
- Comparing information across multiple URLs

For more details, see the [Google AI Studio documentation on URL Context](https://ai.google.dev/gemini-api/docs/url-context).

For complete working examples of the search grounding, code execution, and url context features, see the [google-aistudio-tools examples](https://github.com/promptfoo/promptfoo/tree/main/examples/google-aistudio-tools).

## Google Live API

Promptfoo now supports Google's WebSocket-based Live API, which enables low-latency bidirectional voice and video interactions with Gemini models. This API provides real-time interactive capabilities beyond what's available in the standard REST API.

### Using the Live Provider

Access the Google Live API by specifying the model with the 'live' service type:

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

The Google Live API supports function calling, allowing you to define tools that the model can use:

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

The Google Live API includes several built-in tools:

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

### Audio Generation

Evaluate audio generation with the Google Live provider:

1. Basic audio generation:

```yaml
providers:
  - id: 'google:live:gemini-2.0-flash-live-001'
    config:
      generationConfig:
        response_modalities: ['audio']
        outputAudioTranscription: {} # Enable transcription
      speechConfig:
        voiceConfig:
          prebuiltVoiceConfig:
            voiceName: 'Charon'
      timeoutMs: 30000
```

2. Specifying additional options, such as enabling affective dialog:

```yaml
providers:
  - id: 'google:live:gemini-2.5-flash-exp-native-audio-thinking-dialog'
    config:
      apiVersion: 'v1alpha' # Required for affective dialog
      generationConfig:
        response_modalities: ['audio']
        enableAffectiveDialog: true
```

Other configuration options are available, such as setting proactive audio, setting the language code, and more. Read more about sending and receiving audio for Gemini in the [Google Live API documentation](https://ai.google.dev/gemini-api/docs/live-guide#send-receive-audio).

### Getting Started

Try the examples:

```sh
# Basic text-only example
promptfoo init --example google-live

# Function calling and tools example
promptfoo init --example google-live-tools

# Audio generation example
promptfoo init --example google-live-audio
```

### Limitations

- Sessions are limited to 15 minutes for audio or 2 minutes of audio and video
- Token counting is not supported
- Rate limits of 3 concurrent sessions per API key apply
- Maximum of 4M tokens per minute

For more details, see the [Google Live API documentation](https://ai.google.dev/gemini-api/docs/live).

## See Also

- [Vertex AI Provider](/docs/providers/vertex) - For enterprise features and advanced Google AI capabilities
- [Google Examples](https://github.com/promptfoo/promptfoo/tree/main/examples) - Browse working examples for Google AI Studio
- [Gemini API Documentation](https://ai.google.dev/docs) - Official Google AI documentation
- [Configuration Reference](/docs/configuration/reference) - Complete configuration options for promptfoo
