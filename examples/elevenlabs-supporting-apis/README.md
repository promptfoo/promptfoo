# elevenlabs-supporting-apis (ElevenLabs Supporting APIs Reference)

**Note:** This is a reference/documentation example showing configuration patterns for ElevenLabs supporting APIs. For working, runnable examples, see:

- [elevenlabs-isolation](../elevenlabs-isolation/) - Audio noise removal
- [elevenlabs-alignment](../elevenlabs-alignment/) - Subtitle generation
- [elevenlabs-agents](../elevenlabs-agents/) - Agent conversations (includes history API)

## Supported APIs

This reference demonstrates configuration for:

- **Conversation History** (`elevenlabs:history`) - Retrieve past agent conversations
- **Audio Isolation** (`elevenlabs:isolation`) - Remove background noise from audio
- **Forced Alignment** (`elevenlabs:alignment`) - Generate subtitles from audio and transcript

## Configuration Patterns

See `promptfooconfig.yaml` for examples of:

- Provider configuration for each API type
- Required variables (`audioFile`, `transcript`, `conversationId`, etc.)
- Output format options (`json`, `srt`, `vtt`)
- Test assertion patterns

## Running Working Examples

For actual testing, use the individual provider examples:

```bash
# Audio isolation
cd ../elevenlabs-isolation
npx promptfoo@latest eval

# Forced alignment / subtitles
cd ../elevenlabs-alignment
npx promptfoo@latest eval

# Conversational agents (includes history)
cd ../elevenlabs-agents
npx promptfoo@latest eval
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

## Cost Considerations

**Audio Isolation**: ~$0.10 per minute of audio
**Forced Alignment**: ~$0.05 per minute of audio
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

### Conversation History

- Implement pagination for large conversation lists
- Filter by date range to reduce API response size
- Cache conversation data locally for analytics

## Learn more

- [ElevenLabs Audio Isolation Docs](https://elevenlabs.io/docs/api-reference/audio-isolation)
- [Forced Alignment Guide](https://elevenlabs.io/docs/api-reference/alignment)
- [Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai)
- [Pricing](https://elevenlabs.io/pricing)
