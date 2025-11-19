# google-imagen

This example demonstrates Google Imagen image generation models.

You can run this example with:

```bash
npx promptfoo@latest init --example google-imagen
```

## Prerequisites

You can use Imagen models through either Google AI Studio or Vertex AI:

### Option 1: Google AI Studio (Quick Start, Limited Features)

- Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)
- **Supports**: Imagen 4 models only
- **Limitations**: No `seed` or `addWatermark` parameters

### Option 2: Vertex AI (Full Features)

- Google Cloud project with billing enabled
- Vertex AI API enabled
- Authentication via `gcloud auth application-default login`
- **Supports**: All Imagen models and all parameters

## Setup

### For Google AI Studio:

```bash
# Set your API key (Unix/Linux/macOS)
export GOOGLE_API_KEY=your-api-key

# For Windows Command Prompt:
# set GOOGLE_API_KEY=your-api-key

# For Windows PowerShell:
# $env:GOOGLE_API_KEY="your-api-key"
```

### For Vertex AI:

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Authenticate
gcloud auth application-default login

# Set project ID (Unix/Linux/macOS)
export GOOGLE_PROJECT_ID=your-project-id

# For Windows Command Prompt:
# set GOOGLE_PROJECT_ID=your-project-id

# For Windows PowerShell:
# $env:GOOGLE_PROJECT_ID="your-project-id"
```

## Environment Variables

- `GOOGLE_API_KEY` - Google AI Studio API key (Option 1)
- `GOOGLE_PROJECT_ID` - Your Google Cloud project ID (Option 2)

## Available Models

- `imagen-4.0-ultra-generate-preview-06-06` - Ultra quality ($0.06/image)
- `imagen-4.0-generate-preview-06-06` - Standard quality ($0.04/image)
- `imagen-4.0-fast-generate-preview-06-06` - Fast generation ($0.02/image)
- `imagen-3.0-generate-002` - Imagen 3.0 ($0.04/image)

## Running the Example

```bash
npx promptfoo@latest eval
```

## Notes

- Imagen models are available through both **Google AI Studio** and **Vertex AI**
- **Google AI Studio**:
  - Uses API key authentication (quick start)
  - Only supports Imagen 4 models (4.0 preview models)
  - Limited parameter support:
    - No `seed` or `addWatermark` parameters
    - Only `block_low_and_above` safety filter level
- **Vertex AI**:
  - Requires authentication via `gcloud auth application-default login`
  - Supports all Imagen models (both 3.0 and 4.0)
  - Full parameter support:
    - All safety filter levels (`block_most`, `block_some`, `block_few`, `block_fewest`)
    - `seed` for deterministic generation
    - `addWatermark` control
  - You must provide a Google Cloud project ID either via:
    - `GOOGLE_PROJECT_ID` environment variable
    - `projectId` in the provider config
- Seed and watermark parameters are mutually exclusive (Vertex AI only)

## Advanced Configuration

See `promptfooconfig-advanced.yaml` for examples of platform-specific configurations that take advantage of each platform's unique capabilities.
