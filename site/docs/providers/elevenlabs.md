---
title: 'ElevenLabs'
description: 'Test ElevenLabs AI audio capabilities: Text-to-Speech, Speech-to-Text, Conversational Agents, and audio processing tools'
---

# ElevenLabs

The ElevenLabs provider integrates multiple AI audio capabilities for voice AI testing and evaluation.

:::tip

For a step-by-step tutorial, see the [Evaluating ElevenLabs voice AI guide](/docs/guides/evaluate-elevenlabs/).

:::

## Quick Start

Get started with ElevenLabs in 3 steps:

1. **Install and authenticate:**

   ```sh
   npm install -g promptfoo
   export ELEVENLABS_API_KEY=your_api_key_here
   ```

2. **Create a config file** (`promptfooconfig.yaml`):

   ```yaml title="promptfooconfig.yaml"
   # yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
   prompts:
     - 'Welcome to our customer service. How can I help you today?'

   providers:
     - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM

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

- `elevenlabs:tts:<voice_id>` - TTS with specified voice ID (e.g., `elevenlabs:tts:21m00Tcm4TlvDq8ikWAM` for Rachel)
- `elevenlabs:tts` - TTS with default voice

Use a voice ID from your [ElevenLabs voice list](https://elevenlabs.io/docs/api-reference/voices/search), not a display name such as `rachel`. Set it in the provider ID or `config.voiceId`; an explicit `voiceId` takes precedence. Voice availability depends on your account.

**Models available:**

- `eleven_flash_v2_5` - Fastest, lowest latency (~200ms)
- `eleven_turbo_v2_5` - Deprecated low-latency model; prefer Flash v2.5 for new configurations
- `eleven_multilingual_v2` - Default model, suited to consistent long-form speech

[ElevenLabs scheduled monolingual and multilingual v1 for removal on July 9, 2026](https://elevenlabs.io/docs/changelog/2026/6/8). Legacy type values remain for compatible endpoints; use a current model for the native API.

**Example:**

```yaml
providers:
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
    config:
      modelId: eleven_flash_v2_5
      voiceSettings:
        stability: 0.5
        similarity_boost: 0.75
        speed: 1.0
```

### Speech-to-Text (STT)

Transcribe audio with speaker diarization and accuracy metrics. The default is `scribe_v2`; [ElevenLabs scheduled Scribe v1 for removal on July 9, 2026](https://elevenlabs.io/docs/changelog/2026/6/8). The legacy `modelId: scribe_v1` remains configurable for compatible endpoints.

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
      modelId: scribe_v2
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

| Parameter                   | Description                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `modelId`                   | TTS model (e.g., `eleven_flash_v2_5`)                                                        |
| `voiceId`                   | Voice ID (e.g., `21m00Tcm4TlvDq8ikWAM`)                                                      |
| `voiceSettings`             | Voice customization (stability, similarity, style, speed)                                    |
| `outputFormat`              | Audio format (e.g., `mp3_44100_128`, `pcm_44100`)                                            |
| `seed`                      | Best-effort repeatability for HTTP and WebSocket TTS; deterministic output is not guaranteed |
| `streaming`                 | Enable WebSocket streaming for low latency                                                   |
| `pronunciationRules`        | Custom pronunciation rules (creates a dictionary at init)                                    |
| `pronunciationDictionaryId` | Apply an existing pronunciation dictionary by ID                                             |
| `voiceDesign`               | Generate voice from text description                                                         |
| `voiceRemix`                | Modify voice characteristics (gender, accent, age)                                           |

`ulaw_8000` returns raw 8 kHz μ-law audio with media type `audio/basic`. Saved files use the `.ulaw` extension.

### STT-Specific Parameters

| Parameter     | Description                                |
| ------------- | ------------------------------------------ |
| `modelId`     | STT model (default: `scribe_v2`)           |
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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Welcome to ElevenLabs. Our AI voice technology delivers natural-sounding speech.'

providers:
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
    config:
      modelId: eleven_flash_v2_5

  - id: elevenlabs:tts:2EiwWnXFnvU5JabPnv8n
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

Use the [transcription accuracy guide](/docs/guides/evaluate-elevenlabs/#part-3-speech-to-text-accuracy) to provide a recording and reference transcript, then assert on the word error rate in `context.providerResponse.metadata.wer`.

### Conversational Agents: Evaluation

The provider returns a text summary in `output` and structured evaluation results in `context.providerResponse.metadata.evaluationResults`. Use explicit criterion IDs to check that every required result is present and passed.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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
        - id: greeting
          name: greeting
          weight: 0.8
          passingThreshold: 0.8
        - id: understanding
          name: understanding
          weight: 1.0
          passingThreshold: 0.9

tests:
  - description: Agent meets evaluation criteria
    assert:
      - type: javascript
        value: |
          const results = context.providerResponse.metadata?.evaluationResults;
          const required = ['greeting', 'understanding'];
          return Array.isArray(results) && required.every(id =>
            results.some(result => result.criterion === id && result.passed === true)
          );
```

### Audio Processing: Pipeline

Run each stage as a separate eval and pass the saved results to the next stage:

1. Use `elevenlabs:isolation` with the original audio path in `vars.audioFile`. Save the returned audio to a file such as `audio/cleaned.mp3`.
2. Use `elevenlabs:stt` with `prompts: ['{{audioFile}}']` and `vars.audioFile: audio/cleaned.mp3`. Save the transcription text from the output.
3. Use `elevenlabs:alignment` with the cleaned audio path in `vars.audioFile` and the transcription in `vars.transcript` to generate time-aligned output.

