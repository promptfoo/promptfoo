# simulated-voice-user (Bidirectional GPT-Live Conversations)

Run a cafe agent and simulated caller as two continuously connected GPT-Live sessions.

## Run

```bash
npx promptfoo@latest init --example simulated-voice-user
cd simulated-voice-user
# Set OPENAI_API_KEY to an existing project key with GPT-Live access.
npx promptfoo@latest eval --no-cache -o results.json
```

Each scenario creates two paid voice sessions. The caller asks two questions; assertions check the target's answers and confirm both sides heard speech and returned final usage. The stereo recording preserves simultaneous speech and silence: target on the left, caller on the right.

The configured 30-second capture is a time limit, not a semantic success detector. The example tests two configured voice prompts, not a deployed telephone or WebRTC agent. See the [provider documentation](https://www.promptfoo.dev/docs/providers/simulated-voice-user/) for credentials, deadlines, delegation, and result metadata.
