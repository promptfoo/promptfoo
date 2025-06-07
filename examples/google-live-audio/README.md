# google-live-audio (Google Live API Audio Features with Gemini)

These examples demonstrate how to use promptfoo with Google's WebSocket-based Live API for audio capabilities, showcasing multimodal interactions with Gemini models.

You can run this example with:

```bash
npx promptfoo@latest init --example google-live-audio
```

These examples demonstrate how to use promptfoo with Google's WebSocket-based Live API for audio capabilities, showcasing multimodal interactions with Gemini models.

1. Simple audio generation
2. Audio with affective dialog (emotion adaptation)

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as the environment variable `GOOGLE_API_KEY`

You can obtain a Google AI Studio API key from the [Google AI Studio website](https://ai.google.dev/).

## Running the Examples

After running any evaluation, you can view the results by running:

```bash
promptfoo view
```

### Simple Audio Generation Example

The basic configuration in `promptfooconfig.yaml` demonstrates simple audio generation with transcription:

```bash
promptfoo eval -c promptfooconfig.yaml
```

### Affective Dialog Example

The affective dialog configuration in `promptfooconfig.audio-affective.yaml` demonstrates emotion-aware audio responses:

```bash
promptfoo eval -c promptfooconfig.audio-affective.yaml -j 3
```

> Note: Rate limits of 3 concurrent sessions per API key apply to Gemini 2.5 flash with native audio models, which is why we use `-j 3` to limit concurrency.


For more information about the Google Live API and audio capabilities, see the [Google AI Speech Generation documentation](https://ai.google.dev/gemini-api/docs/speech-generation).
