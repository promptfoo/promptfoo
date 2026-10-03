# provider-image-to-video-ai (Image to Video AI Example)

Demonstrates how to evaluate asynchronous image-to-video generation workflows in Promptfoo using a custom provider.

You can initialize this example with:

```bash
npx promptfoo@latest init --example provider-image-to-video-ai
cd provider-image-to-video-ai
```

## Overview

Image-to-video AI services (such as [Image to Video AI](https://imagetovideoai.pro/), Runway, Kling, or Luma) generate short motion video clips from static images and motion prompts. Because video generation is computationally intensive, these APIs follow an asynchronous model:

1. **Task Submission**: Submit source image URL, prompt, motion style, and duration.
2. **Status Polling**: Poll the task endpoint until status reaches `completed`, `failed`, or a timeout is reached.
3. **Result Collection**: Retrieve output video URL, generation duration, and resolution metadata.

This example provides a clean, reusable custom provider in `provider.js` that wraps this workflow for Promptfoo assertions and quality evaluation.

## Setup

### Environment Variables

To run against a live API, export your API key:

```bash
export IMAGE_TO_VIDEO_AI_API_KEY="your-api-key"
```

> **Note:** If `IMAGE_TO_VIDEO_AI_API_KEY` is not set, the provider automatically runs in **simulated demo mode**, returning deterministic responses so that tests and local evaluations succeed out of the box without requiring paid credentials.

### Run the Evaluation

To test with your local build:

```bash
npm run local -- eval -c examples/provider-image-to-video-ai/promptfooconfig.yaml --no-cache
```

Or using the CLI:

```bash
promptfoo eval
```

View the generated outputs in the web viewer:

```bash
promptfoo view
```

## Configuration

In `promptfooconfig.yaml`, provider options can be configured under `config`:

```yaml
providers:
  - id: file://provider.js
    label: Image to Video AI
    config:
      apiKey: '{{env.IMAGE_TO_VIDEO_AI_API_KEY}}'
      pollIntervalMs: 500 # Time between polling attempts (ms)
      maxPollAttempts: 30 # Maximum polling iterations before timeout
      defaultDuration: 5 # Default video length in seconds
      defaultFps: 24 # Frame rate
      defaultResolution: 1280x720
```

### Test Case Variables

Each test case can supply:

- `prompt`: Motion description guiding the animation.
- `imageUrl`: Public or hosted URL of the source image.
- `motion`: Style of movement (e.g. `drone-forward-pan`, `subtle-portrait`, `slow-motion-fluid`).
- `duration`: Video clip duration in seconds.
- `fps`: Target frame rate (e.g. 24 or 30).
- `resolution`: Output video resolution (`1280x720`, `1920x1080`).

## Assertion Types Demonstrated

- **Video URL verification**: Ensuring valid HTTPS `.mp4` URLs are returned.
- **Completion status**: Confirming the task completed without error.
- **Duration check**: Asserting the generated duration matches request parameters.
- **Latency threshold**: Validating total workflow runtime stays within SLA limits.
