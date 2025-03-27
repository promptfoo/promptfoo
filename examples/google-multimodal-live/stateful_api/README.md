# google-multimodal-live (Google Multimodal Live API with Gemini)

This example demonstrates how to use promptfoo with Google's WebSocket-based Multimodal Live API, which enables low-latency bidirectional interactions with Gemini models. The example includes three different configurations:

1. Basic query demonstration
2. Multiline conversation demonstration
3. Function calling and built-in tools demonstration

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`

You can obtain a Google AI Studio API key from the [Google AI Studio website](https://ai.google.dev/).

## Running the Examples

You can run this example with:

```bash
npx promptfoo@latest init --example google-multimodal-live
```

## With a spawned stateful python api we also require python configuration

Ensure that python3 is installed and in your PATH. I.e. when you run:

```bash
which python3
```

it returns a python3 version.
