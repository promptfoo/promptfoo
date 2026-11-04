# google-live-audio (Google Live API Audio with Gemini)

This example evaluates audio and text transcripts from `gemini-3.8-live`. The older 3.1 Flash Live preview has an earliest announced shutdown date of November 17, 2026; check the [Gemini API lifecycle](https://ai.google.dev/gemini-api/docs/deprecations) for changes.

You can run this example with:

```bash
npx promptfoo@latest init --example google-live-audio
cd google-live-audio
```

## Prerequisites

- Google AI Studio API key set as the environment variable `GOOGLE_API_KEY`

You can obtain a Google AI Studio API key from the [Google AI Studio website](https://ai.google.dev/).

## Running the Example

```bash
promptfoo eval -c promptfooconfig.yaml
```

View the results:

```bash
promptfoo view
```

For more information about the Google Live API, see the [Google Live API documentation](https://ai.google.dev/gemini-api/docs/live).
