# provider-image-to-video-ai (Async Image to Video Simulation Example)

Demonstrates how to evaluate asynchronous image-to-video generation workflows in Promptfoo using a custom provider.

You can initialize this example with:

```bash
npx promptfoo@latest init --example provider-image-to-video-ai
cd provider-image-to-video-ai
```

## Overview

Image-to-video AI services (such as Runway, Kling, or Luma) generate short motion video clips from static images and motion prompts. Because video generation is computationally intensive, these APIs follow an asynchronous model:

1. **Task Submission**: Submit source image URL, prompt, motion style, and duration.
2. **Status Polling**: Poll the task endpoint until status reaches `completed`, `failed`, or a timeout is reached.
3. **Cancellation & Timeout**: Propagate `AbortSignal` cancellation and bound total execution time.
4. **Result Collection**: Retrieve output video URL and validate observed media metadata (actual duration, resolution, fps) against requested parameters.

This example provides an **explicitly generic local simulation and reference template** in `provider.js` that demonstrates this workflow. By default, it runs completely locally in simulation mode with synthetic placeholder media, without making external network calls or requiring paid credentials.

## Setup

### Local Simulation (Default)

By default, the provider runs in **generic local simulation mode**, generating synthetic placeholder URLs (e.g. `https://example.com/simulated-renders/...`) and deterministic media properties so evaluations and CI pass out of the box without network dependencies.

### Optional: Live API Integration

To connect this template to a real asynchronous video API service, provide your endpoint's base URL and API key:

```bash
export IMAGE_TO_VIDEO_AI_API_KEY="your-api-key"
export IMAGE_TO_VIDEO_AI_BASE_URL="https://your-service-api.com/v1"
```

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
      baseUrl: '{{env.IMAGE_TO_VIDEO_AI_BASE_URL}}' # Optional API base URL
      pollIntervalMs: 500 # Time between polling attempts (ms)
      maxPollAttempts: 30 # Maximum polling iterations before timeout
      timeoutMs: 60000 # Overall timeout deadline (ms)
      defaultDuration: 5 # Default video length in seconds
      defaultFps: 24 # Frame rate
      defaultResolution: 1280x720
```

### Test Case Variables

Each test case can supply:

- `prompt`: Motion description guiding the animation.
- `imageUrl`: Public or hosted URL of the source image.
- `motion`: Style of movement (e.g. `drone-forward-pan`, `subtle-portrait`, `slow-motion-fluid`).
- `duration`: Requested video clip duration in seconds.
- `fps`: Requested frame rate (e.g. 24 or 30).
- `resolution`: Requested output video resolution (`1280x720`, `1920x1080`).

## Assertion Types Demonstrated

- **Video URL verification**: Ensuring valid video preview links are returned.
- **Completion status**: Confirming the task completed without error.
- **Observed media properties**: Asserting returned actual media properties match expected criteria (keeping requested parameters distinct).
- **Latency & SLA thresholds**: Validating total workflow runtime stays within SLA limits.
