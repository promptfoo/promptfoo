---
sidebar_label: Google AI / Gemini
description: Configure Google's Gemini models with support for text, image, audio, video, and PDF inputs through the Google AI Studio API for multimodal LLM testing
---

# Google AI / Gemini

The `google` provider calls Gemini and hosted Gemma models through Google AI Studio. Depending on the model, inputs can include text, images, audio, video, and PDFs.

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
  - id: google:gemini-3.8-flash
    config:
      apiKey: your_api_key_here
```

**Note:** Avoid hardcoding API keys in configuration files that might be committed to version control. The API key is automatically detected from the `GOOGLE_API_KEY` environment variable, so you typically don't need to specify it in the config.

If you need to explicitly reference an environment variable in your config, use Nunjucks template syntax:

```yaml
providers:
  - id: google:gemini-3.8-flash # Uses GOOGLE_API_KEY env var
    config:
      # apiKey: "{{ env.GOOGLE_API_KEY }}"  # optional, auto-detected
      maxOutputTokens: 1024
```

### 3. Verify Authentication

Test your setup with a simple prompt:

```bash
promptfoo eval --prompt "Hello, how are you?" --providers google:gemini-3.8-flash
```

## Configuration Options

In addition to authentication, you can configure:

- `GOOGLE_API_HOST` - Override the Google API host (defaults to `generativelanguage.googleapis.com`)
- `GOOGLE_API_BASE_URL` - Override the Google API base URL (defaults to `https://generativelanguage.googleapis.com`; a trailing slash is optional)

Example with custom host:

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      apiHost: custom.googleapis.com
      apiBaseUrl: https://custom.googleapis.com
```

For promptfoo's built-in cost estimates, Google providers also support `config.cost`,
`config.inputCost`, and `config.outputCost`. Use `inputCost` and `outputCost` for separate
prompt and completion pricing. The legacy `cost` option remains the shared fallback.

## Quick Start

### 1. Basic Evaluation

Create a simple `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - google:gemini-3.8-flash

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

Compare Gemini and Gemma models:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - google:gemma-4-31b-it
  - google:gemini-3.8-flash
  - google:gemini-3.1-pro-preview
  - google:gemini-3.5-flash-lite

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
  - id: google:gemini-3.8-flash # Uses GOOGLE_API_KEY env var
    config:
      # apiKey: "{{ env.GOOGLE_API_KEY }}"  # optional, auto-detected
      maxOutputTokens: '{{ env.MAX_OUTPUT_TOKENS | default(1024) }}'
```

## Troubleshooting

### Common Issues

#### 1. API Key Not Found

**Error**: `API key not found`

**Solution**: Ensure your API key is properly set:

```bash
# Check if the environment variable is set
test -n "${GOOGLE_API_KEY:-${GEMINI_API_KEY:-}}" && echo "API key is set" || echo "API key is missing"

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
  evaluateOptions:
    delay: 1000 # 1 second delay between API calls
  ```
- Upgrade your API quota in Google AI Studio
- Use a lower rate tier model like `gemini-3.5-flash-lite`

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
   google_api_key="${GOOGLE_API_KEY:-${GEMINI_API_KEY:-}}"
   curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=$google_api_key" \
     -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
   ```

3. **Check your environment**:
   ```bash
   # List Google and Gemini environment variable names
   env | cut -d= -f1 | grep -E '^(GOOGLE|GEMINI)_'
   ```

## Migration Guide

### Migrating from Google AI Studio to Vertex AI

If you need more advanced features or enterprise capabilities, you can migrate to Vertex AI:

| Google AI Studio               | Vertex AI                                   | Notes                                    |
| ------------------------------ | ------------------------------------------- | ---------------------------------------- |
| `google:gemini-4-argon`        | `vertex:gemini-4-argon`                     | Vertex supports `global`, `us`, and `eu` |
| `google:gemini-4-hydrogen`     | `vertex:gemini-4-hydrogen`                  | Vertex supports `global`, `us`, and `eu` |
| `google:gemini-3.8-flash`      | `vertex:gemini-3.8-flash`                   | Vertex supports `global`, `us`, and `eu` |
| `google:gemini-3.6-flash`      | `vertex:gemini-3.6-flash`                   | Vertex supports `global`, `us`, and `eu` |
| `google:gemini-3.5-flash-lite` | `vertex:gemini-3.5-flash-lite`              | Vertex supports `global`, `us`, and `eu` |
| `GOOGLE_API_KEY`               | `GOOGLE_CLOUD_PROJECT` + auth               | Vertex uses Google Cloud authentication  |
| Simple API key                 | Multiple auth methods                       | Vertex supports ADC, service accounts    |
| Global endpoint                | Global, regional, or multi-region endpoints | Availability depends on the model        |

Example migration:

```yaml
# Before (Google AI Studio)
providers:
  - google:gemini-3.8-flash
```

```yaml
# After (Vertex AI)
providers:
  - id: vertex:gemini-3.8-flash
    config:
      expressMode: false
      projectId: my-project-id
      region: global
```

See the [Vertex AI provider documentation](/docs/providers/vertex) for detailed setup instructions.

## API coverage

A model ID selects a provider route; it does not enable every operation offered by Google. Support also depends on the chosen model and account:

| API path or capability                                        | Promptfoo support                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateContent`                                             | Chat, multimodal input, structured output, thinking, tools, and [speech output](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation) |
| `embedContent`                                                | Text strings through `google:embedding:`; multimodal embedding inputs are not exposed                                                                     |
| Live WebSocket API                                            | Finite text/audio eval sessions, transcripts, and function callbacks through `google:live:`                                                               |
| Interactions API                                              | File transcription, Gemini 4 Argon and Hydrogen, Gemini Omni video, and Gemini Robotics ER                                                                |
| [Decisions API](#gemini-decisions-api)                        | Yes/no probabilities, classifications, and ordered scores through `google:decisions:gemini-decision-1`                                                    |
| Video generation                                              | Gemini Omni uses Interactions (`google:gemini-omni-1.1-flash`). For Veo, use the Vertex long-running prediction API (`vertex:video:`).                    |
| Native Gemini images                                          | Model-specific image provider; the legacy `google:image:` prefix instead selects Imagen's prediction format                                               |
| Cached content                                                | Reference an existing cache with `passthrough.cachedContent`; cache creation and deletion are not provided                                                |
| File management, Batch jobs, token counting, voice management | No dedicated provider operations; supplying an existing file URI or voice does not upload a file or create a voice                                        |
| Lyria music                                                   | No dedicated adapters                                                                                                                                     |

Use a [custom provider](/docs/providers/custom-api) when you need an operation or response format outside these routes. `passthrough` adds request fields to an existing route; it does not change the API protocol. Consult the [Gemini API reference](https://ai.google.dev/api) for upstream capabilities.

### Gemini Decisions API

Use `google:decisions:gemini-decision-1` with a Gemini Developer API key (`GOOGLE_API_KEY` or `GEMINI_API_KEY`). Each rendered prompt becomes the shared input for up to 1,000 questions in `config.questions`. Promptfoo returns the answers as an object keyed by question ID, so JavaScript assertions can read each answer directly.

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{inspection}}'

providers:
  - id: google:decisions:gemini-decision-1
    config:
      questions:
        damaged:
          type: noul
          instructions: Does the inspection report describe physical damage to the product?

tests:
  - vars:
      inspection: The camera lens is cracked.
    assert:
      - type: javascript
        value: output.damaged.noul > 0.8
```

