# elevenlabs-stt (ElevenLabs Speech-to-Text)

This example demonstrates how to use ElevenLabs STT provider for audio transcription testing.

## Quick Start

```bash
npx promptfoo@latest init --example elevenlabs-stt
cd elevenlabs-stt
export ELEVENLABS_API_KEY=your_api_key_here
npx promptfoo@latest eval
```

## Features

- **Audio Transcription**: Convert speech to text with high accuracy
- **Speaker Diarization**: Identify and separate multiple speakers in audio
- **Word Error Rate (WER)**: Measure transcription accuracy against reference text
- **Multi-format Support**: MP3, WAV, FLAC, M4A, OGG, OPUS, WebM

## Setup

1. **Set your API key**:

   ```bash
   export ELEVENLABS_API_KEY=your_api_key_here
   ```

2. **Prepare audio files**:
   Create an `audio/` directory with your test audio files:

   ```bash
   mkdir -p audio
   # Place your audio files in the audio/ directory
   ```

3. **Run the evaluation**:
   ```bash
   promptfoo eval
   ```

## Configuration

### Basic Transcription

```yaml
providers:
  - id: elevenlabs:stt:basic
    config:
      modelId: eleven_speech_to_text_v1
      language: en # ISO 639-1 language code
```

### Speaker Diarization

Identify and label different speakers in your audio:

```yaml
providers:
  - id: elevenlabs:stt:diarization
    config:
      modelId: eleven_speech_to_text_v1
      diarization: true
      maxSpeakers: 3 # Optional: hint for expected number of speakers
```

The response will include speaker segments:

```json
{
  "text": "Full transcription...",
  "diarization": [
    {
      "speaker_id": "speaker_0",
      "text": "Hello, how are you?",
      "start_time_ms": 0,
      "end_time_ms": 2500,
      "confidence": 0.95
    },
    {
      "speaker_id": "speaker_1",
      "text": "I'm doing well, thanks!",
      "start_time_ms": 2500,
      "end_time_ms": 5000,
      "confidence": 0.92
    }
  ]
}
```

### Accuracy Testing with WER

Word Error Rate (WER) measures transcription accuracy. Lower is better (0 = perfect).

```yaml
providers:
  - id: elevenlabs:stt:accuracy
    config:
      modelId: eleven_speech_to_text_v1
      calculateWER: true
      referenceText: The quick brown fox jumps over the lazy dog
```

**WER Formula**: `(Substitutions + Deletions + Insertions) / Total Words`

The response includes detailed WER metrics:

```json
{
  "wer": 0.05, // 5% error rate
  "substitutions": 1,
  "deletions": 0,
  "insertions": 0,
  "correct": 19,
  "totalWords": 20,
  "details": {
    "reference": "the quick brown fox jumps",
    "hypothesis": "the quick green fox jumps",
    "alignment": "REF: the quick brown fox jumps\nHYP: the quick green fox jumps\nOPS:           SSSSS"
  }
}
```

**WER Interpretation**:

- **0.00 - 0.05**: Excellent (95%+ accurate)
- **0.05 - 0.10**: Good (90-95% accurate)
- **0.10 - 0.20**: Fair (80-90% accurate)
- **0.20+**: Poor (< 80% accurate)

## Supported Audio Formats

| Format    | Extension  | Notes                      |
| --------- | ---------- | -------------------------- |
| MP3       | .mp3       | Widely compatible          |
| MP4 Audio | .mp4, .m4a | AAC/MPEG-4 audio           |
| WAV       | .wav       | Uncompressed, high quality |
| FLAC      | .flac      | Lossless compression       |
| OGG       | .ogg       | Open format                |
| Opus      | .opus      | Modern, efficient codec    |
| WebM      | .webm      | Web-optimized              |

## Audio Input Methods

### Method 1: Config-level

```yaml
providers:
  - id: elevenlabs:stt
    config:
      audioFile: path/to/audio.mp3
```

### Method 2: Prompt-level

```yaml
prompts:
  - audio/sample1.mp3
  - audio/sample2.wav
```

### Method 3: Vars-level

```yaml
tests:
  - vars:
      audioFile: audio/sample.mp3
```

## Testing Assertions

### Cost Threshold

```yaml
tests:
  - assert:
      - type: cost
        threshold: 0.05 # Max $0.05 per transcription
```

### Latency Threshold

```yaml
tests:
  - assert:
      - type: latency
        threshold: 10000 # Max 10 seconds
```

### Transcription Quality

```yaml
tests:
  - assert:
      - type: contains
        value: expected phrase

      - type: not-contains
        value: incorrect phrase
```

### WER Threshold

```yaml
tests:
  - assert:
      - type: javascript
        value: |
          const wer = context.vars.metadata?.wer?.wer || 1;
          wer < 0.1  // Less than 10% error
```

### Speaker Count

