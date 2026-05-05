# xai/video (xAI Grok Video Generation)

You can run this example with:

```bash
npx promptfoo@latest init --example xai/video
cd xai/video
```

This example demonstrates video generation using xAI's Grok Imagine API.

## Setup

1. Set your xAI API key:

```bash
export XAI_API_KEY=your_api_key_here
```

2. Run the evaluation:

```bash
npx promptfoo@latest eval
```

## Configuration Options

| Option         | Type   | Default | Description                                        |
| -------------- | ------ | ------- | -------------------------------------------------- |
| `duration`     | number | 8       | Video length in seconds (1-15)                     |
| `aspect_ratio` | string | 16:9    | Aspect ratio (16:9, 4:3, 1:1, 9:16, 3:4, 3:2, 2:3) |
| `resolution`   | string | 720p    | Output resolution (720p, 480p)                     |

## Advanced Features

### Image-to-Video

Animate a static image:

```yaml
providers:
  - id: xai:video:grok-imagine-video
    config:
      image:
        url: 'https://example.com/image.jpg'
```

### Video Editing

Edit an existing video:

```yaml
providers:
  - id: xai:video:grok-imagine-video
    config:
      video:
        url: 'https://example.com/video.mp4'

prompts:
  - 'Make the colors more vibrant'
```

### Reference-to-Video

Guide the generated video with up to seven reference images:

```yaml
providers:
  - id: xai:video:grok-imagine-video
    config:
      reference_images:
        - url: 'https://example.com/person.jpg'
        - url: 'https://example.com/shirt.jpg'
      duration: 10
```

`reference_images` cannot be combined with `image` or `video`, and reference-guided videos are limited to 10 seconds.

## See Also

- [xAI Provider Documentation](https://promptfoo.dev/docs/providers/xai)
- [xAI Grok Imagine API](https://docs.x.ai/docs/guides/video-generations-and-edits)
