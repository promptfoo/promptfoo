# simulated-voice-user (Voice conversations)

Evaluate a customer-service prompt with a simulated caller. Assertions grade the conversation transcript; optional stereo audio records the agent on the left and caller on the right.

## Setup

```bash
npx promptfoo@latest init --example simulated-voice-user
cd simulated-voice-user
export OPENAI_API_KEY=your-api-key
npx promptfoo@latest eval
```

The example uses OpenAI Realtime for both endpoints. Provider `env` overrides apply to both connections; `targetApiKey` and `simulatedUserApiKey` can set separate credentials.

Set `instructions` to the caller's goal, `maxTurns` to the maximum number of speaker utterances, and `timeoutMs` to the conversation deadline, including setup. The caller can end the conversation by saying `###STOP###`. Only a caller stop marker marks the goal as achieved; assertions still determine whether the eval passes.

OpenAI transports PCM16 at 24 kHz and G.711 at 8 kHz. `sampleRate` sets the PCM recording rate. `recordConversation: false` omits the recording.

See the [provider configuration](https://promptfoo.dev/docs/providers/simulated-voice-user/) for endpoint, model, voice, turn detection, and output options.
