# elevenlabs-alignment (ElevenLabs Forced Alignment)

Generate time-aligned subtitles (SRT/VTT) from audio and transcripts using ElevenLabs forced alignment.

## Quick Start

```bash
npx promptfoo@latest init --example elevenlabs-alignment
cd elevenlabs-alignment
export ELEVENLABS_API_KEY=your_api_key_here
npx promptfoo@latest eval
```

## What this tests

- **Subtitle generation**: Create SRT and VTT subtitle files
- **Word-level alignment**: Precise timestamp data for each word
- **Multiple formats**: JSON (raw data), SRT (video players), VTT (web players)
- **Accuracy**: Verify alignment matches audio timing

## How it works

Forced alignment takes two inputs:

1. **Audio file**: Speech recording (MP3, WAV, etc.)
2. **Transcript**: Text of what was spoken

It returns precise timestamps showing when each word was spoken, formatted as subtitles.

## Use Cases

- **Video subtitles**: Generate SRT files for video editing software
- **Web captions**: Create VTT files for HTML5 video players
- **Karaoke apps**: Word-level timing for synchronized highlighting
- **Accessibility**: Auto-generate captions for spoken content
- **Translation sync**: Time-align translations to original audio

## Output Formats

### JSON (Raw alignment data)

```json
{
  "alignment": [
    { "char": "T", "start": 0.0, "end": 0.1 },
    { "char": "h", "start": 0.1, "end": 0.15 }
  ],
  "characters": "That's one small step..."
}
```

### SRT (Standard video subtitles)

```
1
00:00:00,000 --> 00:00:02,500
That's one small step for man

2
00:00:02,500 --> 00:00:05,000
one giant leap for mankind
```

### VTT (WebVTT for web players)

```
WEBVTT

1
00:00:00.000 --> 00:00:02.500
That's one small step for man

2
00:00:02.500 --> 00:00:05.000
one giant leap for mankind
```

## Configuration

### Basic alignment (JSON output)

```yaml
providers:
  - id: elevenlabs:alignment:json
    label: Alignment (JSON)

tests:
  - vars:
      audioFile: path/to/audio.mp3
      transcript: 'Your transcript text here'
      format: json
```

### SRT subtitles

```yaml
providers:
  - id: elevenlabs:alignment:srt
    label: Alignment (SRT Subtitles)

tests:
  - vars:
      audioFile: path/to/audio.mp3
      transcript: 'Your transcript text here'
      format: srt
```

### VTT subtitles

```yaml
providers:
  - id: elevenlabs:alignment:vtt
    label: Alignment (VTT Subtitles)

tests:
  - vars:
      audioFile: path/to/audio.mp3
      transcript: 'Your transcript text here'
      format: vtt
```

## Testing Assertions

```yaml
tests:
  # Verify alignment succeeds
  - assert:
      - type: javascript
        value: output.includes('words') # JSON format
      - type: not-contains
        value: error

  # Verify SRT format
  - assert:
      - type: javascript
        value: output.includes('-->') && output.includes('small step')
```

## Best Practices

1. **Transcript accuracy**: Ensure transcript exactly matches spoken audio
2. **Include punctuation**: Better subtitle chunking and timing
3. **Audio quality**: Clear audio produces more accurate timestamps
4. **Format selection**:
   - Use SRT for video editing (Premiere, Final Cut, DaVinci)
   - Use VTT for web players (HTML5 `<video>` tag)
   - Use JSON for custom processing

## Cost Information

Forced alignment pricing is based on audio duration:

- ~$0.05 per minute of audio

The provider automatically tracks costs in evaluation results.

## Related Examples

- [ElevenLabs STT](../elevenlabs-stt/) - Speech-to-text transcription
- [ElevenLabs Isolation](../elevenlabs-isolation/) - Audio noise removal

## Resources

- [ElevenLabs Alignment API Docs](https://elevenlabs.io/docs/api-reference/alignment)
- [SRT Format Specification](https://en.wikipedia.org/wiki/SubRip)
- [WebVTT Format Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API)
