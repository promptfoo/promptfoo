# elevenlabs-tts (ElevenLabs Text-to-Speech)

Test and compare ElevenLabs TTS models and voice settings.

## What this tests

- **Model comparison**: Flash v2.5, Turbo v2.5, Multilingual v2
- **Streaming vs. non-streaming** performance
- **Voice quality** across different text inputs
- **Cost and latency** metrics

## Setup

Set your ElevenLabs API key:

```bash
export ELEVENLABS_API_KEY=your_api_key_here
```

## Run the example

```bash
npx promptfoo@latest eval -c ./promptfooconfig.yaml
```

Or view in the UI:

```bash
npx promptfoo@latest eval -c ./promptfooconfig.yaml
npx promptfoo@latest view
```

## What to look for

1. **Model differences**: Flash v2.5 has lowest latency (~200ms), Multilingual v2 best quality
2. **Streaming benefits**: First chunk arrives in ~75ms for real-time feel
3. **Cost tracking**: ~$0.02 per 1000 characters
4. **Audio metadata**: Duration, size, format info in response

## Available voices

This example uses Rachel (21m00Tcm4TlvDq8ikWAM). Try other popular voices:

- **Rachel**: Calm, clear female voice (default)
- **Clyde**: Warm, grounded male voice (2EiwWnXFnvU5JabPnv8n)
- **Drew**: Well-rounded male voice (29vD33N1CtxCmqQRPOHJ)
- **Paul**: Casual male voice (5Q0t7uMcjvnagumLfvZi)

## Voice settings

Customize the voice output:

```yaml
voiceSettings:
  stability: 0.5 # 0 (more variable) to 1 (more stable)
  similarity_boost: 0.75 # 0 (low) to 1 (high)
  style: 0.0 # 0 to 1 (only for v2 models)
  use_speaker_boost: true # Enhance clarity
  speed: 1.0 # 0.25 to 4.0
```

## Output formats

Available formats:

- `mp3_22050_32` - Smallest size, lower quality
- `mp3_44100_128` - Balanced (default)
- `mp3_44100_192` - High quality
- `pcm_16000` - Raw PCM for processing
- `pcm_44100` - High quality PCM
- `ulaw_8000` - Phone quality

## Learn more

- [ElevenLabs TTS Documentation](https://elevenlabs.io/docs/api-reference/text-to-speech)
- [Voice Library](https://elevenlabs.io/voice-library)
- [Pricing](https://elevenlabs.io/pricing)
