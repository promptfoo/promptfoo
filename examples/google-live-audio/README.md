# google-live-audio (Gemini Live API)

Grade a spoken answer and its transcript with one Gemini Live request.

## Run the eval

Set `GOOGLE_API_KEY` to your [Google AI Studio API key](https://aistudio.google.com/apikey), then run:

```bash
npx promptfoo@latest init --example google-live-audio
cd google-live-audio
npx promptfoo@latest eval
```

The assertions check the returned audio and grade the transcript at `output.text`. See the [Google Live provider docs](https://www.promptfoo.dev/docs/providers/google/#google-live-api) for configuration.
