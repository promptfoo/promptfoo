# google-imagen

This example demonstrates Google Imagen image generation models.

You can run this example with:

```bash
npx promptfoo@latest init --example google-imagen
```

## Prerequisites

- Google Cloud project with billing enabled
- Vertex AI API enabled
- Authentication via `gcloud auth application-default login`

## Setup

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Authenticate
gcloud auth application-default login

# Set project ID
export GOOGLE_PROJECT_ID=your-project-id
```

## Environment Variables

- `GOOGLE_PROJECT_ID` - Your Google Cloud project ID

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

- **Imagen models are only available through Vertex AI** (Google AI Studio/Gemini API is not supported)
- Vertex AI requires authentication via `gcloud auth application-default login` (API keys are not supported)
- You must provide a Google Cloud project ID either via:
  - `GOOGLE_PROJECT_ID` environment variable
  - `projectId` in the provider config
- Seed and watermark parameters are mutually exclusive
