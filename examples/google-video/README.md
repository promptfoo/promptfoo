# google-video

This example demonstrates Google Veo video generation models for AI-powered video creation from text prompts.

You can run this example with:

```bash
npx promptfoo@latest init --example google-video
```

## Prerequisites

- Google Cloud project with Vertex AI API enabled
- Authentication via `gcloud auth application-default login`
- Or a Google AI Studio API key

## Setup

### Option 1: Google AI Studio (Quick Start)

```bash
# Set your API key (Unix/Linux/macOS)
export GOOGLE_API_KEY=your-api-key

# For Windows Command Prompt:
# set GOOGLE_API_KEY=your-api-key

# For Windows PowerShell:
# $env:GOOGLE_API_KEY="your-api-key"
```

### Option 2: Vertex AI (Full Features)

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Authenticate
gcloud auth application-default login

# Set project ID (Unix/Linux/macOS)
export GOOGLE_PROJECT_ID=your-project-id
```

## Environment Variables

- `GOOGLE_API_KEY` or `GEMINI_API_KEY` - Google AI Studio API key
- `GOOGLE_PROJECT_ID` - Your Google Cloud project ID (for Vertex AI)

## Available Models

| Model | Description | Duration |
|-------|-------------|----------|
| `veo-3.1-generate-preview` | Latest with video extension support | 5-8s |
| `veo-3.1-fast-preview` | Fast Veo 3.1 | 5-8s |
| `veo-3-generate` | Veo 3.0 standard | 4-8s |
| `veo-3-fast` | Veo 3.0 fast | 4-8s |
| `veo-2-generate` | Veo 2.0 | 5-8s |

## Running the Example

```bash
npx promptfoo@latest eval
```

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `aspectRatio` | string | `16:9` (default) or `9:16` |
| `resolution` | string | `720p` (default) or `1080p` |
| `duration` | number | Duration in seconds (model-dependent) |
| `personGeneration` | string | `allow_adult` or `dont_allow` |
| `negativePrompt` | string | Concepts to avoid |
| `image` | string | Source image for image-to-video |
| `lastImage` | string | End frame for interpolation |
| `sourceVideo` | string | Video to extend (Veo 3.1 only) |
| `referenceImages` | array | Up to 3 style reference images |

## Features

### Text-to-Video

Generate videos from text prompts (see `promptfooconfig.yaml`).

### Image-to-Video

Generate videos from a starting image (see `promptfooconfig-image.yaml`).

### Video Extension (Veo 3.1)

Extend existing videos (see `promptfooconfig-extension.yaml`).

## Notes

- Generated videos are cached locally at `~/.promptfoo/output/video/`
- Use `--no-cache` flag to force regeneration
- Videos are served via the local server for viewing in the UI
- Veo models use long-running operations with polling for completion