```yaml
tests:
  - assert:
      - type: javascript
        value: |
          const diarization = context.vars.metadata?.transcription?.diarization || [];
          const uniqueSpeakers = new Set(diarization.map(s => s.speaker_id));
          uniqueSpeakers.size === 2  // Expect 2 speakers
```

## Language Support

ElevenLabs STT supports 30+ languages. Specify using ISO 639-1 codes:

```yaml
config:
  language: en # English
  # language: es  # Spanish
  # language: fr  # French
  # language: de  # German
  # language: it  # Italian
  # language: pt  # Portuguese
  # language: ja  # Japanese
  # language: ko  # Korean
  # language: zh  # Chinese
```

**Auto-detection**: Omit `language` to let the API detect the language automatically.

## Cost Information

STT pricing is based on audio duration:

- **Free tier**: 1 hour/month
- **Paid tiers**: ~$0.10 per minute (~$0.00167 per second)

The provider automatically tracks and reports costs in the evaluation results.

## Advanced Usage

### Batch Transcription

```yaml
prompts:
  - audio/batch1.mp3
  - audio/batch2.mp3
  - audio/batch3.mp3

providers:
  - id: elevenlabs:stt
    config:
      modelId: eleven_speech_to_text_v1

# Test all files with consistent assertions
tests:
  - assert:
      - type: cost
        threshold: 0.10
      - type: latency
        threshold: 15000
```

### Multi-language Testing

```yaml
providers:
  - id: elevenlabs:stt:english
    config:
      language: en

  - id: elevenlabs:stt:spanish
    config:
      language: es

  - id: elevenlabs:stt:autodetect
    config:
      # No language specified = auto-detect

prompts:
  - audio/english_sample.mp3
  - audio/spanish_sample.mp3
```

### Accuracy Comparison

Compare transcription accuracy across different audio qualities:

```yaml
prompts:
  - audio/high_quality_48khz.wav
  - audio/medium_quality_16khz.mp3
  - audio/low_quality_8khz.mp3

providers:
  - id: elevenlabs:stt
    config:
      calculateWER: true
      referenceText: This is the expected transcription text

tests:
  - description: High quality should have WER < 5%
    vars:
      audioFile: audio/high_quality_48khz.wav
    assert:
      - type: javascript
        value: (context.vars.metadata?.wer?.wer || 1) < 0.05

  - description: Medium quality should have WER < 10%
    vars:
      audioFile: audio/medium_quality_16khz.mp3
    assert:
      - type: javascript
        value: (context.vars.metadata?.wer?.wer || 1) < 0.10
```

## Troubleshooting

### API Key Issues

```bash
# Verify your API key is set
echo $ELEVENLABS_API_KEY

# Or set it inline
ELEVENLABS_API_KEY=your_key promptfoo eval
```

### Audio File Not Found

```
Error: Failed to read audio file: ENOENT: no such file or directory
```

**Solution**: Use absolute paths or paths relative to the config file:

```yaml
prompts:
  - /absolute/path/to/audio.mp3
  - ./relative/path/to/audio.mp3
```

### Unsupported Format

```
Error: Unsupported audio format
```

**Solution**: Convert your audio to a supported format (MP3, WAV, etc.) using tools like `ffmpeg`:

```bash
ffmpeg -i input.video -vn -acodec mp3 output.mp3
```

### High WER on Clear Audio

If you're getting unexpectedly high WER:

1. **Check reference text** - ensure it exactly matches the audio (including punctuation)
2. **Specify language** - auto-detection may choose the wrong language
3. **Audio quality** - ensure audio is clear with minimal background noise
4. **Normalization** - WER calculation normalizes text (lowercase, removes punctuation)

## API Reference

### Config Options

| Option          | Type    | Default                        | Description                    |
| --------------- | ------- | ------------------------------ | ------------------------------ |
| `modelId`       | string  | `eleven_speech_to_text_v1`     | STT model to use               |
| `language`      | string  | auto-detect                    | ISO 639-1 language code        |
| `diarization`   | boolean | `false`                        | Enable speaker identification  |
| `maxSpeakers`   | number  | -                              | Expected number of speakers    |
| `audioFile`     | string  | -                              | Path to audio file             |
| `audioFormat`   | string  | auto-detect                    | Audio format override          |
| `referenceText` | string  | -                              | Expected transcription for WER |
| `calculateWER`  | boolean | `false`                        | Calculate Word Error Rate      |
| `baseUrl`       | string  | `https://api.elevenlabs.io/v1` | API endpoint                   |
| `timeout`       | number  | `120000`                       | Request timeout (ms)           |
| `retries`       | number  | `3`                            | Number of retry attempts       |

## Related Examples

- [ElevenLabs TTS](../elevenlabs-tts/) - Text-to-Speech synthesis
- [Audio Quality Testing](../audio-quality/) - Audio generation quality metrics

## Resources

- [ElevenLabs STT Documentation](https://elevenlabs.io/docs/speech-to-text)
- [Supported Languages](https://elevenlabs.io/languages)
- [Word Error Rate (WER)](https://en.wikipedia.org/wiki/Word_error_rate)
