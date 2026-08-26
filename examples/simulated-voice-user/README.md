# simulated-voice-user (Testing Realtime Voice Agents)

This example demonstrates how to use the `promptfoo:simulated-voice-user` provider to test realtime voice agents using bidirectional audio streaming.

## How It Works

The simulated voice user provider creates a conversation between:

1. **Target Agent** - The voice agent you're testing (e.g., a customer service bot)
2. **Simulated User** - An AI-powered voice user that follows instructions to achieve goals

Both participants use realtime voice APIs (OpenAI Realtime, Google Live, or Amazon Nova Sonic) to stream audio bidirectionally, creating realistic voice conversations.

## Prerequisites

You'll need an API key for at least one supported voice provider:

- **OpenAI Realtime API**: Set `OPENAI_API_KEY` environment variable
- **Google Live API**: Set `GOOGLE_API_KEY` environment variable
- **Amazon Nova Sonic**: Configure AWS credentials in your environment

## Running the Example

```bash
# Initialize the example
npx promptfoo@latest init --example simulated-voice-user

# Set your API key
export OPENAI_API_KEY=your-api-key

# Run the evaluation
npx promptfoo@latest eval
```

## Configuration Options

### Target Agent Settings

| Option           | Description                                        | Default          |
| ---------------- | -------------------------------------------------- | ---------------- |
| `targetProvider` | Voice API provider (`openai`, `google`, `bedrock`) | `openai`         |
| `targetModel`    | Model to use                                       | Provider default |
| `targetVoice`    | Voice for the agent                                | Provider default |

### Simulated User Settings

| Option                  | Description                                        | Default          |
| ----------------------- | -------------------------------------------------- | ---------------- |
| `simulatedUserProvider` | Voice API provider (`openai`, `google`, `bedrock`) | `openai`         |
| `simulatedUserModel`    | Model for simulated user                           | Provider default |
| `simulatedUserVoice`    | Voice for simulated user                           | Provider default |
| `instructions`          | Goal/persona for the simulated user                | Required         |

### Conversation Settings

| Option               | Description                                                                 | Default            |
| -------------------- | --------------------------------------------------------------------------- | ------------------ |
| `maxTurns`           | Maximum completed speaker utterances                                        | `10`               |
| `timeoutMs`          | Maximum conversation duration (ms)                                          | `120000`           |
| `targetSpeaksFirst`  | Whether target agent starts the conversation; Nova defaults to caller-first | `true` except Nova |
| `recordConversation` | Whether to include recorded audio output                                    | `true`             |

### Audio Settings

| Option        | Description                                      | Default |
| ------------- | ------------------------------------------------ | ------- |
| `audioFormat` | Audio format (`pcm16`, `g711_ulaw`, `g711_alaw`) | `pcm16` |
| `sampleRate`  | PCM16 audio sample rate in Hz                    | `24000` |

Use `pcm16` whenever either endpoint is Google Live or Amazon Nova Sonic. G.711 audio is
available only when both local endpoints use OpenAI Realtime and always runs at its fixed
8 kHz transport rate.

### Turn Detection (VAD)

| Option               | Description                                | Default      |
| -------------------- | ------------------------------------------ | ------------ |
| `turnDetectionMode`  | Mode (`server_vad`, `silence`, `hybrid`)   | `server_vad` |
| `silenceThresholdMs` | Silence duration to detect turn end        | `500`        |
| `vadThreshold`       | Local voice activity detection sensitivity | `0.02`       |

## Writing Test Goals

The simulated user follows the `instructions` to conduct the conversation. Write goals that:

1. Describe the user's persona and objective
2. Include any specific information they should provide
3. Indicate when the conversation should end

The simulated user will say `###STOP###` when the goal is achieved or the conversation should end. Only the simulated caller's stop marker completes the evaluation successfully.

## Output Format

The provider returns:

- **Transcript**: Full conversation text
- **Turns**: Array of individual turns with speaker and text
- **Metadata**: Duration, turn count, stop reason
- **Audio**: One base64-encoded stereo WAV recording, with agent audio on the left channel and caller audio on the right (when recording is enabled)

## Use Cases

- Testing customer service voice bots
- Red-teaming voice AI systems
- Voice-based prompt injection testing
- Evaluating voice agent safety and helpfulness
