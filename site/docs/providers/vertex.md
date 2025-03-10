# Google Vertex

The `vertex` provider enables integration with Google's [Vertex AI](https://cloud.google.com/vertex-ai) platform, which provides access to foundation models including Gemini, PaLM (Bison), Llama, Claude, and specialized models for text, code, and embeddings.

## Available Models

### Latest Gemini Models

- `vertex:gemini-2.0-flash-001` - Next-gen workhorse model for all daily tasks. Supports text, code, images, audio, video, video with audio, and PDF inputs.
- `vertex:gemini-2.0-pro-exp-02-05` - Strongest model quality, especially for code & world knowledge (2M context). Supports text, images, video, audio, and PDF inputs.
- `vertex:gemini-2.0-flash-lite-preview-02-05` - Cost-effective offering for high throughput. Supports text, images, video, audio, and PDF inputs.
- `vertex:gemini-2.0-flash-thinking-exp-01-21` - Enhanced reasoning with thinking process in responses. Supports text and images.
- `vertex:gemini-1.5-flash` - Speed and efficiency for high-volume applications. Supports text, code, images, audio, video, video with audio, and PDF inputs.
- `vertex:gemini-1.5-pro` - Long-context understanding and general-purpose use. Supports text, code, images, audio, video, video with audio, and PDF inputs.
- `vertex:gemini-1.5-pro-latest` - Latest Gemini 1.5 Pro model with same capabilities as gemini-1.5-pro
- `vertex:gemini-1.0-pro` - Best performing model for text-only tasks (deprecated)
- `vertex:gemini-1.0-pro-vision` - Best performing image and video understanding model (deprecated)

### Claude Models

Anthropic's Claude models are available with the following versions:

- `vertex:claude-3-haiku@20240307` - Fast Claude 3 Haiku
- `vertex:claude-3-sonnet@20240229` - Claude 3 Sonnet
- `vertex:claude-3-opus@20240229` - Claude 3 Opus (Public Preview)
- `vertex:claude-3-5-haiku@20241022` - Claude 3.5 Haiku
- `vertex:claude-3-5-sonnet-v2@20241022` - Claude 3.5 Sonnet

:::note
Claude models require explicit access enablement through the [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/publishers). Navigate to the Model Garden, search for "Claude", and enable the specific models you need.
:::

Note: Claude models support up to 200,000 tokens context length and include built-in safety features.

### Llama Models (Preview)

Meta's Llama models are available through Vertex AI with the following versions:

- `vertex:llama-3.3-70b-instruct-maas` - Latest Llama 3.3 70B model (Preview)
- `vertex:llama-3.2-90b-vision-instruct-maas` - Vision-capable Llama 3.2 90B (Preview)
- `vertex:llama-3.1-405b-instruct-maas` - Llama 3.1 405B (GA)
- `vertex:llama-3.1-70b-instruct-maas` - Llama 3.1 70B (Preview)
- `vertex:llama-3.1-8b-instruct-maas` - Llama 3.1 8B (Preview)

Note: Llama models support up to 128,000 tokens context length and include built-in safety features through Llama Guard.

#### Llama Configuration Example

```yaml
providers:
  - id: vertex:llama-3.3-70b-instruct-maas
    config:
      region: us-central1 # Llama models are only available in this region
      temperature: 0.7
      maxOutputTokens: 1024
      llamaConfig:
        safetySettings:
          enabled: true # Llama Guard is enabled by default
          llama_guard_settings: {} # Optional custom settings
```

By default, Llama models use Llama Guard for content safety. You can disable it by setting `enabled: false`, but this is not recommended for production use.

### Gemma Models (Open Models)

- `vertex:gemma` - Lightweight text model for generation and summarization
- `vertex:codegemma` - Code-specialized model for generation and completion
- `vertex:paligemma` - Vision-language model for image tasks

### PaLM 2 (Bison) Models

