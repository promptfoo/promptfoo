# provider-oruk (Oruk Fourier 2B Speech-to-Text)

Evaluate English speech-to-text transcription accuracy with Oruk's `oruk-fourier-2b` model using Promptfoo's OpenAI-compatible transcription provider.

## Usage

```bash
npx promptfoo@latest init --example provider-oruk
cd provider-oruk
```

Create an API key from [Oruk](https://oruk.ai) and set `ORUK_API_KEY` in your environment, then run:

```bash
export ORUK_API_KEY=your-key-here
npx promptfoo@latest eval
```

From the Promptfoo repository root, run against the local build:

```bash
export ORUK_API_KEY=your-key-here
npm run local -- eval -c examples/provider-oruk/promptfooconfig.yaml --no-cache
```

`sample-audio.mp3` is bundled in this directory and resolved via `audio-path.mjs`, so the example runs out of the box from either location. Replace `audio_file` with any local English WAV, MP3, FLAC, OGG, or M4A recording (up to 30 MiB / 60 minutes) and update `reference` to test your own recordings.

Uncomment the `openai:transcription:gpt-4o-transcribe` block in `promptfooconfig.yaml` (and set `OPENAI_API_KEY`) to benchmark Oruk Fourier 2B side by side against OpenAI transcription on the same recordings.

See the [Oruk provider guide](https://www.promptfoo.dev/docs/providers/oruk/) for configuration options and supported parameters.
