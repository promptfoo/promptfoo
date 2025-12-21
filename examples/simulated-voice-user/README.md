# simulated-voice-user (Testing Realtime Voice Agents)

This example demonstrates how to use the `promptfoo:simulated-voice-user` provider to test realtime voice agents using bidirectional audio streaming.

## How It Works

The simulated voice user provider creates a conversation between:

1. **Target Agent** - The voice agent you're testing (e.g., a customer service bot)
2. **Simulated User** - An AI-powered voice user that follows instructions to achieve goals

Both participants use realtime voice APIs (OpenAI Realtime or Google Live) to stream audio bidirectionally, creating realistic voice conversations.

## Prerequisites

You'll need an API key for at least one supported voice provider:

- **OpenAI Realtime API**: Set `OPENAI_API_KEY` environment variable
- **Google Live API**: Set `GOOGLE_API_KEY` environment variable

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

| Option           | Description                             | Default                   |
| ---------------- | --------------------------------------- | ------------------------- |
| `targetProvider` | Voice API provider (`openai`, `google`) | `openai`                  |
| `targetModel`    | Model to use                            | `gpt-4o-realtime-preview` |
| `targetVoice`    | Voice for the agent                     | `alloy`                   |

### Simulated User Settings

| Option                  | Description                         | Default                   |
| ----------------------- | ----------------------------------- | ------------------------- |
| `simulatedUserProvider` | Voice API provider                  | `openai`                  |
| `simulatedUserModel`    | Model for simulated user            | `gpt-4o-realtime-preview` |
| `simulatedUserVoice`    | Voice for simulated user            | `echo`                    |
| `instructions`          | Goal/persona for the simulated user | Required                  |

### Conversation Settings

| Option              | Description                                  | Default  |
| ------------------- | -------------------------------------------- | -------- |
| `maxTurns`          | Maximum conversation turns                   | `10`     |
| `timeoutMs`         | Maximum conversation duration (ms)           | `120000` |
| `targetSpeaksFirst` | Whether target agent starts the conversation | `true`   |

### Audio Settings

| Option        | Description                                      | Default |
| ------------- | ------------------------------------------------ | ------- |
| `audioFormat` | Audio format (`pcm16`, `g711_ulaw`, `g711_alaw`) | `pcm16` |
| `sampleRate`  | Audio sample rate in Hz                          | `24000` |

### Turn Detection (VAD)

| Option               | Description                                 | Default      |
| -------------------- | ------------------------------------------- | ------------ |
| `turnDetectionMode`  | Mode (`server_vad`, `client_vad`, `manual`) | `server_vad` |
| `silenceThresholdMs` | Silence duration to detect turn end         | `500`        |
| `vadThreshold`       | Voice activity detection sensitivity        | `0.5`        |

## Writing Test Goals

The simulated user follows the `instructions` to conduct the conversation. Write goals that:

1. Describe the user's persona and objective
2. Include any specific information they should provide
3. Indicate when the conversation should end

The simulated user will say `###STOP###` when the goal is achieved or the conversation should end.

## Output Format

The provider returns:

- **Transcript**: Full conversation text
- **Turns**: Array of individual turns with speaker and text
- **Metadata**: Duration, turn count, stop reason
- **Audio**: Base64-encoded WAV files of both participants (when available)

## Use Cases

- Testing customer service voice bots
- Red-teaming voice AI systems
- Voice-based prompt injection testing
- Evaluating voice agent safety and helpfulness