## Advanced Features

### Pronunciation Dictionaries

Customize pronunciation for technical terms:

```yaml
providers:
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
    config:
      pronunciationRules:
        - word: 'API'
          pronunciation: 'A P I'
        - word: 'OAuth'
          phoneme: 'əʊɔːθ'
          alphabet: 'ipa'
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

Promptfoo reports estimated costs when the provider has enough usage information. Estimates use built-in rates and may differ from your bill; consult [ElevenLabs pricing](https://elevenlabs.io/pricing) for current plans and rates.

STT estimates require a known audio duration in the API response's `duration_ms` field. Responses without duration omit `cost`; they do not report free transcription. A `cost` assertion requires a reported cost, so omit it for native Scribe responses without duration.

For responses that include a cost estimate, apply a budget assertion:

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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet.'

providers:
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
    label: Flash Model (Fastest)
    config:
      modelId: eleven_flash_v2_5

  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
    label: Turbo Model (Legacy Comparison)
    config:
      modelId: eleven_turbo_v2_5

tests:
  - description: Audio generation completes quickly
    assert:
      - type: latency
        threshold: 1000

  - description: Audio generation stays within the cost budget
    assert:
      - type: cost
        threshold: 0.01
```

### Transcription Accuracy Pipeline

Generate and save speech in a TTS eval, then pass the saved audio file path and `config.referenceText` to a separate STT eval. The [transcription pipeline guide](/docs/guides/evaluate-elevenlabs/#part-3-speech-to-text-accuracy) shows both configs and an assertion using `context.providerResponse.metadata.wer`.

### Agent Regression Testing

Ensure agent improvements don't degrade performance:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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
        - id: confirmation_requested
          name: confirmation_requested
          description: Agent asks for confirmation before canceling
          weight: 1.0
          passingThreshold: 0.9
        - id: professional_tone
          name: professional_tone
          description: Agent maintains professional tone
          weight: 0.8
          passingThreshold: 0.8

tests:
  - description: Agent handles cancellation properly
    assert:
      - type: javascript
        value: |
          const results = context.providerResponse.metadata?.evaluationResults;
          const required = ['confirmation_requested', 'professional_tone'];
          return Array.isArray(results) && required.every(id =>
            results.some(result => result.criterion === id && result.passed === true)
          );
```

## Best Practices

### 1. Choose the Right Model

- **Flash v2.5**: Use for real-time applications, live streaming, or when latency is critical (&lt;200ms)
- **Turbo v2.5**: Keep for legacy comparisons; [ElevenLabs recommends Flash for new configurations](https://elevenlabs.io/docs/overview/models#deprecated-models)
- **Multilingual v2**: Use for non-English languages or when switching between languages

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
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
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
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
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
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
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

**Check TTS latency, estimated cost, and audio metadata:**

```yaml
prompts:
  - 'Check the generated audio format and size.'

providers:
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
    config:
      modelId: eleven_flash_v2_5
      outputFormat: pcm_16000

tests:
  - assert:
      # Latency thresholds
      - type: latency
        threshold: 2000

      # Cost budgets
      - type: cost
        threshold: 0.50

      # Audio metadata
      - type: javascript
        value: |
          const response = context.providerResponse;
          return response.audio?.format === 'pcm'
            && Number.isFinite(response.metadata?.audioSize)
            && response.metadata.audioSize > 0;
```

**Use labels for organized results:**

```yaml
providers:
  - label: v1-baseline
    id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
    config:
      modelId: eleven_flash_v2_5

  - label: v2-improved
    id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
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
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
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

Solution: Use a voice ID (voice names are not resolved):

```yaml
providers:
  # Use the official voice ID from your voice library
  - id: elevenlabs:tts:21m00Tcm4TlvDq8ikWAM
```

List available voices:

```sh
curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices
```

### Cost Tracking Inaccuracies

**Issue: Cost estimates don't match billing**

Solution: Cost tracking is estimated based on:

- TTS: Character count × model rate
- STT: Known audio duration × per-minute rate; omitted when duration is unavailable
- Agents: Conversation duration × LLM rates

For exact costs, check your [ElevenLabs billing dashboard](https://elevenlabs.io/app/usage).

## Examples

Complete working examples:

- [TTS Basic](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-elevenlabs/tts) - Simple voice generation
- [TTS Advanced](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-elevenlabs/tts-advanced) - Voice design, streaming, pronunciation
- [STT](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-elevenlabs/stt) - Transcription with diarization
- [Agents Basic](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-elevenlabs/agents) - Simple agent testing

## Learn More

### Promptfoo Resources

- [Evaluating ElevenLabs voice AI](/docs/guides/evaluate-elevenlabs/) - Step-by-step tutorial

### ElevenLabs Resources

- [ElevenLabs API Documentation](https://elevenlabs.io/docs/introduction)
- [Voice Library](https://elevenlabs.io/voice-library) - Browse and preview voices
- [Conversational AI Docs](https://elevenlabs.io/docs/conversational-ai) - Agent setup guide
- [Pricing](https://elevenlabs.io/pricing) - Plan comparison
- [Status Page](https://status.elevenlabs.io/) - API status and incidents
