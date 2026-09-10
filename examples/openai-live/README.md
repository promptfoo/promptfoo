# openai-live (OpenAI GPT-Live)

Evaluate spoken answers from `gpt-live-1`, with a separate Responses backend for delegated work.

## Run the example

```sh
npx promptfoo@latest init --example openai-live
cd openai-live
export OPENAI_API_KEY=your_project_api_key
npx promptfoo@latest eval --no-cache -o results.json
```

The key needs access to the Live API and configured backend model. The example sends a text question as startup history and records 30 seconds of output while streaming silence. Each eval opens a new session; voice duration and backend model usage are billed separately.

The assertion checks the assistant transcript for `Paris`. Inspect the exported transcript, audio, `metadata.voiceSeconds`, and `metadata.finalUsageConfirmed` as well. A transcript assertion does not verify pronunciation or uninterrupted playback.

## Use recorded audio

The included `audio-prompt.json` accepts a base64 WAV variable.

Change `prompts` to `['file://audio-prompt.json']` and add `vars: { audio: 'file://sample.wav' }` to the test. Supply your own recording asking the same question: mono PCM16 WAV at 24 kHz. The provider replays the clip at its recorded speed, then streams silence for `responseWindowMs`.

Increase the response window for longer answers or backend work. Live does not emit a speech-completed event, so the capture has a fixed duration. Compressed audio, mismatched sample rates, WebRTC/SIP, and persistent sessions are not supported by this provider.

See [provider configuration and delegation handlers](https://www.promptfoo.dev/docs/providers/openai-live/).

From a Promptfoo checkout, run the local code from the repository root:

```sh
npm run local -- eval -c examples/openai-live/promptfooconfig.yaml --no-cache -o results.json
```
