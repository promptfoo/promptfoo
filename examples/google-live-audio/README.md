# google-live-audio (Google Live API Audio Features with Gemini)

These examples demonstrate how to use promptfoo with Google's WebSocket-based Live API for audio capabilities, showcasing multimodal interactions with Gemini models. The examples include three configurations:

1. Simple audio generation
2. Audio with affective dialog (emotion adaptation)
3. Audio with different voice options

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

This example shows how to:

- Generate audio responses from text prompts
- Access the audio transcript in assertions
- Verify that audio was successfully generated

### Affective Dialog Example

The affective dialog configuration in `promptfooconfig.audio-affective.yaml` demonstrates emotion-aware audio responses:

```bash
promptfoo eval -c promptfooconfig.audio-affective.yaml -j 3
```

This example compares:

- Responses with affective dialog enabled (adapts tone to match input emotion)
- Regular audio responses without affective adaptation
- Uses `gemini-2.5-flash-exp-native-audio-thinking-dialog` model which shows the thinking process

> Note: Rate limits of 3 concurrent sessions per API key apply to Gemini 2.5 flash with native audio models, which is why we use `-j 3` to limit concurrency.

### Voice Options Example

The voices configuration in `promptfooconfig.audio-voices.yaml` demonstrates different voice personalities:

```bash
promptfoo eval -c promptfooconfig.audio-voices.yaml
```

Available voices include:

- Puck
- Charon
- Kore
- Fenrir
- Aoede
- Leda
- Orus
- Zephyr

For more information about the Google Live API and audio capabilities, see the [Google AI documentation](/docs/providers/google).
