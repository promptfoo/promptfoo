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

| Model                           | Description                                        | Duration |
| ------------------------------- | -------------------------------------------------- | -------- |
| `veo-3.1-generate-preview`      | Veo 3.1 with extension, references, and 4k         | 4, 6, 8s |
| `veo-3.1-fast-generate-preview` | Faster Veo 3.1 with extension, references, and 4k  | 4, 6, 8s |
| `veo-3.1-lite-generate-preview` | Veo 3.1 Lite without extension or reference images | 4, 6, 8s |

## Running the Example

```bash
npx promptfoo@latest eval
```

## Configuration Options

| Option             | Type   | Description                                                         |
| ------------------ | ------ | ------------------------------------------------------------------- |
| `aspectRatio`      | string | `16:9` (default) or `9:16`                                          |
| `resolution`       | string | `720p` (default), `1080p`, or `4k`; 4k requires Veo 3.1 or 3.1 Fast |
| `durationSeconds`  | number | 4, 6, or 8; use 8 for extension, references, or 1080p/4k output     |
| `personGeneration` | string | `allow_adult` or `dont_allow`                                       |
| `negativePrompt`   | string | Concepts to avoid                                                   |
| `image`            | string | Source image for image-to-video                                     |
| `lastImage`        | string | End frame for interpolation                                         |
| `extendVideoId`    | string | Legacy Vertex operation-ID input                                    |
| `sourceVideo`      | string | Base64 or `file://` Veo video to extend                             |
| `referenceImages`  | array  | Up to 3 style reference images (file paths or objects)              |

## Features

### Text-to-Video

Generate videos from text prompts (see `promptfooconfig.yaml`).

### Image-to-Video

Generate videos from a starting image (see `promptfooconfig-image.yaml`).

### Video Extension (Veo 3.1)

Extend a previously generated Veo video by passing its saved video data to the Gemini API
(see `promptfooconfig-extension.yaml`). This configuration requires `GOOGLE_API_KEY` or
`GEMINI_API_KEY`; it explicitly uses the Google AI Studio route because Vertex expects an
operation ID rather than a local `file://` video.

## Notes

- Generated videos are stored in promptfoo's blob storage system
- Videos use content-addressable hashing for automatic deduplication
- Use `--no-cache` flag to force regeneration
- Videos are served via the local server for viewing in the UI
- Veo models use long-running operations with polling for completion
- `google:video:*` uses Google AI Studio by default and auto-detects Vertex AI when project-based auth is configured
- Existing project-based `google:video:*` configs remain compatible; use `vertex:video:*` for explicit Vertex AI routing
- Video extension uses 720p output and requires `durationSeconds: 8`
