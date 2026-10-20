# google-live (Gemini 3.8 Live)

Compare Gemini 3.8 Live and Extended Thinking by grading their spoken-response transcripts.

## Run

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` to your [Google AI Studio API key](https://aistudio.google.com/apikey), then run:

```bash
npx promptfoo@latest init --example google-live
cd google-live
npx promptfoo@latest eval --no-cache -j 1
npx promptfoo@latest view
```

Both models return audio and a transcript in `output.text`. Extended Thinking defaults to `LOW` and waits for background reasoning to finish before grading.

See the [Google Live provider docs](https://www.promptfoo.dev/docs/providers/google/#google-live-api) for audio input, multi-turn conversations, and tools.
