---
title: 'ElevenLabs'
description: 'Test ElevenLabs AI audio capabilities: Text-to-Speech, Speech-to-Text, Conversational Agents, and audio processing tools'
---

# ElevenLabs

The ElevenLabs provider integrates multiple AI audio capabilities for comprehensive voice AI testing and evaluation.

:::tip

For a comprehensive step-by-step tutorial, see the [Evaluating ElevenLabs voice AI guide](/docs/guides/evaluate-elevenlabs/).

:::

## Quick Start

Get started with ElevenLabs in 3 steps:

1. **Install and authenticate:**

   ```sh
   npm install -g promptfoo
   export ELEVENLABS_API_KEY=your_api_key_here
   ```

2. **Create a config file** (`promptfooconfig.yaml`):

   ```yaml
   prompts:
     - 'Welcome to our customer service. How can I help you today?'

   providers:
     - id: elevenlabs:tts:rachel

   tests:
     - description: Generate welcome message
       assert:
         - type: cost
           threshold: 0.01
         - type: latency
           threshold: 2000
   ```

3. **Run your first eval:**

   ```sh
   promptfoo eval
   ```

   View results with `promptfoo view` or in the web UI.

## Setup

Set your ElevenLabs API key as an environment variable:

```sh
export ELEVENLABS_API_KEY=your_api_key_here
```

Alternatively, specify the API key directly in your configuration:

```yaml
providers:
  - id: elevenlabs:tts
    config:
      apiKey: your_api_key_here
```

