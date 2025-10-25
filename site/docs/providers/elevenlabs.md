---
description: "Test ElevenLabs AI audio capabilities: Text-to-Speech, Speech-to-Text, Conversational Agents, and audio processing tools"
---

# ElevenLabs

The ElevenLabs provider integrates multiple AI audio capabilities for comprehensive voice AI testing and evaluation.

## Setup

Set your ElevenLabs API key:

```sh
export ELEVENLABS_API_KEY=your_api_key_here
```

Alternatively, specify the API key in your configuration:

```yaml
providers:
  - id: elevenlabs:tts
    config:
      apiKey: your_api_key_here
```

## Capabilities

The ElevenLabs provider supports multiple capabilities:

### Text-to-Speech (TTS)

Generate high-quality voice synthesis with multiple models and voices:

- `elevenlabs:tts:<voice_name>` - TTS with specified voice (e.g., `elevenlabs:tts:rachel`)
- `elevenlabs:tts` - TTS with default voice

**Models available:**

- `eleven_flash_v2_5` - Fastest, lowest latency (~200ms)
- `eleven_turbo_v2_5` - High quality, fast
- `eleven_multilingual_v2` - Best for non-English languages
- `eleven_monolingual_v1` - English only, high quality

**Example:**

```yaml
providers:
  - id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5
      voiceSettings:
        stability: 0.5
        similarity_boost: 0.75
        speed: 1.0
```

### Speech-to-Text (STT)

Transcribe audio with speaker diarization and accuracy metrics:

- `elevenlabs:stt` - Speech-to-text transcription

**Features:**

- Speaker diarization (identify multiple speakers)
- Word Error Rate (WER) calculation
- Multiple language support

**Example:**

```yaml
providers:
  - id: elevenlabs:stt
    config:
      modelId: eleven_speech_to_text_v1
      diarization: true
      maxSpeakers: 3
```

### Conversational Agents

Test voice AI agents with LLM backends and evaluation criteria:

- `elevenlabs:agents` - Voice AI agent testing

**Features:**

- Multi-turn conversation simulation
- Automated evaluation criteria
- Tool calling and mocking
- LLM cascading for cost optimization
- Custom LLM endpoints
- Multi-voice conversations
- Phone integration (Twilio, SIP)

**Example:**

```yaml
providers:
  - id: elevenlabs:agents
    config:
      agentConfig:
        name: Customer Support Agent
        prompt: You are a helpful support agent
        voiceId: 21m00Tcm4TlvDq8ikWAM
        llmModel: gpt-4o
      evaluationCriteria:
        - name: helpfulness
          description: Agent provides helpful responses
          weight: 1.0
          passingThreshold: 0.8
```

### Supporting APIs

Additional audio processing capabilities:

- `elevenlabs:history` - Retrieve agent conversation history
- `elevenlabs:isolation` - Remove background noise from audio
- `elevenlabs:alignment` - Generate time-aligned subtitles
- `elevenlabs:dubbing:<language>` - Multi-language dubbing

## Configuration Parameters

All providers support these common parameters:

| Parameter      | Description                                       |
| -------------- | ------------------------------------------------- |
| `apiKey`       | Your ElevenLabs API key                           |
| `apiKeyEnvar`  | Environment variable containing the API key       |
| `baseUrl`      | Custom base URL for API (default: ElevenLabs API) |
| `timeout`      | Request timeout in milliseconds                   |
| `cache`        | Enable response caching                           |
| `cacheTTL`     | Cache time-to-live in seconds                     |
| `enableLogging | Enable debug logging                                |
| `retries`      | Number of retry attempts for failed requests      |

### TTS-Specific Parameters

| Parameter               | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `modelId`               | TTS model (e.g., `eleven_flash_v2_5`)                        |
| `voiceId`               | Voice ID or name (e.g., `21m00Tcm4TlvDq8ikWAM` or `rachel`)  |
| `voiceSettings`         | Voice customization (stability, similarity, style, speed)    |
| `outputFormat`          | Audio format (e.g., `mp3_44100_128`, `pcm_44100`)            |
| `seed`                  | Seed for deterministic output                                |
| `streaming`             | Enable WebSocket streaming for low latency                   |
| `pronunciationDictionary` | Custom pronunciation rules                                 |
| `voiceDesign`           | Generate voice from text description                         |
| `voiceRemix`            | Modify voice characteristics (gender, accent, age)           |

### STT-Specific Parameters

| Parameter     | Description                                     |
| ------------- | ----------------------------------------------- |
| `modelId`     | STT model (default: `eleven_speech_to_text_v1`) |
| `language`    | ISO 639-1 language code (e.g., `en`, `es`)      |
| `diarization` | Enable speaker diarization                      |
| `maxSpeakers` | Expected number of speakers (hint)              |
| `audioFormat` | Input audio format                              |

### Agent-Specific Parameters

| Parameter              | Description                                  |
| ---------------------- | -------------------------------------------- |
| `agentId`              | Use existing agent ID                        |
| `agentConfig`          | Ephemeral agent configuration                |
| `simulatedUser`        | Automated user simulation settings           |
| `evaluationCriteria`   | Evaluation criteria for agent performance    |
| `toolMockConfig`       | Mock tool responses for testing              |
| `maxTurns`             | Maximum conversation turns (default: 10)     |
| `llmCascade`           | LLM fallback configuration                   |
| `customLLM`            | Custom LLM endpoint configuration            |
| `mcpConfig`            | Model Context Protocol integration           |
| `multiVoice`           | Multi-voice conversation configuration       |
| `postCallWebhook`      | Webhook notification after conversation      |
| `phoneConfig`          | Twilio or SIP phone integration              |

## Examples

### Text-to-Speech: Voice Comparison

```yaml
prompts:
  - "Welcome to ElevenLabs. Our AI voice technology delivers natural-sounding speech."