Please note the PaLM (Bison) models are [scheduled for deprecation (April 2025)](https://cloud.google.com/vertex-ai/generative-ai/docs/legacy/legacy-models) and it's recommended to migrate to the Gemini models.

- `vertex:chat-bison[@001|@002]` - Chat model
- `vertex:chat-bison-32k[@001|@002]` - Extended context chat
- `vertex:codechat-bison[@001|@002]` - Code-specialized chat
- `vertex:codechat-bison-32k[@001|@002]` - Extended context code chat
- `vertex:text-bison[@001|@002]` - Text completion
- `vertex:text-unicorn[@001]` - Specialized text model
- `vertex:code-bison[@001|@002]` - Code completion
- `vertex:code-bison-32k[@001|@002]` - Extended context code completion

### Embedding Models

- `vertex:textembedding-gecko@001` - Text embeddings (3,072 tokens, 768d)
- `vertex:textembedding-gecko@002` - Text embeddings (2,048 tokens, 768d)
- `vertex:textembedding-gecko@003` - Text embeddings (2,048 tokens, 768d)
- `vertex:text-embedding-004` - Latest text embeddings (2,048 tokens, ≤768d)
- `vertex:text-embedding-005` - Latest text embeddings (2,048 tokens, ≤768d)
- `vertex:textembedding-gecko-multilingual@001` - Multilingual embeddings (2,048 tokens, 768d)
- `vertex:text-multilingual-embedding-002` - Latest multilingual embeddings (2,048 tokens, ≤768d)
- `vertex:multimodalembedding` - Multimodal embeddings for text, image, and video

:::tip
If you're using Google AI Studio directly, see the [`google` provider](/docs/providers/google) documentation instead.
:::

## Setup and Authentication

### 1. Install Dependencies

Install Google's official auth client:

```sh
npm install google-auth-library
```

### 2. Enable API Access

1. Enable the [Vertex AI API](https://console.cloud.google.com/apis/enableflow?apiid=aiplatform.googleapis.com) in your Google Cloud project
2. For Claude models, request access through the [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/publishers) by:
   - Navigating to "Model Garden"
   - Searching for "Claude"
   - Clicking "Enable" on the models you want to use
3. Set your project in gcloud CLI:
   ```sh
   gcloud config set project PROJECT_ID
   ```

### 3. Authentication Methods

Choose one of these authentication methods:

1. User Account (recommended for development):

   ```sh
   # First, authenticate with Google Cloud
   gcloud auth login

   # Then, set up application default credentials
   gcloud auth application-default login
   ```

2. Service Account:

   - Option A: Use a machine with an authorized service account
   - Option B: Use service account credentials file:

     ```sh
     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
     ```

## Configuration

### Environment Variables

- `VERTEX_API_KEY` - GCloud API token (get via `gcloud auth print-access-token`)
- `VERTEX_PROJECT_ID` - GCloud project ID
- `VERTEX_REGION` - Region (defaults to `us-central1`)
- `VERTEX_PUBLISHER` - Model publisher (defaults to `google`)
- `VERTEX_API_HOST` - Override API host (e.g., for LLM proxy)
- `VERTEX_API_VERSION` - API version (defaults to `v1`)

### Provider Configuration

Configure model behavior using the following options:

```yaml
providers:
  # For Gemini models
  - id: vertex:gemini-2.0-pro
    config:
      generationConfig:
        temperature: 0
        maxOutputTokens: 1024
        topP: 0.8
        topK: 40

  # For Llama models
  - id: vertex:llama-3.3-70b-instruct-maas
    config:
      generationConfig:
        temperature: 0.7
        maxOutputTokens: 1024
        extra_body:
          google:
            model_safety_settings:
              enabled: true
              llama_guard_settings: {}

  # For Claude models
  - id: vertex:claude-3-5-sonnet-v2@20241022
    config:
      anthropic_version: 'vertex-2023-10-16'
      max_tokens: 1024
```

### Safety Settings

Control AI safety filters:

```yaml
- id: vertex:gemini-pro
  config:
    safetySettings:
      - category: HARM_CATEGORY_HARASSMENT
        threshold: BLOCK_ONLY_HIGH
      - category: HARM_CATEGORY_VIOLENCE
        threshold: BLOCK_MEDIUM_AND_ABOVE
```

See [Google's SafetySetting API documentation](https://ai.google.dev/api/generate-content#safetysetting) for details.

## Model-Specific Features

### Llama Model Features

- Support for text and vision tasks (Llama 3.2)
- Built-in safety with Llama Guard (enabled by default)
- Available in `us-central1` region
- Quota limits vary by model version (30-60 QPM)
- Maximum context length of 128,000 tokens
- Requires specific endpoint format for API calls
- Only supports unary (non-streaming) responses in promptfoo

#### Llama Model Considerations

- **Regional Availability**: Llama models are available only in `us-central1` region
- **Guard Integration**: All Llama models use Llama Guard for content safety by default
- **Specific Endpoint**: Uses a different API endpoint than other Vertex models
- **Model Status**: Most models are in Preview state, with Llama 3.1 405B being Generally Available (GA)
- **Vision Support**: Only Llama 3.2 90B supports image input

### Claude Model Features

- Support for text, code, and analysis tasks
- Tool use (function calling) capabilities
- Available in multiple regions (us-east5, europe-west1, asia-southeast1)
- Quota limits vary by model version (20-245 QPM)

## Advanced Usage

### Default Grading Provider

When Google credentials are configured (and no OpenAI/Anthropic keys are present), Vertex AI becomes the default provider for:

- Model grading
- Suggestions
- Dataset generation

Override grading providers using `defaultTest`:

```yaml
defaultTest:
  options:
    provider:
      # For llm-rubric and factuality assertions
      text: vertex:gemini-1.5-pro-002
      # For similarity comparisons
      embedding: vertex:embedding:text-embedding-004
```

### Configuration Reference

| Option                             | Description                        | Default                              |
| ---------------------------------- | ---------------------------------- | ------------------------------------ |
| `apiKey`                           | GCloud API token                   | None                                 |
| `apiHost`                          | API host override                  | `{region}-aiplatform.googleapis.com` |
| `apiVersion`                       | API version                        | `v1`                                 |
| `projectId`                        | GCloud project ID                  | None                                 |
| `region`                           | GCloud region                      | `us-central1`                        |
| `publisher`                        | Model publisher                    | `google`                             |
| `context`                          | Model context                      | None                                 |
| `examples`                         | Few-shot examples                  | None                                 |
| `safetySettings`                   | Content filtering                  | None                                 |
| `generationConfig.temperature`     | Randomness control                 | None                                 |
| `generationConfig.maxOutputTokens` | Max tokens to generate             | None                                 |
| `generationConfig.topP`            | Nucleus sampling                   | None                                 |
| `generationConfig.topK`            | Sampling diversity                 | None                                 |
| `generationConfig.stopSequences`   | Generation stop triggers           | `[]`                                 |
| `toolConfig`                       | Tool/function calling config       | None                                 |
| `systemInstruction`                | System prompt (supports `{{var}}`) | None                                 |

:::note
Not all models support all parameters. See [Google's documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/overview) for model-specific details.
:::

## Troubleshooting

### Authentication Errors

If you see an error like:

```
API call error: Error: {"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)","error_uri":"https://support.google.com/a/answer/9368756","error_subtype":"invalid_rapt"}
```

Re-authenticate using:

```sh
gcloud auth application-default login
```

### Claude Model Access Errors

If you encounter errors like:

```
API call error: Error: Project is not allowed to use Publisher Model `projects/.../publishers/anthropic/models/claude-*`
```

or

```
API call error: Error: Publisher Model is not servable in region us-central1
```

You need to:

1. Enable access to Claude models:

   - Visit the [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/publishers)
   - Search for "Claude"
   - Click "Enable" on the specific Claude models you want to use

2. Use a supported region. Claude models are only available in:
   - `us-east5`
   - `europe-west1`

Example configuration with correct region:

```yaml
providers:
  - id: vertex:claude-3-5-sonnet-v2@20241022
    config:
      region: us-east5 # or europe-west1
      anthropic_version: 'vertex-2023-10-16'
      max_tokens: 1024
```

## Model Features and Capabilities

### Function Calling and Tools

Gemini and Claude models support function calling and tool use. Configure tools in your provider:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      toolConfig:
        functionCallingConfig:
          mode: 'AUTO' # or "ANY", "NONE"
          allowedFunctionNames: ['get_weather', 'search_places']
      tools:
        - functionDeclarations:
            - name: 'get_weather'
              description: 'Get weather information'
              parameters:
                type: 'OBJECT'
                properties:
                  location:
                    type: 'STRING'
                    description: 'City name'
                required: ['location']
```

Tools can also be loaded from external files:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      tools: 'file://tools.json' # Supports variable substitution
```

### System Instructions

Configure system-level instructions for the model:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      systemInstruction:
        parts:
          - text: 'You are a helpful assistant that {{role}}' # Supports Nunjucks templates
```

### Generation Configuration

Fine-tune model behavior with these parameters:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      generationConfig:
        temperature: 0.7 # Controls randomness (0.0 to 1.0)
        maxOutputTokens: 1024 # Limit response length
        topP: 0.8 # Nucleus sampling
        topK: 40 # Top-k sampling
        stopSequences: ["\n"] # Stop generation at specific sequences
```

### Context and Examples

Provide context and few-shot examples:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      context: 'You are an expert in machine learning'
      examples:
        - input: 'What is regression?'
          output: 'Regression is a statistical method...'
```

### Safety Settings

Configure content filtering with granular control:

```yaml
providers:
  - id: vertex:gemini-2.0-pro
    config:
      safetySettings:
        - category: 'HARM_CATEGORY_HARASSMENT'
          threshold: 'BLOCK_ONLY_HIGH'
        - category: 'HARM_CATEGORY_HATE_SPEECH'
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        - category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
          threshold: 'BLOCK_LOW_AND_ABOVE'
```
