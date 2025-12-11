# elevenlabs-isolation (ElevenLabs Audio Isolation)

Remove background noise from audio files to extract clean speech using ElevenLabs audio isolation.

## Quick Start

```bash
npx promptfoo@latest init --example elevenlabs-isolation
cd elevenlabs-isolation
export ELEVENLABS_API_KEY=your_api_key_here
npx promptfoo@latest eval
```

## What this tests

- **Noise removal**: Extract clean speech from noisy audio
- **Audio quality**: Compare original vs isolated audio size/quality
- **Output formats**: MP3 at different bitrates (128kbps, 192kbps)
- **Cost tracking**: Monitor per-file processing costs

## How it works

Audio isolation takes a noisy audio file and returns a cleaned version with:

- Background noise removed
- Speech preserved and enhanced
- Consistent audio quality
- Reduced file size (noise-free)

## Use Cases

- **Podcast cleanup**: Remove background noise from recordings
- **Interview enhancement**: Clean up phone/video call audio
- **STT preprocessing**: Improve transcription accuracy
- **Voiceover repair**: Fix audio recorded in noisy environments
- **Call center QA**: Enhance customer service call recordings

## Supported Formats

**Input formats**: MP3, WAV, FLAC, OGG, M4A, OPUS, WebM

**Output formats**:

- `mp3_44100_128` - Standard quality (128kbps)
- `mp3_44100_192` - High quality (192kbps)
- `pcm_44100` - Uncompressed PCM

## Configuration

### Basic isolation (MP3)

```yaml
providers:
  - id: elevenlabs:isolation:basic
    label: Audio Isolation (MP3)
    config:
      outputFormat: mp3_44100_128

tests:
  - vars:
      audioFile: path/to/noisy-audio.mp3
```

### High quality output

```yaml
providers:
  - id: elevenlabs:isolation:hq
    label: Audio Isolation (HQ)
    config:
      outputFormat: mp3_44100_192
```

## Testing Assertions

```yaml
tests:
  - description: Verify isolation succeeds
    vars:
      audioFile: examples/elevenlabs-stt/audio/sample1.mp3
    assert:
      - type: javascript
        value: output.includes('isolated successfully')
      - type: not-contains
        value: error
      - type: cost
        threshold: 1.00 # Max $1.00 per file
```

## What to look for in results

The response includes:

- **Isolated audio**: Base64-encoded cleaned audio file
- **Original size**: Size of input audio file
- **Isolated size**: Size of cleaned audio (typically smaller)
- **Format**: Output audio format (mp3, pcm, etc.)
- **Latency**: Processing time in milliseconds
- **Cost**: Estimated processing cost

## Best Practices

1. **Source quality**: Use highest quality source audio available
2. **Noise type**: Works best with constant background noise (AC, fan, hum)
3. **Multiple speakers**: Preserves all speech, removes only noise
4. **Pre-processing**: For music removal, consider manual editing first

## Audio Quality Comparison

Isolation typically provides:

- **Signal-to-Noise Ratio (SNR)**: 15-25 dB improvement
- **File size reduction**: 10-30% smaller (noise-free)
- **Speech clarity**: Enhanced intelligibility
- **Frequency response**: Preserved natural voice tones

## Cost Information

Audio isolation pricing is based on audio duration:

- ~$0.10 per minute of audio
- Free tier: Varies by plan

The provider automatically tracks costs in evaluation results.

## Common Issues

### "Audio isolated successfully" but quality unchanged

**Possible causes:**

- Source audio already very clean
- Noise level too low to detect
- Music/speech mixed with background (try manual editing)

**Solution**: Check original audio quality - isolation works best with noisy recordings.

### Large file processing timeout

**Solution**: Increase timeout in config:

```yaml
config:
  timeout: 180000 # 3 minutes
```

### Unsupported audio format

**Solution**: Convert to supported format using ffmpeg:

```bash
ffmpeg -i input.video -vn -acodec mp3 output.mp3
```

## Pipeline Integration

### Isolation → Transcription

```yaml
# Step 1: Isolate noisy audio
providers:
  - id: elevenlabs:isolation

# Step 2: Transcribe cleaned audio
providers:
  - id: elevenlabs:stt
    config:
      audioFile: '{{previousOutput.audio}}'
```

### Isolation → Alignment

```yaml
# Step 1: Clean audio
providers:
  - id: elevenlabs:isolation

# Step 2: Generate subtitles from clean audio
providers:
  - id: elevenlabs:alignment
    config:
      audioFile: '{{previousOutput.audio}}'
      transcript: "Your transcript here"
```

## Related Examples

- [ElevenLabs STT](../elevenlabs-stt/) - Transcribe audio to text
- [ElevenLabs Alignment](../elevenlabs-alignment/) - Generate subtitles

## Resources

- [ElevenLabs Audio Isolation Docs](https://elevenlabs.io/docs/api-reference/audio-isolation)
- [Audio Quality Metrics](https://en.wikipedia.org/wiki/Audio_quality_measurement)
- [Noise Reduction Techniques](https://en.wikipedia.org/wiki/Noise_reduction)
