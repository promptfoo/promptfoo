# google-video (Google Video)

This example demonstrates Google Veo video generation models for AI-powered video creation from text prompts.

You can run this example with:

```bash
npx promptfoo@latest init --example google-video
cd google-video
```

## Prerequisites

Choose one:

- Google AI Studio / Gemini API key
- Google Cloud project with Vertex AI API enabled and authentication via `gcloud auth application-default login`

## Setup

```bash
# Option 1: Google AI Studio / Gemini API
export GOOGLE_API_KEY=your-api-key

# Option 2: Vertex AI
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
export GOOGLE_PROJECT_ID=your-project-id
```

## Environment Variables

- `GOOGLE_API_KEY` - Google AI Studio / Gemini API key
- `GOOGLE_PROJECT_ID` - Google Cloud project ID for Vertex AI

## Available Models

Google AI Studio / Gemini API:

| Provider ID                                  | Description                          | Generation duration |
| -------------------------------------------- | ------------------------------------ | ------------------- |
| `google:video:veo-3.1-generate-preview`      | Veo 3.1 with video extension support | 4, 6, 8s            |
| `google:video:veo-3.1-fast-generate-preview` | Faster Veo 3.1 generation            | 4, 6, 8s            |
| `google:video:veo-3.1-lite-generate-preview` | Lower-cost Veo 3.1 generation        | 4, 6, 8s            |

Vertex AI:

| Provider ID                              | Description          | Generation duration |
| ---------------------------------------- | -------------------- | ------------------- |
| `vertex:video:veo-3.1-generate-001`      | Veo 3.1 GA           | 4, 6, 8s            |
| `vertex:video:veo-3.1-fast-generate-001` | Faster Veo 3.1 GA    | 4, 6, 8s            |
| `vertex:video:veo-3.1-lite-generate-001` | Lite Veo 3.1 Preview | 4, 6, 8s            |

## Running the Example

```bash
npx promptfoo@latest eval
```

## Configuration Options

| Option             | Type   | Description                                             |
| ------------------ | ------ | ------------------------------------------------------- |
| `aspectRatio`      | string | `16:9` (default) or `9:16`                              |
| `resolution`       | string | `720p` (default) or `1080p`                             |
| `durationSeconds`  | number | 4, 6, or 8 seconds for generation; extension requires 8 |
| `personGeneration` | string | `allow_adult` or `dont_allow`                           |
| `negativePrompt`   | string | Concepts to avoid                                       |
| `image`            | string | Source image for image-to-video                         |
| `lastImage`        | string | End frame for interpolation                             |
| `sourceVideo`      | string | Base64/`file://`, plus `gs://` for Vertex AI            |
| `referenceImages`  | array  | Up to 3 style reference images (file paths or objects)  |

## Features

### Text-to-Video

Generate videos from text prompts (see `promptfooconfig.yaml`).

### Image-to-Video

Generate videos from a starting image (see `promptfooconfig-image.yaml`).

### Video Extension (Veo 3.1)

Extend a video with Google AI Studio by passing a base64 or `file://` source video and setting `durationSeconds: 8`; Veo adds 7 seconds to the source video (see `promptfooconfig-extension.yaml`).

## Notes

- Generated videos are stored in promptfoo's blob storage system
- Videos use content-addressable hashing for automatic deduplication
- Use `--no-cache` flag to force regeneration
- Videos are served via the local server for viewing in the UI
- Veo models use long-running operations with polling for completion
- `google:video:*` uses Google AI Studio by default
- Use `vertex:video:*` with the current model IDs above for explicit Vertex AI routing
- Google AI Studio does not accept Vertex operation IDs for extension
- Current Vertex AI Veo 3.1 models support extension through `sourceVideo`; use a Vertex operation name, `gs://` URI, base64 data, or a `file://` path. The request requires `durationSeconds: 8`, and Veo adds 7 seconds to the source video.
