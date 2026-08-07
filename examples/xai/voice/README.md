# xai/voice (xAI Grok Voice Agent)

This example demonstrates how to use xAI's Grok Voice Agent API with promptfoo for evaluating real-time voice AI conversations.

## Prerequisites

- An xAI API key with access to the Voice Agent API
- Set `XAI_API_KEY` environment variable

## Setup

```bash
npx promptfoo@latest init --example xai/voice
cd xai/voice
export XAI_API_KEY=your-api-key
```

## Run

```bash
npx promptfoo@latest eval
```

## Configuration Options

### Models

- `grok-voice-think-fast-2.0` - Current flagship voice model
- `grok-voice-latest` - Recommended alias; xAI says it moves from 1.0 to 2.0 on August 5, 2026, and promptfoo switches its cost estimate on that date
- `grok-voice-think-fast-1.0` - Previous-generation voice model

The model is selected through the `?model=` query parameter on the realtime WebSocket URL.

### Voices

xAI Voice supports 5 different voices:

- `eve` (default) - Female voice
- `ara` - Female voice
- `rex` - Male voice
- `sal` - Male voice
- `leo` - Male voice

### Built-in Tools

The Voice API includes several built-in tools:

- `web_search` - Search the web for information
- `x_search` - Search posts on X (Twitter)
- `file_search` - Search uploaded files in vector stores

### Custom Functions

You can define custom function tools that the voice agent can call. Tools can be defined inline or loaded from external files:

**Inline definition:**

```yaml
tools:
  - type: function
    name: get_weather
    description: Get the current weather for a location
    parameters:
      type: object
      properties:
        location:
          type: string
          description: The city and state
      required: ['location']
```

**Load from external file:**

```yaml
# promptfooconfig.yaml
config:
  tools: file://tools.yaml
```

```yaml
# tools.yaml
- type: function
  name: get_weather
  description: Get the current weather for a location
  parameters:
    type: object
    properties:
      location:
        type: string
        description: The city and state
    required:
      - location

- type: function
  name: set_reminder
  description: Set a reminder for the user
  parameters:
    type: object
    properties:
      message:
        type: string
      time:
        type: string
    required:
      - message
      - time
```

External files can be YAML or JSON format.

### Audio Configuration

Configure input/output audio formats:

```yaml
config:
  audio:
    input:
      format:
        type: audio/pcm
        rate: 24000
    output:
      format:
        type: audio/pcm
        rate: 24000
```

Supported formats: `audio/pcm`, `audio/pcmu`, `audio/pcma`
Supported sample rates: 8000, 16000, 22050, 24000, 32000, 44100, 48000 Hz

### Custom WebSocket URL

For local testing, proxies, or endpoints with query parameters:

```yaml
config:
  websocketUrl: 'wss://custom-endpoint.example.com/path?token=xyz'
```

### Function Call Assertions

When using custom function tools, you can assert on the function calls:

```yaml
tests:
  - vars:
      question: 'Set the volume to 50%'
    assert:
      - type: javascript
        value: |
          const calls = output.functionCalls || [];
          return calls.some(c => c.name === 'set_volume');
```

## Pricing

Grok Voice Think Fast 2.0 is billed at $0.08 per minute of audio. The
previous-generation 1.0 model costs $0.05 per minute.

## Resources

- [xAI Speech to Speech Documentation](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech)
- [xAI API Reference](https://docs.x.ai/api)