providers:
  - id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5

  - id: elevenlabs:tts:clyde
    config:
      modelId: eleven_turbo_v2_5

tests:
  - description: Audio generation succeeds
    assert:
      - type: cost
        threshold: 0.01
      - type: latency
        threshold: 5000
```

### Speech-to-Text: Accuracy Testing

```yaml
prompts:
  - file://audio/test-recording.mp3

providers:
  - id: elevenlabs:stt
    config:
      diarization: true

tests:
  - description: WER is acceptable
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          return result.wer < 0.05; // Less than 5% error
```

### Conversational Agents: Evaluation

```yaml
prompts:
  - |
    User: I need help with my order
    Agent: I'd be happy to help! What's your order number?
    User: ORDER-12345

providers:
  - id: elevenlabs:agents
    config:
      agentConfig:
        prompt: You are a helpful customer support agent
        llmModel: gpt-4o
      evaluationCriteria:
        - name: greeting
          weight: 0.8
          passingThreshold: 0.8
        - name: understanding
          weight: 1.0
          passingThreshold: 0.9

tests:
  - description: Agent meets evaluation criteria
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          const passed = result.analysis.evaluation_criteria_results.filter(r => r.passed);
          return passed.length >= 2;
```

### Audio Processing: Pipeline

```yaml
# 1. Remove noise from audio
providers:
  - id: elevenlabs:isolation

# 2. Transcribe cleaned audio
providers:
  - id: elevenlabs:stt

# 3. Generate subtitles
providers:
  - id: elevenlabs:alignment
```

## Advanced Features

### Pronunciation Dictionaries

Customize pronunciation for technical terms:

```yaml
providers:
  - id: elevenlabs:tts:rachel
    config:
      pronunciationDictionary:
        - word: "API"
          pronunciation: "A P I"
        - word: "OAuth"
          phoneme: "əʊɔːθ"
```

### Voice Design

Generate custom voices from descriptions:

```yaml
providers:
  - id: elevenlabs:tts
    config:
      voiceDesign:
        name: Custom Voice
        description: A middle-aged American male with a deep, authoritative tone
        gender: male
        age: middle_aged
        accent: american
```

### LLM Cascading

Optimize costs with automatic fallback:

```yaml
providers:
  - id: elevenlabs:agents
    config:
      llmCascade:
        primary: gpt-4o
        fallback:
          - gpt-4o-mini
          - gpt-3.5-turbo
        cascadeOnError: true
        cascadeOnLatency:
          enabled: true
          maxLatencyMs: 5000
```

### Multi-voice Conversations

Different voices for different characters:

```yaml
providers:
  - id: elevenlabs:agents
    config:
      multiVoice:
        characters:
          - name: Agent
            voiceId: 21m00Tcm4TlvDq8ikWAM
            role: Customer support representative
          - name: Customer
            voiceId: 2EiwWnXFnvU5JabPnv8n
            role: Customer seeking help
```

### Phone Integration

Test agents with real phone calls:

```yaml
providers:
  - id: elevenlabs:agents
    config:
      phoneConfig:
        provider: twilio
        twilioAccountSid: ${TWILIO_ACCOUNT_SID}
        twilioAuthToken: ${TWILIO_AUTH_TOKEN}
        twilioPhoneNumber: +1234567890
```

## Cost Tracking

ElevenLabs usage is tracked automatically:

**TTS Costs:**

- Flash v2.5: ~$0.015 per 1,000 characters
- Turbo v2.5: ~$0.02 per 1,000 characters
- Multilingual v2: ~$0.03 per 1,000 characters

**STT Costs:**

- ~$0.10 per minute of audio

**Agent Costs:**

- Based on conversation duration (~$0.10-0.50 per minute depending on LLM)

**Supporting API Costs:**

- Audio Isolation: ~$0.10 per minute
- Forced Alignment: ~$0.05 per minute
- Dubbing: ~$0.50 per minute

View costs in eval results:

```yaml
tests:
  - assert:
      - type: cost
        threshold: 0.50 # Max $0.50 per test
```

## Popular Voices

Common voice IDs and names:

| Name     | ID                       | Description          |
| -------- | ------------------------ | -------------------- |
| Rachel   | 21m00Tcm4TlvDq8ikWAM     | Calm, clear female   |
| Clyde    | 2EiwWnXFnvU5JabPnv8n     | Warm male            |
| Drew     | 29vD33N1CtxCmqQRPOHJ     | Well-rounded male    |
| Paul     | 5Q0t7uMcjvnagumLfvZi     | Casual male          |
| Domi     | AZnzlk1XvdvUeBnXmlld     | Energetic female     |
| Bella    | EXAVITQu4vr4xnSDxMaL     | Expressive female    |
| Antoni   | ErXwobaYiN019PkySvjV     | Deep male            |
| Elli     | MF3mGyEYCl7XYWbV9V6O     | Young female         |

## Examples

- [TTS Basic](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-tts)
- [TTS Advanced](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-tts-advanced)
- [STT](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-stt)
- [Agents Basic](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-agents)
- [Agents Advanced](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-agents-advanced)
- [Supporting APIs](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-supporting-apis)

## Learn More

- [ElevenLabs API Documentation](https://elevenlabs.io/docs/introduction)
- [Voice Library](https://elevenlabs.io/voice-library)
- [Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai)
- [Pricing](https://elevenlabs.io/pricing)
