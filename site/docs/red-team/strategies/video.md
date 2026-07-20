---
sidebar_label: Video Inputs
title: Video Jailbreaking Strategy
description: Evaluate video-capable AI models against adversarial video inputs with embedded text designed to bypass safety filters
---

# Video Jailbreaking

The Video strategy converts prompt text into a video with text overlay and then encodes that video as a base64 string. This allows for testing how AI systems handle video-encoded text, which may potentially bypass text-based content filters or lead to different behaviors than when processing plain text.

## Why Use This Strategy

This strategy helps security researchers and AI developers:

1. **Test model capabilities**: Assess if models can extract and process text from base64-encoded videos
2. **Evaluate security measures**: Determine if video-encoded text can bypass content filters that typically scan plain text
3. **Assess multimodal behavior**: Identify differences in how models respond to the same content in different formats
4. **Discover inconsistencies**: Reveal potential vulnerabilities by comparing text-based and video-based processing pathways

## How It Works

The strategy performs the following operations:

1. Takes the original text from your test case
2. Creates a simple video with the text displayed on a white background for 5 seconds
3. Converts the video to a base64 string
4. Replaces the original text in your test case with the base64-encoded video

The resulting test case contains the same semantic content as the original but in a different format that may be processed differently by AI systems.

## Example Transformation

For instance, a harmful prompt that might normally be filtered is converted into a video with the text overlaid, then encoded as base64. The encoded video would start like:

```
AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0...
```

## Implementation

Use it in your promptfooconfig.yaml like this:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Multimodal red team'
targets:
  - bedrock:amazon.nova-lite-v1:0
prompts:
  - file://path/to/your/prompt.json
redteam:
  plugins:
    - pii:direct
  strategies:
    - video
    - id: basic
      config:
        enabled: false
```

:::note
Disable other strategies when your prompt template only accepts video input. Set `enabled: false` for the basic strategy and remove other strategies from the array.
:::

Your prompt.json file should look like this:

```json title="prompt.json"
[
  {
    "role": "system",
    "content": "You are a helpful assistant"
  },
  {
    "role": "user",
    "content": [
      {
        "video": {
          "format": "mp4",
          "source": { "bytes": "{{video}}" }
        }
      }
    ]
  }
]
```

:::note
Update `prompt.json` to match your LLM provider's prompt format. When local rendering succeeds, the generated video is a base64-encoded MP4.
:::

:::note
The `{{video}}` syntax in the examples is a Nunjucks template variable. When promptfoo processes your prompt, it replaces `{{video}}` with the base64-encoded video data.
:::

## Requirements

This strategy requires FFmpeg and local red team generation. Install FFmpeg, then disable remote red team generation before creating video test cases:

```bash
export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
```

Remote-only plugins and strategies cannot be generated with this setting. Use plugins that support local generation when testing video inputs.

Install FFmpeg on your system:

**On macOS:**

```bash
brew install ffmpeg
```

**On Ubuntu/Debian:**

```bash
apt-get install ffmpeg
```

**On Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use package managers like Chocolatey:

```bash
choco install ffmpeg
```

## Technical Details

- **Video Format**: The strategy creates MP4 videos with H.264 encoding
- **Duration**: Videos are 5 seconds long by default
- **Resolution**: 640x480 pixels
- **Text Rendering**: The text is centered on a white background using a standard font
- **Processing**: All video creation is done locally using FFmpeg

:::warning
If remote red team generation is enabled or FFmpeg fails, the current implementation falls back to base64-encoded plaintext, not an MP4. Check generation logs and validate the payload before relying on video results. Video generation can also take longer than text encodings on large test sets.
:::

## Importance

This strategy helps test whether:

1. Content filters remain effective against video formats
2. The model can handle and extract information from video data
3. The same content is treated consistently across formats
4. Video processing uses appropriate safety thresholds
5. Image, audio, and video inputs receive consistent safety treatment

## Related Concepts

- [Audio Jailbreaking](/docs/red-team/strategies/audio) - Similar approach using speech audio
- [Image Jailbreaking](/docs/red-team/strategies/image) - Similar approach using images
- [Multimodal Red Teaming Guide](/docs/guides/multimodal-red-team) - Guide for testing multimodal models
- [Types of LLM vulnerabilities](/docs/red-team/llm-vulnerability-types/) - Full vulnerability and plugin directory with category mapping
- [Red Team Strategies](/docs/red-team/strategies/) - Full strategy catalog
