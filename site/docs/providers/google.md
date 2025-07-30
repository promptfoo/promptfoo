---
sidebar_label: Google AI / Gemini
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

Set the `GEMINI_API_KEY` or `GOOGLE_API_KEY` environment variable:

```bash
# Using export (Linux/macOS)
export GEMINI_API_KEY="your_api_key_here"
# or
export GOOGLE_API_KEY="your_api_key_here"

# Using set (Windows Command Prompt)
set GEMINI_API_KEY=your_api_key_here
# or
set GOOGLE_API_KEY=your_api_key_here

# Using $env (Windows PowerShell)
$env:GEMINI_API_KEY="your_api_key_here"
# or
$env:GOOGLE_API_KEY="your_api_key_here"
```

#### Option 2: .env File (Recommended for Development)

Create a `.env` file in your project root:

```bash
# .env
GEMINI_API_KEY=your_api_key_here
# or
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

**Note:** Avoid hardcoding API keys in configuration files that might be committed to version control. Use environment variable references instead:

```yaml
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
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
  - google:gemini-1.5-flash

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
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
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

| Google AI Studio          | Vertex AI                  | Notes                                   |
| ------------------------- | -------------------------- | --------------------------------------- |
| `google:gemini-2.5-flash` | `vertex:gemini-2.5-flash`  | Same model, different endpoint          |
| `GOOGLE_API_KEY`          | `VERTEX_PROJECT_ID` + auth | Vertex uses Google Cloud authentication |
| Simple API key            | Multiple auth methods      | Vertex supports ADC, service accounts   |
| Global endpoint           | Regional endpoints         | Vertex requires region selection        |

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

You can use it by specifying one of the [available models](https://ai.google.dev/models). Currently, the following models are supported:

## Available Models

### Chat and Multimodal Models

- `google:gemini-2.5-pro` - Latest stable Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Most cost-efficient and fastest 2.5 model yet, optimized for high-volume, latency-sensitive tasks
- `google:gemini-2.5-pro-preview-06-05` - Previous Gemini 2.5 Pro preview with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-pro-preview-05-06` - Previous Gemini 2.5 Pro preview with advanced thinking capabilities
- `google:gemini-2.5-flash` - Latest stable Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.0-pro` - Multimodal model with next-gen features, 1M token context window
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

### Image Generation Models

Imagen models are available through **Vertex AI only**. Use the `google:image:` prefix:

- `google:image:imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `google:image:imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `google:image:imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `google:image:imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-generate-001` - Imagen 3.0 ($0.04/image)
- `google:image:imagen-3.0-fast-generate-001` - Imagen 3.0 fast ($0.02/image)

:::warning
Imagen requires Vertex AI authentication via `gcloud auth application-default login` and a Google Cloud project with billing enabled.
:::

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

## Environment Variables

```yaml
# Reference environment variables in your config
providers:
  - id: google:gemini-2.5-flash
    config:
      apiKey: ${GEMINI_API_KEY}
      # or
      # apiKey: ${GOOGLE_API_KEY}
      temperature: ${TEMPERATURE:-0.7} # Default to 0.7 if not set
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
   promptfoo eval --
   ```
