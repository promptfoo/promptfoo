# provider-oruk (Oruk Fourier 2B Speech-to-Text)

Evaluate English speech-to-text transcription accuracy with Oruk's `oruk-fourier-2b` model using promptfoo's OpenAI-compatible transcription provider.

## Usage

```bash
npx promptfoo@latest init --example provider-oruk
cd provider-oruk
```

Create an API key from [Oruk](https://oruk.ai) and set `ORUK_API_KEY` in your environment.

If running from the repository root, the default config uses the sample recording in `examples/openai-audio-transcription/sample-audio.mp3`:

```bash
export ORUK_API_KEY=your-key-here
npm run local -- eval -c examples/provider-oruk/promptfooconfig.yaml --no-cache
```

If running from a standalone initialized directory, replace `audio_file` in `promptfooconfig.yaml` with the path to a local English WAV, MP3, FLAC, OGG, or M4A recording (up to 30 MiB / 60 minutes) and update `reference`, then run:

```bash
npx promptfoo@latest eval
```

Uncomment the `openai:transcription:gpt-4o-transcribe` block in `promptfooconfig.yaml` (and set `OPENAI_API_KEY`) to benchmark Oruk Fourier 2B side by side against OpenAI transcription on the same recordings.

See the [Oruk provider guide](https://www.promptfoo.dev/docs/providers/oruk/) for configuration options and supported parameters.
