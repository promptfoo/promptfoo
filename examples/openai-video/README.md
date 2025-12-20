# openai-video (OpenAI Sora Video Generation)

This example demonstrates how to use OpenAI's Sora video generation models with Promptfoo.

## Setup

Initialize this example:

```bash
npx promptfoo@latest init --example openai-video
```

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your_api_key_here
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

This example compares two Sora models:

| Model      | Description           | Cost         |
| ---------- | --------------------- | ------------ |
| sora-2     | Standard quality      | $0.10/second |
| sora-2-pro | Higher quality output | $0.30/second |

## Configuration Options

| Parameter              | Description                             | Default  |
| ---------------------- | --------------------------------------- | -------- |
| `size`                 | Video dimensions (1280x720 or 720x1280) | 1280x720 |
| `seconds`              | Duration in seconds (4, 8, or 12)       | 8        |
| `poll_interval_ms`     | Polling interval for job status         | 10000    |
| `max_poll_time_ms`     | Maximum wait time for generation        | 600000   |
| `download_thumbnail`   | Download thumbnail preview              | true     |
| `download_spritesheet` | Download spritesheet preview            | true     |

## Output

Generated videos are stored in the promptfoo media storage (`~/.promptfoo/media/`) and displayed in the web viewer with playback controls.

## Notes

- Video generation can take 1-5 minutes per video
- Videos are cached based on request parameters (prompt, model, size, seconds) to avoid regeneration
- The web viewer supports video playback with controls and metadata display
