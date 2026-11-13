# openai-video (OpenAI Sora Video Generation)

OpenAI shut down the Videos API and Sora 2 models on September 24, 2026. This example requires a compatible gateway that still serves the Videos API. [OpenAI deprecation notice](https://developers.openai.com/api/docs/deprecations#2026-03-24-sora-2-video-generation-models-and-videos-api)

## Setup

Initialize this example:

```bash
npx promptfoo@latest init --example openai-video
cd openai-video
```

Set the base URL and credential supplied by your gateway.

```bash
export OPENAI_API_BASE_URL=https://your-gateway.example/v1
export OPENAI_API_KEY=your_gateway_key
```

## Usage

Run the evaluation:

```bash
npx promptfoo@latest eval
```

View results in the web UI:

```bash
npx promptfoo@latest view
```

## Models

Use model IDs supported by your gateway. Promptfoo uses the historical OpenAI rates below to estimate costs.

| Model      | Description           | Cost         |
| ---------- | --------------------- | ------------ |
| sora-2     | Standard quality      | $0.10/second |
| sora-2-pro | Higher quality output | $0.30/second |

## Configuration Options

| Parameter              | Description                               | Default  |
| ---------------------- | ----------------------------------------- | -------- |
| `size`                 | Video dimensions (1280x720 or 720x1280)   | 1280x720 |
| `seconds`              | Duration in seconds (4, 8, 12, 16, or 20) | 8        |
| `poll_interval_ms`     | Polling interval for job status           | 10000    |
| `max_poll_time_ms`     | Maximum wait time for generation          | 600000   |
| `download_thumbnail`   | Download thumbnail preview                | true     |
| `download_spritesheet` | Download spritesheet preview              | true     |

## Output

Generated videos are stored in the promptfoo media storage (`~/.promptfoo/media/`) and displayed in the web viewer with playback controls.

## Notes

- Video generation can take 1-5 minutes per video
- Requests to authenticated compatible gateways bypass the persistent video cache
- The web viewer supports video playback with controls and metadata display
