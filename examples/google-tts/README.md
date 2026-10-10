# google-tts (Gemini Speech Generation)

Compare Gemini 3.8 Flash TTS and Flash-Lite TTS. Both return WAV audio. The text is spoken verbatim; delivery instructions go in `speechMetadata.style`.

## Run the example

```bash
npx promptfoo@latest init --example google-tts
cd google-tts
export GEMINI_API_KEY=your_api_key
npx promptfoo@latest eval
```

To use a different prebuilt or existing stored voice, set `config.generationConfig.speechConfig.voiceConfig.voice`. Add `config.streaming: true` for streaming synthesis. Promptfoo assembles the resulting PCM chunks into WAV audio.

For Vertex, replace the IDs with `vertex:gemini-3.8-flash-tts` and `vertex:gemini-3.8-flash-lite-tts`, set `config.region: global` and `config.projectId`, and authenticate with Google Cloud ADC. These models are Preview on Vertex and require project access.

See the [Google provider documentation](https://www.promptfoo.dev/docs/providers/google/#text-to-speech) and [Google model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations) for current configuration and availability.
