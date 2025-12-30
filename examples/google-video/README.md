# google-video

This example demonstrates Google Veo video generation models for AI-powered video creation from text prompts.

You can run this example with:

```bash
npx promptfoo@latest init --example google-video
```

## Prerequisites

- Google Cloud project with Vertex AI API enabled
- Authentication via `gcloud auth application-default login`

## Setup

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Authenticate with Application Default Credentials
gcloud auth application-default login

# Set project ID (Unix/Linux/macOS)
export GOOGLE_PROJECT_ID=your-project-id

# For Windows Command Prompt:
# set GOOGLE_PROJECT_ID=your-project-id

# For Windows PowerShell:
# $env:GOOGLE_PROJECT_ID="your-project-id"
```

## Environment Variables

- `GOOGLE_PROJECT_ID` - Your Google Cloud project ID (required)

## Available Models

| Model                      | Description                         | Duration |
| -------------------------- | ----------------------------------- | -------- |
| `veo-3.1-generate-preview` | Latest with video extension support | 4, 6, 8s |
| `veo-3.1-fast-preview`     | Fast Veo 3.1                        | 4, 6, 8s |
| `veo-3-generate`           | Veo 3.0 standard                    | 4, 6, 8s |
| `veo-3-fast`               | Veo 3.0 fast                        | 4, 6, 8s |
| `veo-2-generate`           | Veo 2.0                             | 5, 6, 8s |

## Running the Example

```bash
npx promptfoo@latest eval
```

## Configuration Options

| Option             | Type   | Description                                              |
| ------------------ | ------ | -------------------------------------------------------- |
| `aspectRatio`      | string | `16:9` (default) or `9:16`                               |
| `resolution`       | string | `720p` (default) or `1080p`                              |
| `durationSeconds`  | number | Duration: 4, 6, 8 for Veo 3.x; 5, 6, 8 for Veo 2         |
| `personGeneration` | string | `allow_adult` or `dont_allow`                            |
| `negativePrompt`   | string | Concepts to avoid                                        |
| `image`            | string | Source image for image-to-video                          |
| `lastImage`        | string | End frame for interpolation                              |
| `extendVideoId`    | string | Operation ID from previous Veo generation (Veo 3.1 only) |
| `referenceImages`  | array  | Up to 3 style reference images (file paths or objects)   |

## Features

### Text-to-Video

Generate videos from text prompts (see `promptfooconfig.yaml`).

### Image-to-Video

Generate videos from a starting image (see `promptfooconfig-image.yaml`).

### Video Extension (Veo 3.1)

Extend previously generated Veo videos using the operation ID (see `promptfooconfig-extension.yaml`).

## Notes

- Generated videos are stored in promptfoo's blob storage system
- Videos use content-addressable hashing for automatic deduplication
- Use `--no-cache` flag to force regeneration
- Videos are served via the local server for viewing in the UI
- Veo models use long-running operations with polling for completion