:::tip
Get your API key from [ElevenLabs Settings](https://elevenlabs.io/app/settings/api-keys). Free tier includes 10,000 characters/month.
:::

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
      modelId: scribe_v1
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

## Configuration Parameters

All providers support these common parameters:

| Parameter       | Description                                       |
| --------------- | ------------------------------------------------- |
| `apiKey`        | Your ElevenLabs API key                           |
| `apiKeyEnvar`   | Environment variable containing the API key       |
| `baseUrl`       | Custom base URL for API (default: ElevenLabs API) |
| `timeout`       | Request timeout in milliseconds                   |
| `cache`         | Enable response caching                           |
| `cacheTTL`      | Cache time-to-live in seconds                     |
| `enableLogging` | Enable debug logging                              |
| `retries`       | Number of retry attempts for failed requests      |

### TTS-Specific Parameters

| Parameter                 | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `modelId`                 | TTS model (e.g., `eleven_flash_v2_5`)                       |
| `voiceId`                 | Voice ID or name (e.g., `21m00Tcm4TlvDq8ikWAM` or `rachel`) |
| `voiceSettings`           | Voice customization (stability, similarity, style, speed)   |
| `outputFormat`            | Audio format (e.g., `mp3_44100_128`, `pcm_44100`)           |
| `seed`                    | Seed for deterministic output                               |
| `streaming`               | Enable WebSocket streaming for low latency                  |
| `pronunciationDictionary` | Custom pronunciation rules                                  |
| `voiceDesign`             | Generate voice from text description                        |
| `voiceRemix`              | Modify voice characteristics (gender, accent, age)          |

### STT-Specific Parameters

| Parameter     | Description                                |
| ------------- | ------------------------------------------ |
| `modelId`     | STT model (default: `scribe_v1`)           |
| `language`    | ISO 639-1 language code (e.g., `en`, `es`) |
| `diarization` | Enable speaker diarization                 |
| `maxSpeakers` | Expected number of speakers (hint)         |
| `audioFormat` | Input audio format                         |

### Agent-Specific Parameters

| Parameter            | Description                               |
| -------------------- | ----------------------------------------- |
| `agentId`            | Use existing agent ID                     |
| `agentConfig`        | Ephemeral agent configuration             |
| `simulatedUser`      | Automated user simulation settings        |
| `evaluationCriteria` | Evaluation criteria for agent performance |
| `toolMockConfig`     | Mock tool responses for testing           |
| `maxTurns`           | Maximum conversation turns (default: 10)  |
| `llmCascade`         | LLM fallback configuration                |
| `customLLM`          | Custom LLM endpoint configuration         |
| `mcpConfig`          | Model Context Protocol integration        |
| `multiVoice`         | Multi-voice conversation configuration    |
| `postCallWebhook`    | Webhook notification after conversation   |
| `phoneConfig`        | Twilio or SIP phone integration           |

## Examples

### Text-to-Speech: Voice Comparison

```yaml
prompts:
  - 'Welcome to ElevenLabs. Our AI voice technology delivers natural-sounding speech.'

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
        - word: 'API'
          pronunciation: 'A P I'
        - word: 'OAuth'
          phoneme: 'əʊɔːθ'
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

View costs in eval results:

```yaml
tests:
  - assert:
      - type: cost
        threshold: 0.50 # Max $0.50 per test
```

## Popular Voices

Common voice IDs and names:

| Name   | ID                   | Description        |
| ------ | -------------------- | ------------------ |
| Rachel | 21m00Tcm4TlvDq8ikWAM | Calm, clear female |
| Clyde  | 2EiwWnXFnvU5JabPnv8n | Warm male          |
| Drew   | 29vD33N1CtxCmqQRPOHJ | Well-rounded male  |
| Paul   | 5Q0t7uMcjvnagumLfvZi | Casual male        |
| Domi   | AZnzlk1XvdvUeBnXmlld | Energetic female   |
| Bella  | EXAVITQu4vr4xnSDxMaL | Expressive female  |
| Antoni | ErXwobaYiN019PkySvjV | Deep male          |
| Elli   | MF3mGyEYCl7XYWbV9V6O | Young female       |

## Common Workflows

### Voice Quality Testing

Compare voice quality across models and voices:

```yaml
prompts:
  - 'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet.'

providers:
  - id: flash-model
    label: Flash Model (Fastest)
    config:
      modelId: eleven_flash_v2_5
      voiceId: rachel

  - id: turbo-model
    label: Turbo Model (Best Quality)
    config:
      modelId: eleven_turbo_v2_5
      voiceId: rachel

tests:
  - description: Flash model completes quickly
    provider: flash-model
    assert:
      - type: latency
        threshold: 1000

  - description: Turbo model has better quality
    provider: turbo-model
    assert:
      - type: cost
        threshold: 0.01
```

### Transcription Accuracy Pipeline

Test end-to-end TTS → STT accuracy:

```yaml
prompts:
  - |
    The meeting is scheduled for Thursday at 2 PM in conference room B.
    Please bring your laptop and quarterly report.

providers:
  - id: tts-generator
    label: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5

  - id: stt-transcriber
    label: elevenlabs:stt
    config:
      calculateWER: true

tests:
  - vars:
      referenceText: 'The meeting is scheduled for Thursday at 2 PM in conference room B. Please bring your laptop and quarterly report.'
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          if (result.wer_result) {
            return result.wer_result.wer < 0.03; // Less than 3% error
          }
          return true;
```

### Agent Regression Testing

Ensure agent improvements don't degrade performance:

```yaml
prompts:
  - |
    User: I need to cancel my subscription
    User: Yes, I'm sure
    User: Account email is user@example.com

providers:
  - id: elevenlabs:agents
    config:
      agentConfig:
        prompt: You are a customer service agent. Always confirm cancellations.
        llmModel: gpt-4o
      evaluationCriteria:
        - name: confirmation_requested
          description: Agent asks for confirmation before canceling
          weight: 1.0
          passingThreshold: 0.9
        - name: professional_tone
          description: Agent maintains professional tone
          weight: 0.8
          passingThreshold: 0.8

tests:
  - description: Agent handles cancellation properly
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          const criteria = result.analysis.evaluation_criteria_results;
          return criteria.every(c => c.passed);
```

## Best Practices

### 1. Choose the Right Model

- **Flash v2.5**: Use for real-time applications, live streaming, or when latency is critical (&lt;200ms)
- **Turbo v2.5**: Use for high-quality pre-recorded content where quality matters more than speed
- **Multilingual v2**: Use for non-English languages or when switching between languages
- **Monolingual v1**: Use for English-only content requiring the highest quality

### 2. Optimize Voice Settings

**For natural conversation:**

```yaml
voiceSettings:
  stability: 0.5 # More variation
  similarity_boost: 0.75
  speed: 1.0
```

**For consistent narration:**

```yaml
voiceSettings:
  stability: 0.8 # Less variation
  similarity_boost: 0.85
  speed: 0.95
```

**For expressiveness:**

```yaml
voiceSettings:
  stability: 0.3 # High variation
  similarity_boost: 0.5
  style: 0.8 # Amplify style
  speed: 1.1
```

### 3. Cost Optimization

**Use caching for repeated phrases:**

```yaml
providers:
  - id: elevenlabs:tts:rachel
    config:
      cache: true
      cacheTTL: 86400 # 24 hours
```

**Implement LLM cascading for agents:**

```yaml
providers:
  - id: elevenlabs:agents
    config:
      llmCascade:
        primary: gpt-4o-mini # Cheaper first
        fallback:
          - gpt-4o # Better fallback
        cascadeOnError: true
```

**Test with shorter prompts during development:**

```yaml
providers:
  - id: elevenlabs:tts:rachel
tests:
  - vars:
      shortPrompt: 'Test' # Use during dev
      fullPrompt: 'Full production message'
```

### 4. Agent Testing Strategy

**Start simple, add complexity incrementally:**

```yaml
# Phase 1: Basic functionality
evaluationCriteria:
  - name: responds
    description: Agent responds to user
    weight: 1.0

# Phase 2: Add quality checks
evaluationCriteria:
  - name: responds
    weight: 0.8
  - name: accurate
    description: Response is factually correct
    weight: 1.0

# Phase 3: Add conversation flow
evaluationCriteria:
  - name: responds
    weight: 0.6
  - name: accurate
    weight: 1.0
  - name: natural_flow
    description: Conversation feels natural
    weight: 0.8
```

### 5. Audio Quality Assurance

**Always test on target platforms:**

```yaml
providers:
  - id: elevenlabs:tts:rachel
    config:
      outputFormat: mp3_44100_128 # Good for web
      # outputFormat: pcm_44100      # Better for phone systems
      # outputFormat: mp3_22050_32   # Smaller files for mobile
```

**Test with diverse content:**

```yaml
prompts:
  # Numbers and dates
  - 'Your appointment is on March 15th at 3:30 PM. Confirmation number: 4829.'

  # Technical terms
  - 'The API returns a JSON response with OAuth2 authentication tokens.'

  # Multi-language
  - 'Bonjour! Welcome to our multilingual support.'

  # Edge cases
  - 'Hello... um... can you hear me? Testing, 1, 2, 3.'
```

### 6. Monitoring and Observability

**Track key metrics:**

```yaml
tests:
  - assert:
      # Latency thresholds
      - type: latency
        threshold: 2000

      # Cost budgets
      - type: cost
        threshold: 0.50

      # Quality metrics
      - type: javascript
        value: |
          // Track custom metrics
          const result = JSON.parse(output);
          if (result.audio) {
            console.log('Audio size:', result.audio.sizeBytes);
            console.log('Format:', result.audio.format);
          }
          return true;
```

**Use labels for organized results:**

```yaml
providers:
  - label: v1-baseline
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5

  - label: v2-improved
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5
      voiceSettings:
        stability: 0.6 # Tweaked setting
```

## Troubleshooting

### API Key Issues

**Error: `ELEVENLABS_API_KEY environment variable is not set`**

Solution: Ensure your API key is properly set:

```sh
# Check if key is set
echo $ELEVENLABS_API_KEY

# Set it if missing
export ELEVENLABS_API_KEY=your_key_here

# Or add to your shell profile
echo 'export ELEVENLABS_API_KEY=your_key' >> ~/.zshrc
source ~/.zshrc
```

### Authentication Errors

**Error: `401 Unauthorized`**

Solution: Verify your API key is valid:

```sh
# Test API key directly
curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices
```

If this fails, regenerate your API key at [ElevenLabs Settings](https://elevenlabs.io/app/settings/api-keys).

### Rate Limiting

**Error: `429 Too Many Requests`**

Solution: Add retry logic and respect rate limits:

```yaml
providers:
  - id: elevenlabs:tts:rachel
    config:
      retries: 3 # Retry failed requests
      timeout: 30000 # Allow time for retries
```

For high-volume testing, consider:

- Spreading tests over time
- Upgrading to a paid plan
- Using caching to avoid redundant requests

### Audio File Issues

**Error: `Failed to read audio file` or `Unsupported audio format`**

Solution: Ensure audio files are accessible and in supported formats:

```yaml
providers:
  - id: elevenlabs:stt
    config:
      audioFormat: mp3 # Supported: mp3, wav, flac, ogg, webm, m4a
```

Verify file exists:

```sh
ls -lh /path/to/audio.mp3
file /path/to/audio.mp3
```

### Agent Conversation Timeouts

**Error: `Conversation timeout after X turns`**

Solution: Adjust conversation limits:

```yaml
providers:
  - id: elevenlabs:agents
    config:
      maxTurns: 20 # Increase if needed
      timeout: 120000 # 2 minutes
```

### Memory Issues with Large Evals

**Error: `JavaScript heap out of memory`**

Solution: Increase Node.js memory:

```sh
export NODE_OPTIONS="--max-old-space-size=4096"
promptfoo eval
```

Or run fewer concurrent tests:

```sh
promptfoo eval --max-concurrency 2
```

### Voice Not Found

**Error: `Voice ID not found`**

Solution: Use correct voice ID or name:

```yaml
providers:
  # Use official voice ID (preferred)
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM

  # Or use voice name (case-sensitive)
  - id: elevenlabs:tts:Rachel
```

List available voices:

```sh
curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices
```

### Cost Tracking Inaccuracies

**Issue: Cost estimates don't match billing**

Solution: Cost tracking is estimated based on:

- TTS: Character count × model rate
- STT: Audio duration × per-minute rate
- Agents: Conversation duration × LLM rates

For exact costs, check your [ElevenLabs billing dashboard](https://elevenlabs.io/app/usage).

## Examples

Complete working examples:

- [TTS Basic](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-tts) - Simple voice generation
- [TTS Advanced](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-tts-advanced) - Voice design, streaming, pronunciation
- [STT](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-stt) - Transcription with diarization
- [Agents Basic](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-agents) - Simple agent testing
- [Agents Advanced](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-agents-advanced) - Multi-voice, tools, LLM cascading
- [Supporting APIs](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-supporting-apis) - Audio processing pipeline

## Learn More

### Promptfoo Resources

- [Evaluating ElevenLabs voice AI](/docs/guides/evaluate-elevenlabs/) - Step-by-step tutorial

### ElevenLabs Resources

- [ElevenLabs API Documentation](https://elevenlabs.io/docs/introduction)
- [Voice Library](https://elevenlabs.io/voice-library) - Browse and preview voices
- [Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai) - Agent setup guide
- [Pricing](https://elevenlabs.io/pricing) - Plan comparison
- [Status Page](https://status.elevenlabs.io/) - API status and incidents
