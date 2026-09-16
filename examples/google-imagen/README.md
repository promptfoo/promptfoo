# google-imagen (Google Image Generation)

This example generates images with Gemini. The directory keeps its existing name so `init --example google-imagen` continues to work.

```bash
npx promptfoo@latest init --example google-imagen
cd google-imagen
```

## Prerequisites

Choose Google AI Studio for the native Gemini API or Vertex AI for Google Cloud authentication.

### Option 1: Google AI Studio (Quick Start)

- Get an API key from [Google AI Studio](https://aistudio.google.com/apikey).
- Use a billing-enabled project with access to the selected image model.

### Option 2: Vertex AI

- Use a Google Cloud project with billing and the Vertex AI API enabled.
- Authenticate with `gcloud auth application-default login`.
- Check the [Vertex Gemini 3.1 Flash Image model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image) for model availability. The example uses the global endpoint.

## Setup

### For Google AI Studio:

```bash
export GOOGLE_API_KEY=your-api-key

# Windows Command Prompt:
# set GOOGLE_API_KEY=your-api-key
# Windows PowerShell:
# $env:GOOGLE_API_KEY="your-api-key"
```

Run without `GOOGLE_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT` set: a configured project selects Vertex AI in this adapter.

### For Vertex AI:

```bash
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
export GOOGLE_PROJECT_ID=your-project-id

# Windows Command Prompt:
# set GOOGLE_PROJECT_ID=your-project-id
# Windows PowerShell:
# $env:GOOGLE_PROJECT_ID="your-project-id"
```

## Environment Variables

- `GOOGLE_API_KEY` - Native Gemini API key.
- `GOOGLE_PROJECT_ID` - Google Cloud project used by the Vertex example.

## Available Models

### Imagen Models (legacy `google:image:` prefix)

The old Imagen configurations have been migrated to Gemini image generation. Native Imagen 4 reached its [August 17, 2026 shutdown](https://ai.google.dev/gemini-api/docs/imagen). Google Cloud separately [discontinued Imagen 3 and 4 models on June 30, 2026](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes).

Use `google:gemini-3.1-flash-image` for the replacement. The `google:image:` prefix selects Imagen's `predict` adapter; putting a Gemini model after that prefix does not migrate the protocol.

### Gemini Native Image Generation

The default config uses `google:gemini-3.1-flash-image` at 1K resolution. `promptfooconfig-gemini.yaml` compares these native Gemini API models:

- `google:gemini-3.1-flash-lite-image` - 1K only; no Google Search grounding.
- `google:gemini-3.1-flash-image` - Supports 1K, 2K, and 4K output.
- `google:gemini-3-pro-image` - Supports 1K, 2K, and 4K output.
- `google:gemini-2.5-flash-image` - Legacy comparison until its [October 2, 2026 native shutdown](https://ai.google.dev/gemini-api/docs/deprecations); use 3.1 Flash Image for new configs. Does not support `imageSize`.

Use the stable IDs above. Google shut down the `gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview` aliases on [June 25, 2026](https://ai.google.dev/gemini-api/docs/deprecations). Check [current native pricing](https://ai.google.dev/gemini-api/docs/pricing) for the model and resolution you select; Vertex has separate pricing and availability.

## Running the Example

For Google AI Studio:

```bash
npx promptfoo@latest eval
```

For Vertex AI, use the OAuth configuration:

```bash
npx promptfoo@latest eval -c promptfooconfig-advanced.yaml
```

## Notes

- Gemini image generation uses `generateContent` with `TEXT` and `IMAGE` response modalities.
- Configure `imageAspectRatio` and `imageSize`. Imagen's `aspectRatio`, `safetyFilterLevel`, `seed`, `personGeneration`, and `addWatermark` options are not interchangeable with this adapter's settings.
- Responses can contain both text and images. The assertions inspect `context.providerResponse.images` so a valid text-and-image response passes and a text-only response fails.

## Advanced Configuration

`promptfooconfig-advanced.yaml` demonstrates Vertex AI with an explicit project and 2K image generation. It sets `apiKeyRequired: false` because Google Cloud OAuth supplies authentication.

## Gemini Native Image Generation

For a comparison of native image models or a Google Search-grounded image, run:

```bash
npx promptfoo@latest eval -c promptfooconfig-gemini.yaml
npx promptfoo@latest eval -c promptfooconfig-gemini-grounding.yaml
```

The grounding config uses `google:gemini-3.1-flash-image` with `tools: [{ googleSearch: {} }]`. See Google's [GenerateContent image guide](https://ai.google.dev/gemini-api/docs/generate-content/image-generation) for supported input, output, and grounding options.
