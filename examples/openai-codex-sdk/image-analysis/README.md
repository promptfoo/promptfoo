# openai-codex-sdk/image-analysis (Image Input with Codex SDK)

Demonstrates the Codex SDK's ability to analyze images alongside text prompts.

## Usage

```bash
npx promptfoo@latest init --example openai-codex-sdk/image-analysis
npx promptfoo@latest eval
```

## Image Input Configuration

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.2-codex
      images:
        - ./screenshot.png
        - file://diagrams/architecture.png
```

## Path Resolution

Paths are resolved relative to the config file directory (following promptfoo conventions):

- `./image.png` - relative to config file
- `file://path/to/image.png` - file:// prefix (also relative to config)
- `/absolute/path/image.png` - absolute paths used as-is

## Supported Image Formats

- PNG
- JPEG
- WebP
- GIF (first frame)

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key

## Notes

- Image input requires Codex SDK v0.81.0+
- Images are sent to the Codex agent for visual analysis
- The agent can reference image content when writing or analyzing code
