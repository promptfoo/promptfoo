# elevenlabs-supporting-apis (ElevenLabs Supporting APIs)

Test ElevenLabs supporting APIs for audio processing and conversation management.

## What this tests

- **Conversation History**: Retrieve past agent conversations
- **Audio Isolation**: Remove background noise from audio
- **Forced Alignment**: Generate subtitles from audio and transcript
- **Dubbing**: Multi-language dubbing with speaker preservation

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

## Features

### 1. Conversation History

Retrieve and analyze past agent conversations:

```yaml
providers:
  - id: elevenlabs:history
    config:
      agentId: your_agent_id # Optional for listing
```

**Use cases:**

- Retrieve specific conversation by ID
- List all conversations for an agent
- Filter by date range or status
- Export transcripts and metadata for analysis
- Monitor conversation quality over time

**Prompt formats:**

```yaml
prompts:
  # Get specific conversation
  - 'conv_abc123'

  # List conversations (requires agentId in config)
  - '*'
```

**Context variables:**

- `conversationId` - Specific conversation to retrieve
- `agentId` - Agent to list conversations for
- `status` - Filter by status (completed, failed, timeout)
- `startDate` - ISO 8601 date
- `endDate` - ISO 8601 date
- `limit` - Max conversations to return

### 2. Audio Isolation

Extract clean speech from noisy audio:

```yaml
providers:
  - id: elevenlabs:isolation
    config:
      outputFormat: mp3_44100_128 # Optional
```

**Use cases:**

- Remove background noise from recordings
- Clean audio before STT processing
- Improve audio quality for dubbing
- Extract speech from multi-track audio

**Input:**

- Provide audio file path via prompt or `context.vars.audioFile`
- Supports: MP3, WAV, FLAC, OGG, M4A

**Output:**

- Clean audio with noise removed
- Base64-encoded audio in response
- Metadata: original size, isolated size, format

### 3. Forced Alignment

Generate time-aligned subtitles:

```yaml
providers:
  - id: elevenlabs:alignment
```

**Use cases:**

- Create subtitles (SRT/VTT) from audio + transcript
- Sync translations to original audio timing
- Generate karaoke-style word highlighting
- Time-stamp training data for ML models

**Input:**

- Audio file: `context.vars.audioFile`
- Transcript: prompt or `context.vars.transcript`
- Format: `context.vars.format` (json, srt, vtt)

**Output formats:**

- **JSON**: Complete alignment data with timestamps
- **SRT**: Standard subtitle format for video players
- **VTT**: WebVTT format for web players

**Example SRT output:**

```
1
00:00:00,000 --> 00:00:02,500
Welcome to ElevenLabs

2
00:00:02,500 --> 00:00:05,000
This is a test of forced alignment
```

### 4. Dubbing

Multi-language dubbing with speaker preservation:

```yaml
providers:
  - id: elevenlabs:dubbing:es # Target language
    config:
      targetLanguage: es # Spanish
      sourceLanguage: en # Optional (auto-detected if omitted)
      numSpeakers: 2 # Optional hint
      watermark: false # Optional
```

**Use cases:**

- Dub videos to different languages
- Preserve original speaker voices
- Maintain timing and emotional tone
- Create multilingual content at scale

**Supported languages:**

- Spanish (es), French (fr), German (de)
- Portuguese (pt), Italian (it), Polish (pl)
- Hindi (hi), Japanese (ja), Korean (ko)
- Chinese (zh), Arabic (ar)
- And 20+ more languages

**Input:**

- File: `context.vars.sourceFile` (MP4, MP3, WAV, etc.)
- URL: `context.vars.sourceUrl` (YouTube, Vimeo, etc.)

**Processing:**

- Async processing (polls every 5 seconds)
- Max wait time: 5 minutes
- Returns dubbed audio when complete

**Output:**

- Dubbed audio in target language
- Metadata: source language (detected), duration, speakers
- Progress tracking during processing

## Testing Workflows

### Conversation Analysis Pipeline

```yaml
# 1. Run agent conversation
providers:
  - id: elevenlabs:agents

# 2. Retrieve conversation history
providers:
  - id: elevenlabs:history

# 3. Analyze patterns across conversations
tests:
  - assert:
      - type: javascript
        value: |
          const convs = JSON.parse(output);
          return convs.total_conversations > 10;
```

### Audio Processing Pipeline

```yaml
# 1. Isolate noisy audio
providers:
  - id: elevenlabs:isolation

# 2. Transcribe cleaned audio
providers:
  - id: elevenlabs:stt

# 3. Generate subtitles
providers:
  - id: elevenlabs:alignment
```

### Localization Pipeline

```yaml
# 1. Generate English audio
providers:
  - id: elevenlabs:tts

# 2. Dub to Spanish
providers:
  - id: elevenlabs:dubbing:es

# 3. Dub to French
providers:
  - id: elevenlabs:dubbing:fr
```

## Cost Considerations

**Audio Isolation**: ~$0.10 per minute of audio
**Forced Alignment**: ~$0.05 per minute of audio
**Dubbing**: ~$0.50 per minute of audio (varies by language)
**Conversation History**: Free (API call only)

Costs are approximate and may vary based on audio quality and complexity.

## Best Practices

### Audio Isolation

- Use highest quality source audio available
- Isolation works best with clear speech + consistent background noise
- For music removal, consider manual audio editing first

### Forced Alignment

- Ensure transcript matches audio exactly
- Include punctuation for better timing
- Use SRT format for video subtitles, VTT for web

### Dubbing

- Provide `numSpeakers` hint for better speaker separation
- Shorter videos (<5 min) process faster
- Set `sourceLanguage` explicitly when possible (faster processing)
- Use `watermark: false` for production content

### Conversation History

- Implement pagination for large conversation lists
- Filter by date range to reduce API response size
- Cache conversation data locally for analytics

## Learn more

- [ElevenLabs Audio Isolation Docs](https://elevenlabs.io/docs/api-reference/audio-isolation)
- [Forced Alignment Guide](https://elevenlabs.io/docs/api-reference/alignment)
- [Dubbing Documentation](https://elevenlabs.io/docs/api-reference/dubbing)
- [Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai)
- [Pricing](https://elevenlabs.io/pricing)