| Question type | Criteria                                            | Answer fields                                                                                                       |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `noul`        | Optional `true_description` and `false_description` | `noul` is the probability of yes, from 0.01 to 0.99.                                                                |
| `choice`      | Map of 2–255 option keys to descriptions            | `choice` is the selected key. `probabilities` gives the probability of each option.                                 |
| `score`       | Array of 2–255 descriptions, lowest level first     | `score` is the probability-weighted average of the zero-based level indices. `legend` maps indices to descriptions. |

Every answer includes `confidence`. A score also includes its per-level `probabilities`. To evaluate all three question types in one request, run the [product inspection example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-decisions).

For multimodal input, use a prompt containing JSON-encoded native content blocks. Supply image, audio, video, or PDF content as base64 `data` or a supported `uri`, with the corresponding `mime_type`.

```yaml
prompts:
  - |
    [
      {"type": "text", "text": "Photo from the product inspection."},
      {"type": "image", "uri": "{{photoUrl}}", "mime_type": "image/jpeg"}
    ]
```

Use a Gemini Files API URI or a publicly accessible or signed HTTPS URL for `photoUrl`. To send a local image instead, set `"data": "{{photo}}"` and load the var with `file://photo.jpg`; promptfoo sends the image as base64 and uses its MIME type when `mime_type` is omitted. For supported media formats and request limits, see [Google's Decisions API guide](https://aistudio.google.com/docs/decisions-api).

#### Grade another provider's output

To evaluate text output, select Gemini Decisions as the provider for an `llm-rubric` or `classifier` assertion. Promptfoo uses the output under test as input and builds the question from the assertion.

```yaml
assert:
  - type: llm-rubric
    value: The support reply offers a replacement for the damaged camera.
    provider: google:decisions:gemini-decision-1
  - type: classifier
    value: replacement
    threshold: 0.8
    provider:
      id: google:decisions:gemini-decision-1
      config:
        instructions: What remedy does the support reply offer?
        labels:
          replacement: Sends a new camera
          refund: Returns the purchase price
          other: Offers another remedy or no remedy
```

To run the same text-grading assertions with TypeSafe Jev or OpenAI Decisions, change the provider ID to `typesafe:jev-1.13.0` or `openai:decisions:gpt-6-luna` and supply that provider's API key.

- `llm-rubric` reads the rubric and output directly and ignores `rubricPrompt`. It uses the yes probability as its score. For a scored rubric that works with all three providers, supply 2–10 string descriptions in `config.levels`, ordered from lowest to highest. Promptfoo divides the returned score by the highest level index. The provider's `config.threshold` defaults to `0.5` for either rubric.
- `classifier` accepts `config.instructions` and `config.labels`. Use a list of label strings or a map of labels to descriptions. Use `null` for a label that needs no description. The assertion compares the probability of its requested label with its own `threshold`.

For direct evaluations, Gemini and Jev use question IDs as keys in both `config.questions` and `output`, with question types `noul`, `choice`, and `score`. OpenAI takes an ordered question list, calls its yes/no question a `predicate`, and exposes the ordered answers through `JSON.parse(output).answers`. Each API has its own criteria format. See the [TypeSafe Jev provider](./typesafe.md) and [OpenAI Decisions provider](./openai-decisions.md) for examples.

## Available Models

Lyria music generation is not currently supported by promptfoo's Google providers.

Use distinct serving models when comparing results. Google can redirect a Gemini API model ID to its replacement. Check the [Gemini API lifecycle](https://ai.google.dev/gemini-api/docs/deprecations) before choosing an older ID.

### Chat and Multimodal Models

- `google:gemma-4-31b-it` - Gemma 4 31B instruction-tuned open model with strong reasoning, coding, and agentic capabilities
- `google:gemma-4-26b-a4b-it` - Gemma 4 26B A4B instruction-tuned open model for lower-latency reasoning and coding evals
- `google:gemini-4-argon` - [Gemini 4 Argon](#gemini-4), Google's flagship reasoning model for complex coding, knowledge work, and agentic workflows ($2/1M input, $10/1M output through November 30, 2026)
- `google:gemini-4-hydrogen` - [Gemini 4 Hydrogen](#gemini-4), a fast Gemini 4 model for everyday coding, agentic workflows, multimodal analysis, and tool use ($1.50/1M input, $7.50/1M output)
- `google:gemini-3.8-flash` - Latest Gemini Flash model for coding and agentic workflows ($0.75/1M input, $3.75/1M output through December 31, 2026)
- `google:gemini-3.6-flash` - Previous-generation Gemini Flash model for coding and agentic tasks ($0.75/1M input, $3.75/1M output through December 31, 2026)
- `google:gemini-3.5-flash-lite` - Fast, cost-efficient Gemini 3.5 model for high-volume agentic workflows ($0.30/1M input, $2.50/1M output)
- `google:live:gemini-3.5-live-translate-preview` - Gemini 3.5 Live Translate for real-time audio-to-audio translation with text transcripts ($3.50/1M audio input, $21/1M audio output)
- `google:gemini-omni-1.1-flash` - Gemini Omni Flash for conversational video generation and editing via the Interactions API
- `google:gemini-3.1-pro-preview` - Gemini 3.1 Pro preview with improved reasoning and performance ($2/1M input, $12/1M output; $4/$18 above 200K)
- `google:gemini-3.1-pro-preview-customtools` - Gemini 3.1 Pro preview variant for custom tools with the same pricing as Gemini 3.1 Pro
- `google:gemini-3.1-flash-lite` - Gemini 3.1 Flash-Lite GA model optimized for high-volume, low-latency tasks ($0.25/1M text/image/video input, $1.50/1M output)
- `google:live:gemini-3.5-transcribe-live` - Speech-to-text transcription for streamed audio
- `google:live:gemini-3.8-live` - Gemini 3.8 Live for low-latency voice dialogue
- `google:live:gemini-3.8-live-extended-thinking` - Gemini 3.8 Live with background reasoning and asynchronous tools
- `google:gemini-3-flash-preview` - Gemini 3.0 Flash preview with frontier intelligence, Pro-grade reasoning at Flash-level speed, thinking, and grounding ($0.50/1M input, $3/1M output)
- `google:gemini-2.5-pro` - Gemini 2.5 Pro model with enhanced reasoning, coding, and multimodal understanding
- `google:gemini-2.5-flash` - Gemini 2.5 Flash model with enhanced reasoning and thinking capabilities
- `google:gemini-2.5-flash-lite` - Cost-efficient Gemini 2.5 model optimized for high-volume, latency-sensitive tasks
- `google:gemini-3.8-flash-tts` and `google:gemini-3.8-flash-lite-tts` - [Text-to-speech generation](#text-to-speech)
- `google:gemini-pro-latest` - Google-maintained alias for the latest Gemini Pro release (currently Gemini 3.1 Pro pricing)
- `google:gemini-flash-latest` - Google-maintained alias for the current Gemini Flash release ($0.75/1M input, $3.75/1M output through December 31, 2026)
- `google:gemini-flash-lite-latest` - Google-maintained alias for the latest Gemini Flash-Lite release (currently Gemini 3.5 Flash-Lite pricing)

For current token prices, cache charges, and introductory offers, see [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, and 3.5 Flash-Lite ignore the deprecated `temperature`,
`topP`, and `topK` sampling controls. Promptfoo removes these parameters automatically.
Use `thinkingLevel` to configure reasoning instead:

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      generationConfig:
        maxOutputTokens: 4096
        thinkingConfig:
          thinkingLevel: MEDIUM

  - id: google:gemini-3.5-flash-lite
    config:
      generationConfig:
        thinkingConfig:
          thinkingLevel: LOW
```

Gemini 3.8 Flash and 3.7 Flash support `LOW`, `MEDIUM` (default), and `HIGH`
thinking levels. They do not support `MINIMAL` or the legacy `thinkingBudget`
setting; promptfoo rejects those settings before sending a request.

:::note Gemini 3.8 Flash Cyber

Google documents [`gemini-3.8-flash-cyber` on Vertex](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash-cyber) for allowlisted Fairwind customers. Use `vertex:gemini-3.8-flash-cyber` with an authorized project; it defaults to `global` and also supports `region: us`. The public Flash introductory discount does not apply. This model supports structured output and thinking, but not function calling, grounding, code execution, Interactions, or Live. Availability on Vertex does not imply access through the Gemini API. See [Vertex pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing).

:::

:::note Gemini 2.5 lifecycle

On December 1, 2026, the Gemini API redirects `gemini-2.5-pro` to `gemini-3.8-flash` and `gemini-2.5-flash` to `gemini-3.5-flash-lite`. Use the replacement ID directly for new evaluations. Promptfoo applies the serving model’s generation controls and pricing when an ID redirects. `gemini-2.5-flash-lite` has a separate lifecycle. [Gemini API release notes](https://ai.google.dev/gemini-api/docs/changelog#11-02-2026) · [Vertex AI model lifecycle](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions)

:::

This list describes current endpoints. Promptfoo may retain pricing for retired model IDs so saved
evaluations can still be scored; historical pricing data does not mean that Google still serves an
endpoint. Check Google's [model lifecycle page](https://ai.google.dev/gemini-api/docs/deprecations)
before starting new work with an older ID.

Google has announced May 7, 2027 as the earliest shutdown date for `gemini-3.1-flash-lite` and
recommends `gemini-3.5-flash-lite` as its replacement. For Gemini 3.6 Flash and 3.5 Flash-Lite,
Google documents a 1M-token input context, 64K maximum output, multimodal input, and its full set of
built-in tools. Remove the deprecated `temperature`, `top_p`, and `top_k` sampling controls when
migrating an existing configuration. See Google's
[latest-model migration guide](https://ai.google.dev/gemini-api/docs/latest-model) for the complete
behavior changes.

:::note
Gemini 3.5 Flash Cyber is currently available only through Google's limited-access CodeMender pilot and does not have a publicly documented Gemini API model ID. See the [Gemini model announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-6-flash-3-5-flash-lite-3-5-flash-cyber/).
:::

### Gemini 4

[Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon) and [Gemini 4 Hydrogen](https://ai.google.dev/gemini-api/docs/models/gemini-4-hydrogen) accept text, image, video, audio, and PDF input and return text. Input, thinking, and output share a 1,048,576-token context window.

| Model                      | Thinking levels                            | Price per 1M input / output tokens                | Free tier |
| -------------------------- | ------------------------------------------ | ------------------------------------------------- | --------- |
| `google:gemini-4-argon`    | `LOW`, `MEDIUM` (default), `HIGH`          | $2 / $10 through November 30, 2026, then $4 / $20 | No        |
| `google:gemini-4-hydrogen` | `LOW`, `MEDIUM`, `HIGH` (default), `XHIGH` | $1.50 / $7.50                                     | Yes       |

Output prices include thinking. Implicitly cached input costs 5% of the input rate, Priority requests cost 1.8 times the standard rate, and Flex requests cost half. Promptfoo uses these [rates](https://ai.google.dev/gemini-api/docs/pricing) in its cost estimates.

```yaml
providers:
  - id: google:gemini-4-hydrogen
    config:
      generationConfig:
        thinkingConfig:
          thinkingLevel: XHIGH
```

Gemini 4 models ignore `temperature`, `topP`, and `topK`, and the Gemini API rejects penalties and multiple candidates, so promptfoo removes these parameters. Promptfoo also rejects `MINIMAL` thinking and `thinkingBudget` before sending a `google:` request.

`maxOutputTokens` limits thinking and the answer together, so a low limit can end a response with `MAX_TOKENS` before any answer text is produced. For Argon, Google recommends raising limits below 32,768 to at least 32,768 and a client timeout of at least 15 minutes for `HIGH` thinking, which you can set with `REQUEST_TIMEOUT_MS=900000`.

Gemini 4 models support implicit caching only, so do not set `cachedContent`. They do not support the Live API or audio and image output. To call them through the Interactions API, use `google:interactions:gemini-4-argon` or `google:interactions:gemini-4-hydrogen`. Promptfoo sends synchronous Interactions requests, so background execution and long decoding beyond 65,536 output tokens are not available.

For Vertex AI, including the allowlisted Argon Cyber Permissive variant, see [Vertex Gemini models](/docs/providers/vertex#gemini-models).

### Text-to-speech

Use `google:gemini-3.8-flash-tts` or `google:gemini-3.8-flash-lite-tts` for speech generation. Both default to audio output with the Kore voice. Unary responses return WAV audio unchanged in `providerResponse.audio`; streamed PCM is assembled into WAV. Use `config.streaming: true` to select `streamGenerateContent`.

Gemini 3.8 TTS reads text verbatim. Put delivery instructions in native Gemini `speechMetadata` parts instead of asking the model to "say cheerfully" in the transcript:

```yaml
providers:
  - id: google:gemini-3.8-flash-lite-tts
    config:
      generationConfig:
        speechConfig:
          voiceConfig:
            voice: Kore
prompts:
  - '[{"role":"user","parts":[{"text":"Have a wonderful day!","speechMetadata":{"style":"cheerful and friendly"}}]}]'
```

For two speakers on the Gemini API, set `generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs` to a list of `{speaker, voiceConfig: {prebuiltVoiceConfig: {voiceName}}}` objects. Vertex uses `{speaker, voiceConfig: {voice}}`. Include the matching `speechMetadata.speaker` on each text part. For a single speaker, `voiceConfig.voice` also accepts an existing stored voice ID; creating or replicating voices is outside this provider's scope. See the [GenerateContent speech guide](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation) and [Vertex speech guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/text-to-speech/overview).

The older 2.5 and 3.1 TTS previews have an earliest announced shutdown date of November 17, 2026. Check the [model lifecycle page](https://ai.google.dev/gemini-api/docs/deprecations) before using them. Promptfoo's [cost estimates](https://ai.google.dev/gemini-api/docs/pricing) include the announced introductory discount through December 31, 2026 and the subsequent standard rates.

### Embedding Models

Use `google:embedding:<model-id>` (or `google:embeddings:<model-id>`) to embed text with the Gemini API. For a similarity assertion:

```yaml
assert:
  - type: similar
    value: The package has shipped.
    provider: google:embedding:gemini-embedding-2
```

Set `config.outputDimensionality` to request a shorter vector. For Gemini Embedding 2, put task instructions and document titles in the input text. For `gemini-embedding-001`, set `taskType` in the provider config and use `title` with `RETRIEVAL_DOCUMENT`. Re-embed stored vectors when switching between these models because they use different embedding spaces.

See Google's [embedding guide](https://ai.google.dev/gemini-api/docs/embeddings) for supported dimensions, task instructions, and normalization, and the [model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations#embedding-models) for model availability. For Google Cloud credentials, see [Vertex embedding models](/docs/providers/vertex#embedding-models).

### Image Generation Models

The `google:image:` prefix selects the legacy Imagen prediction API. For a new image eval, use a [Gemini native image generation model](#gemini-native-image-generation-models).

#### Imagen 4 Models {#imagen-4-models-available-in-both-google-ai-studio-and-vertex-ai}

Google retired Imagen 4. To migrate an existing config, replace the entire Imagen provider ID with `google:gemini-nano-banana-2.1`. Gemini uses `generateContent`, returns image content parts and accepts different generation controls. [Google's Imagen migration guide](https://ai.google.dev/gemini-api/docs/imagen)

#### Imagen 3 Models (Vertex AI only)

Google discontinued the Vertex Imagen 3 generation models. Choose an image model and location from the [Vertex model catalog](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models).

#### Authentication Options

For the Gemini Developer API, set `GOOGLE_API_KEY` and `config.vertexai: false`. For Vertex, use a Google Cloud project and [Vertex authentication](/docs/providers/vertex#setup-and-authentication).

### Gemini Native Image Generation Models

Use the model's ID directly after `google:`. A response can contain both text and images, so inspect `providerResponse.images` to grade generated images. The [image generation guide](https://ai.google.dev/gemini-api/docs/image-generation) lists model IDs, input formats, resolutions and supported tools.

```yaml
providers:
  - id: google:gemini-nano-banana-2.1
    config:
      imageAspectRatio: '16:9'
      imageSize: '2K'
```

For `google:gemini-3.1-flash-image` on Vertex with project-based OAuth, choose `region: eu` or `region: us` for a multi-region endpoint, or omit the location to use the global default. Promptfoo estimates image, text and cache costs at the selected location's rates. See the [Vertex model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image) and [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing).

Nano Banana 2.1, Pro Image and Flash-Lite Image support only the global Vertex endpoint. With project-based OAuth, they use it even when the project has a regional environment default. Setting a different `config.region` on one of these providers returns an error before the request.

The [runnable image examples](https://github.com/promptfoo/promptfoo/tree/main/examples/google-imagen) include a Gemini API configuration, a Search-grounded generation and a Vertex multi-region call.

### File transcription

Use `google:gemini-3.5-transcribe` to transcribe an audio file through the Gemini Interactions API. Upload your audio with Google's Files API, then pass its URI in the prompt. The output is the transcript text. Word timestamps and speaker labels, when requested, are available in `metadata.annotations`. [Google transcription guide](https://ai.google.dev/gemini-api/docs/transcribe)

```yaml
providers:
  - google:gemini-3.5-transcribe

prompts:
  - '[{"type":"file","file_uri":"{{audioUri}}"}]'

tests:
  - vars:
      audioUri: 'https://generativelanguage.googleapis.com/v1beta/files/YOUR_FILE_ID'
```

Set `config.passthrough.generation_config.transcription_config` to pass Google's transcription options, such as `language_codes`. For Vertex AI, use `vertex:gemini-3.5-transcribe` with a Vertex audio prompt.

### Video Generation Models (Gemini Omni Flash)

Use `google:gemini-omni-1.1-flash` to generate video through the Gemini Interactions API. The Gemini API retired `gemini-omni-flash-preview`. Vertex AI has a separate model ID, `vertex:gemini-omni-1.1-flash-preview`; set `region: global` and use your Vertex project credentials. [Gemini Omni model card](https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash) · [Vertex Omni model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-1-flash)

```yaml
providers:
  - google:gemini-omni-1.1-flash

prompts:
  - 'Generate a short video of autumn leaves floating down a stream.'
```

Promptfoo stores the generated video in blob storage. To edit it in a later Gemini API request, set `store: true` on the first request and pass the returned `metadata.interactionId` as `previousInteractionId` on the next. Vertex supports single requests through this adapter. [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-omni-1.1-flash)

### Gemini Robotics ER

Gemini Robotics ER 2 has separate standard and streaming endpoints. Both accept text, image, video,
and audio input with 131,072 input tokens and 65,536 output tokens, but they expose different
capabilities:

| Promptfoo provider                                   | API          | Output | Supported model capabilities                                                          |
| ---------------------------------------------------- | ------------ | ------ | ------------------------------------------------------------------------------------- |
| `google:gemini-robotics-er-2-preview`                | Interactions | Text   | Caching, batch, code execution, file search, Maps/Search grounding, JSON, URL context |
| `google:live:gemini-robotics-er-2-streaming-preview` | Live         | Text   | Real-time streaming, function calling, Search grounding, thinking                     |

Promptfoo automatically routes the standard ID to the Interactions API. Managed Interactions-native
tools can be supplied through `passthrough.tools`:

```yaml
providers:
  - id: google:gemini-robotics-er-2-preview
    config:
      passthrough:
        tools:
          - type: google_search

prompts:
  - 'Locate the requested objects and return normalized [y, x] coordinates.'
```

Promptfoo does not currently execute custom function or computer-use tools for the Interactions
route because those calls require a follow-up `requires_action` exchange. Tools with `type: function`
or `type: computer_use` are rejected instead of returning an incomplete result; managed tools such
as `google_search` remain supported.

The standard endpoint costs $2/1M input tokens and $10/1M output tokens, including thinking. Cached
input is $0.20/1M; batch processing is $1/1M input, $5/1M output, and $0.10/1M cached input. The
streaming endpoint costs $2/1M input and $10/1M output and does not support caching or batch.

:::warning
Google retired `gemini-robotics-er-1.6-preview` on August 31, 2026. Replace it with
`gemini-robotics-er-2-preview`, or use `google:live:gemini-robotics-er-2-streaming-preview` for
low-latency streaming. `gemini-robotics-er-1.5-preview` shut down on April 30, 2026.
:::

See Google's [Gemini Robotics ER documentation](https://ai.google.dev/gemini-api/docs/robotics-overview)
for capability details and safety guidance.

### Video Generation Models (Veo)

The Gemini Developer API retired the Veo preview models. Use `google:gemini-omni-1.1-flash` for video generation through the Interactions API, or use Veo on Vertex AI. [Google’s video migration guide](https://ai.google.dev/gemini-api/docs/video)

#### Available Models

Choose a Veo model ID from the [Vertex model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate). Use the model's supported region and check [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) for the resolution you select.

#### Basic Usage

```yaml
providers:
  - id: vertex:video:veo-3.1-generate-001
    config:
      region: us-central1
      durationSeconds: 4
```

Use Application Default Credentials and set `GOOGLE_CLOUD_PROJECT` to your project. See the [runnable Veo examples](https://github.com/promptfoo/promptfoo/tree/main/examples/google-video) for complete configs.

#### Configuration Options

Set `durationSeconds`, `resolution`, and `aspectRatio` in the provider's `config`. Supported combinations vary by model and generation mode.

#### Image-to-Video Generation

Use `image: file://start.jpg` to animate a starting frame. The [image-to-video example](https://github.com/promptfoo/promptfoo/blob/main/examples/google-video/promptfooconfig-image.yaml) includes an image.

#### Video Interpolation (First and Last Frame)

Set `image` and `lastImage` to the first and last frame, and use the prompt to describe the transition.

#### Video Extension (Veo 3.1 Only)

Set `sourceVideo` to an MP4 previously generated by Veo. Vertex accepts a local `file://` path, base64 video bytes, or a `gs://` URI. Promptfoo reports the extension length in `metadata.extensionSeconds`. See the [Vertex extension example](/docs/providers/vertex#video-extension).

#### Reference Images

For models that support asset references, set `referenceImages` to a list of image file paths and use an eight-second duration. The model card lists supported counts and reference types.

#### Storage

Generated videos are available in the eval viewer. To write the original to Cloud Storage, set `storageUri` to a writable `gs://bucket/prefix/` and use the response's `metadata.sourceVideoUri` to extend it later.

<a id="gemini-20-flash"></a>

### Basic Configuration

The provider supports various configuration options that can be used to customize the behavior of the model:

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      maxOutputTokens: 2048 # Maximum length of response
      stopSequences: ['END'] # Stop generation at these sequences
```

### Thinking Configuration

For models that support thinking capabilities, you can configure how the model reasons through problems.

#### Gemini 3 Models (thinkingLevel)

Gemini 3 chat models use `thinkingLevel`. The examples and table below cover chat models; supported levels and defaults are [model-specific](https://ai.google.dev/gemini-api/docs/generate-content/thinking#thinking-levels):

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      generationConfig:
        thinkingConfig:
          thinkingLevel: MEDIUM # LOW, MEDIUM, or HIGH
```

| Level   | Description                                                                       |
| ------- | --------------------------------------------------------------------------------- |
| MINIMAL | Fewest tokens. Unsupported by Gemini 4, Gemini 3.1 Pro, or 3.8 Flash and aliases. |
| LOW     | Fewer tokens. Suitable for simpler tasks.                                         |
| MEDIUM  | Balanced approach for moderate complexity.                                        |
| HIGH    | More tokens for deep reasoning.                                                   |
| XHIGH   | Most tokens for the hardest problems. Supported only by Gemini 4 Hydrogen.        |

Defaults vary by model: Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, and 3.5 Flash default to `MEDIUM`, Gemini 3.5 Flash-Lite defaults to `MINIMAL`, and Gemini 3.1 Pro defaults to `HIGH`.

#### Gemini 2.5 Models (thinkingBudget)

For Gemini 2.5 models that still serve natively, use `generationConfig.thinkingConfig.thinkingBudget`. When migrating to a Gemini 3 replacement, use its supported `thinkingLevel` instead. See [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking). To return JSON with a specific shape, see [Structured Output](#structured-output).

For multimodal inputs, the provider supports:

- Images: PNG, JPEG, WEBP, HEIC, HEIF formats (max 3,600 files)
- Videos: MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP formats (up to ~1 hour)
- Audio: WAV, MP3, AIFF/AIFC, AAC, OGG, FLAC, and M4A formats
- PDF: use a native Gemini `inlineData` or `fileData` part

Image, audio, and video inputs loaded with `file://` are converted to Gemini inline data. For large inputs, use a native `fileData` part instead.

:::note
SVG, GIF, BMP, TIFF, and ICO images are unsupported. Ogg/Theora and Matroska are not among Gemini's [supported video formats](https://ai.google.dev/gemini-api/docs/video-understanding#supported-video-formats), and WMA audio is unsupported. Promptfoo leaves unsupported media variables as text instead of sending invalid inline data. Convert unsupported images to PNG or JPEG, video to MP4 or WEBM, and audio to WAV or MP3 before evaluation; OGG audio is supported.
:::

When using images, place them on separate lines in your prompt. The `file://` prefix automatically handles loading and encoding:

```yaml
prompts: |
  {{imageFile}}
  Caption this image.

providers:
  - id: google:gemini-3.8-flash

tests:
  - vars:
      imageFile: file://assets/red-panda.jpg
```

Native Gemini prompts can reference previously uploaded files directly. This is useful for PDFs or larger audio and video inputs:

```yaml
prompts:
  - |
    [
      {
        "role": "user",
        "parts": [
          {"fileData": {"mimeType": "application/pdf", "fileUri": "https://generativelanguage.googleapis.com/v1beta/files/example"}},
          {"text": "Summarize this document."}
        ]
      }
    ]

providers:
  - id: google:gemini-3.6-flash
```

### Safety Settings

Safety settings can be configured to control content filtering:

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      safetySettings:
        - category: HARM_CATEGORY_DANGEROUS_CONTENT
          threshold: BLOCK_ONLY_HIGH # or other thresholds
```

### System Instructions

Configure system-level instructions for the model:

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      systemInstruction: 'You are a helpful assistant'
      # To load from a file instead, use:
      # systemInstruction: file://system-instruction.txt
```

System instructions support Nunjucks templates and can be loaded from a file.

### Role Mapping Configuration

The Gemini API uses the `model` role for assistant messages. Promptfoo maps `assistant` to `model` automatically:

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      useAssistantRole: false # Default: maps 'assistant' to 'model'
```

Set `useAssistantRole: true` only for a custom endpoint that explicitly accepts the `assistant` role; it does not match the Gemini API role contract.

For more details on capabilities and configuration options, see the [Gemini API documentation](https://ai.google.dev/docs).

## Model Examples

### Gemini 3.8 Flash

The latest stable Flash model, released September 2, 2026, supports a 1M-token context window and `LOW`, `MEDIUM` (default), or `HIGH` thinking. `MINIMAL` and `thinkingBudget` are unsupported. [Model details](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      maxOutputTokens: 4096
      generationConfig:
        thinkingConfig:
          thinkingLevel: MEDIUM
```

The Gemini API redirects `gemini-3.7-flash` to this model. Use `gemini-3.8-flash` directly for new configurations.

### Gemini 3.6 Flash

A previous-generation Flash model for agentic and coding workloads with a 1M-token context window:

```yaml
providers:
  - id: google:gemini-3.6-flash
    config:
      maxOutputTokens: 4096
      generationConfig:
        thinkingConfig:
          thinkingLevel: MEDIUM # MINIMAL, LOW, MEDIUM (default), or HIGH
```

### Gemini 3.5 Flash-Lite

A high-throughput model for lower-latency agentic tasks and document processing:

```yaml
providers:
  - id: google:gemini-3.5-flash-lite
    config:
      maxOutputTokens: 4096
      generationConfig:
        thinkingConfig:
          thinkingLevel: MINIMAL # MINIMAL (default), LOW, MEDIUM, or HIGH
```

Both models ignore `temperature`, `topP`, and `topK` and reject frequency or presence penalties and multiple candidates. Promptfoo omits those unsupported generation fields when sending requests. Gemini 3.5 Flash-Lite defaults to `MINIMAL`; use `MEDIUM` or `HIGH` for multi-step tool use. Prompts must not end with a prefilled `model` turn, and function responses should preserve the matching function-call `name` and `id` when one is returned. See Google's [latest-model migration guide](https://ai.google.dev/gemini-api/docs/generate-content/latest-model).

Both models accept text, image, audio, video, and PDF inputs and support structured output, function calling, code execution, Search and Maps grounding, URL context, File Search, context caching, and standard/Flex/Priority inference. Computer Use is available in preview; Google recommends Gemini 3.8 Flash and also supports Gemini 3.5 Flash-Lite. Neither model generates images or audio, nor supports the Live API.

#### Inference tiers and cached-token pricing

Set `service_tier` to select standard, Flex, or Priority inference. Promptfoo includes cached input and reasoning tokens in its cost estimate; Google bills reasoning as output tokens. When Google reports that a Priority request was processed at the standard tier, `metadata.serviceTier` reflects the actual tier and cost estimates use standard pricing.

```yaml
providers:
  - id: google:gemini-3.6-flash
    config:
      service_tier: priority # standard, flex, or priority
      generationConfig:
        maxOutputTokens: 4096
        thinkingConfig:
          thinkingLevel: MEDIUM
```

| Model                        | Tier     | Input / 1M | Output and reasoning / 1M | Cached input / 1M |
| ---------------------------- | -------- | ---------: | ------------------------: | ----------------: |
| Gemini 3.8 / 3.7 / 3.6 Flash | Standard |      $0.75 |                     $3.75 |            $0.075 |
| Gemini 3.8 / 3.7 / 3.6 Flash | Flex     |     $0.375 |                    $1.875 |           $0.0375 |
| Gemini 3.8 / 3.7 / 3.6 Flash | Priority |      $1.35 |                     $6.75 |            $0.135 |
| Gemini 3.5 Flash-Lite        | Standard |      $0.30 |                     $2.50 |             $0.03 |
| Gemini 3.5 Flash-Lite        | Flex     |      $0.15 |                     $1.25 |             $0.02 |
| Gemini 3.5 Flash-Lite        | Priority |      $0.54 |                     $4.50 |             $0.05 |

Gemini 3.8, 3.7, and 3.6 Flash rates above include introductory pricing through December 31, 2026; those rates double on January 1, 2027. Promptfoo applies that scheduled change automatically. Batch inference uses the same published token rates as Flex for these models. Cache-storage and grounding-query charges are separate; see [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

Promptfoo can reference an existing explicit cache with `passthrough`; cache creation and lifecycle management remain outside the provider:

```yaml
providers:
  - id: google:gemini-3.6-flash
    config:
      passthrough:
        cachedContent: cachedContents/example-cache
```

### Gemini 3.5 Flash

The Gemini API redirects `gemini-3.5-flash` to `gemini-3.6-flash`. Use the replacement ID directly:

```yaml
providers:
  - id: google:gemini-3.6-flash
    config:
      maxOutputTokens: 4096
      generationConfig:
        thinkingConfig:
          thinkingLevel: MEDIUM # MINIMAL, LOW, MEDIUM (default), or HIGH
```

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

### Gemini 3.1 Pro Preview

Gemini 3.1 Pro with improved reasoning and agentic capabilities:

```yaml
providers:
  - id: google:gemini-3.1-pro-preview
    config:
      temperature: 0.7
      maxOutputTokens: 4096
      generationConfig:
        thinkingConfig:
          thinkingLevel: HIGH # LOW, MEDIUM, or HIGH (default)
```

Thinking levels for Gemini 3.1 Pro: LOW (faster, simpler tasks), MEDIUM (balanced), HIGH (deep reasoning, default).

### Gemini 2.5 Pro

For the Gemini API replacement, see [Gemini 3.8 Flash](#gemini-38-flash).

### Gemini 2.5 Flash

For the Gemini API replacement, see [Gemini 3.5 Flash-Lite](#gemini-35-flash-lite).

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

## Advanced Features

### Overriding Providers

Set the text grader and similarity embedding provider under `defaultTest.options.provider`. Choose a text model that supports chat-formatted prompts.

```yaml
defaultTest:
  options:
    provider:
      text: google:gemini-3.8-flash
      embedding: google:embedding:gemini-embedding-2
```

For a single test, use the same `options.provider` structure on that test. To choose a different model for one assertion, see the [embedding example](#embedding-models).

### Tool Calling

Google models support tool calling via the `tools` and `tool_config` config fields. The model returns tool calls in its response for your application to execute.

OpenAI-style prompt history with `tool_calls` and `tool_call_id` is converted to Gemini function-call and result parts. Existing Gemini thought signatures are preserved; imported calls without signatures use Google's documented [synthetic-history marker](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures#faqs).

```yaml
providers:
  - id: google:gemini-3.6-flash
    config:
      tools:
        - functionDeclarations:
            - name: get_weather
              description: Get current weather for a location
              parameters:
                type: OBJECT
                properties:
                  location:
                    type: STRING
                    description: City name or coordinates
                  units:
                    type: STRING
                    enum: [celsius, fahrenheit]
                required: [location]
      toolConfig:
        functionCallingConfig:
          mode: AUTO # AUTO, ANY, VALIDATED, or NONE
```

Promptfoo can execute configured `functionToolCallbacks`, including calls represented as JSON model output, or return the native `functionCall` parts for assertions such as `is-valid-function-call`. Callbacks run as trusted, unsandboxed local code; isolate evals that use untrusted models or content. If a callback fails, the eval reports an error with the number of completed callbacks and stops executing further calls. Check for side effects before retrying. A single callback that returns no value produces empty output.

Returned thought signatures are available in `metadata.thoughtSignatures` without changing normal text or JSON output. Streamed function-call parts retain signatures from continuation chunks on the assembled call. For a subsequent model turn, preserve the returned `thoughtSignature` and provide a matching function response:

```yaml
prompts:
  - |
    [
      {"role":"user","parts":[{"text":"What is the weather in Boston?"}]},
      {"role":"model","parts":[{"functionCall":{"id":"call-1","name":"get_weather","args":{"location":"Boston"}},"thoughtSignature":"{{signature}}"}]},
      {"role":"user","parts":[{"functionResponse":{"id":"call-1","name":"get_weather","response":{"result":"Sunny"}}}]}
    ]
```

See the [Google AI Studio tools example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-aistudio-tools) and the [Vertex tools example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-vertex-tools) for runnable function-call and callback configurations.

### Structured Output

You can constrain the model to output structured JSON responses in two ways:

#### 1. Using Response Schema Configuration

```yaml
providers:
  - id: google:gemini-3.8-flash
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
  - id: google:gemini-3.8-flash
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
  - id: google:gemini-3.8-flash
    config:
      tools:
        - googleSearch: {} # or google_search: {}
```

#### Combining with Other Features

You can combine Search grounding with thinking capabilities for better reasoning:

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      generationConfig:
        thinkingConfig:
          thinkingLevel: MEDIUM
      tools:
        - googleSearch: {}
```

#### Supported Models

:::info
Search grounding works with most recent Gemini models including:

- Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, and Gemini 3.5 Flash-Lite
- Gemini 3.5 Flash
- Gemini 3.1 Pro and Gemini 3 Flash
- Gemini 2.5 Flash, Flash-Lite, and Pro models
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

For more details, see the [Google AI Studio documentation on Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search).

### Maps Grounding

Gemini 3.6 Flash and Gemini 3.5 Flash-Lite can ground location-aware responses with Google Maps. Provide optional coordinates using `toolConfig.retrievalConfig`:

```yaml
providers:
  - id: google:gemini-3.5-flash-lite
    config:
      tools:
        - googleMaps: {}
      toolConfig:
        retrievalConfig:
          latLng:
            latitude: 42.3601
            longitude: -71.0589
          languageCode: en-US
```

Maps grounding is text-only and can incur query charges. Applications must display the returned Maps sources and attribution. See [Grounding with Google Maps](https://ai.google.dev/gemini-api/docs/generate-content/maps-grounding).

### Code Execution

Code execution allows Gemini models to write and execute Python code to solve computational problems, perform calculations, and generate data visualizations.

#### Basic Usage

To enable code execution:

```yaml
providers:
  - id: google:gemini-3.8-flash
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
  - id: google:gemini-3.8-flash
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

### File Search

Both new models support retrieval against an existing Gemini File Search store. Promptfoo forwards the store name and optional metadata filter; create and populate the store using the Gemini API before running an eval.

```yaml
providers:
  - id: google:gemini-3.6-flash
    config:
      tools:
        - fileSearch:
            fileSearchStoreNames:
              - fileSearchStores/my-store
            metadataFilter: 'source="handbook"'
```

See Google's [File Search guide](https://ai.google.dev/gemini-api/docs/generate-content/file-search) for store setup, metadata filters, and citation requirements.

### Computer Use (Preview)

Gemini 3.8 Flash is Google's recommended model for the preview Computer Use tool; Gemini 3.7 Flash and 3.5 Flash-Lite also support it. Promptfoo forwards the tool declaration and exposes returned action calls; the application under test is responsible for executing actions, returning screenshots and function responses, and preserving thought signatures between turns.

```yaml
providers:
  - id: google:gemini-3.8-flash
    config:
      tools:
        - computerUse:
            environment: ENVIRONMENT_BROWSER
            enablePromptInjectionDetection: true
```

See Google's [Computer Use guide](https://ai.google.dev/gemini-api/docs/generate-content/computer-use) for the action loop and safety requirements.

For complete working examples of the search grounding, code execution, and url context features, see the [google-aistudio-tools examples](https://github.com/promptfoo/promptfoo/tree/main/examples/google-aistudio-tools).

## Google Live API

Promptfoo supports voice and video conversations through Google's WebSocket-based Live API.

`google:live:` connects to the Gemini API, even when authenticating with OAuth. For Google Cloud project/location routing, use the separate [`vertex:live:` provider](/docs/providers/vertex#live-api).

Live authentication prefers `config.apiKey`, then explicit `config.credentials`, then `GOOGLE_API_KEY` / `GEMINI_API_KEY`, and finally ADC. A Cloud-only ADC login does not override a Gemini API key; ADC used without a key must have the required Gemini API scopes.

Use `google:live:gemini-3.5-transcribe-live` for speech-to-text evals. Supply a Gemini user message with an `inlineData` part containing base64-encoded, raw 16-bit mono PCM and `mimeType: audio/pcm;rate=16000`. The provider sends text response modality and input transcription settings, then exposes finalized speech segments in `output.text`. Set `config.generationConfig.inputAudioTranscription.languageCodes` to supply language hints. [Google Live transcription guide](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)

Use `google:live:gemini-3.8-live` for low-latency dialogue or `google:live:gemini-3.8-live-extended-thinking` for background reasoning. Both default to the `v1alpha` endpoint, audio output, and output transcription (`output.text`), and accept `GOOGLE_API_KEY` or `GEMINI_API_KEY`. Text response modality requests are converted to audio with transcription and billed at audio rates.

Extended Thinking accepts `generationConfig.thinkingConfig.thinkingLevel: LOW` (default), `MEDIUM`, or `HIGH`. Promptfoo sets function declarations to `behavior: NON_BLOCKING` and waits for `interactionStatus: IDLE` before advancing the conversation or returning a result; intermediate spoken updates are included in the transcript. Blocking tools are rejected. The standard 3.8 Live model does not accept `thinkingConfig`; neither model accepts `enableAffectiveDialog` or disabled proactive audio. Finite PCM audio inputs use explicit activity boundaries instead of automatic voice activity detection. See [Google's migration guide](https://ai.google.dev/gemini-api/docs/live-api/thinking) and the [Gemini 3.8 example](https://github.com/promptfoo/promptfoo/blob/main/examples/google-live/promptfooconfig.yaml).

### Using the Live Provider

Access the Google Live API by specifying the model with the 'live' service type:

```yaml
providers:
  - google:live:gemini-3.8-live
```

Supply video as individual `image/jpeg` or `image/png` frames. Promptfoo paces them at one frame per second. For model replacements and shutdown dates, see [Gemini API deprecations](https://ai.google.dev/gemini-api/docs/deprecations).

### Gemini Robotics ER 2 Streaming

The Robotics streaming endpoint uses `v1beta` and returns text rather than generated audio:

```yaml
providers:
  - id: google:live:gemini-robotics-er-2-streaming-preview
    config:
      generationConfig:
        response_modalities: ['text']
      timeoutMs: 30000
```

It supports text, image, video-frame, and raw PCM audio input plus function calling, Search grounding,
and thinking. It does not support caching, code execution, computer use, file search, Maps grounding,
structured output, or URL context.

### Gemini 3.5 Live Translate

Live Translate is an audio-only interpreter model. It requires `translationConfig`, uses the `v1beta`
Live endpoint, and returns translated audio plus an optional transcript. Supply raw little-endian,
16-bit mono PCM at 16 kHz; returned audio is 24 kHz. Text, images, video, tools, instructions,
thinking, grounding, caching, batch, flex, and priority inference are not supported.

```yaml
providers:
  - id: google:live:gemini-3.5-live-translate-preview
    config:
      generationConfig:
        response_modalities: ['audio']
        inputAudioTranscription: {}
        outputAudioTranscription: {}
        translationConfig:
          targetLanguageCode: pl
          echoTargetLanguage: true
      timeoutMs: 30000

prompts:
  - |
    [{"role":"user","parts":[{"inline_data":{"mime_type":"audio/pcm;rate=16000","data":"{{audio_base64}}"}}]}]
```

The model supports more than 70 languages with a 131,072-token input limit and 65,536-token output
limit. Pricing is $3.50/1M audio input tokens and $21/1M audio output tokens, approximately $0.0368
per minute at Google's stated 25 audio tokens per second. See Google's
[Live Translation guide](https://ai.google.dev/gemini-api/docs/live-api/live-translate) for supported
language codes and streaming details.

### Key Features

- **Real-time bidirectional communication**: Uses WebSockets for faster responses
- **Multimodal capabilities**: Can process text, audio, and video inputs
- **Built-in tools**: Supports function calling and Google Search integration
- **Low-latency interactions**: Optimized for conversational applications
- **Session memory**: The model retains context throughout the session

### Function Calling Example

The Google Live API supports function calling, allowing you to define tools that the model can use:

```yaml
providers:
  - id: google:live:gemini-3.8-live
    config:
      tools: file://tools.json
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
    "googleSearch": {}
  }
]
```

Tools accept both `functionDeclarations` and `function_declarations`. If both aliases define the same function name anywhere in the tools list, `functionDeclarations` takes precedence. For repeated names using the same spelling, the first declaration wins. Distinct functions and built-in tools are retained; entries containing only discarded duplicates are omitted.

### Built-in Tools

The Google Live API model supports built-in Google Search:

1. **Google Search**: Perform real-time web searches
   ```json
   {
     "googleSearch": {}
   }
   ```

### Audio Generation

The voice dialogue model returns audio and a transcript. Set `voiceName` to select a voice:

```yaml
providers:
  - id: google:live:gemini-3.8-live
    config:
      speechConfig:
        voiceConfig:
          prebuiltVoiceConfig:
            voiceName: Charon
```

See [Google's Live API capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities) for supported voices and audio settings.

### Getting Started

Try the examples:

```sh
# Initialize the Gemini 3.8 Live comparison
promptfoo init --example google-live
cd google-live

# Grade both models' spoken-response transcripts
promptfoo eval -c promptfooconfig.yaml --no-cache -j 1

# Audio generation example
cd ..
promptfoo init --example google-live-audio
```

### Limitations

Promptfoo reports token usage and cost when the API returns `usageMetadata`. Session duration and quotas depend on the model and billing tier. [Session management](https://ai.google.dev/gemini-api/docs/live-session) · [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

## See Also

- [Vertex AI Provider](/docs/providers/vertex) - For enterprise features and advanced Google AI capabilities
- [Google Examples](https://github.com/promptfoo/promptfoo/tree/main/examples) - Browse working examples for Google AI Studio
- [Gemini API Documentation](https://ai.google.dev/docs) - Official Google AI documentation
- [Configuration Reference](/docs/configuration/reference) - Complete configuration options for promptfoo
